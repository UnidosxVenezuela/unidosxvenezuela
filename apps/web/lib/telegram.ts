// Envío por Telegram (Bot API) — SOLO servidor. Es un `fetch` a `sendMessage`,
// sin dependencias nuevas (a diferencia de web-push). Lo usan la costura de
// `/api/push` (avisos salientes) y el webhook del bot (respuestas al usuario).
//
// Blindaje: `titulo`/`cuerpo` ya son discretos (0123). El botón «Abrir» apunta a
// un deep-link de la app, protegida por RLS; Telegram nunca lleva el dato
// sensible. La función NUNCA lanza: el llamador (best-effort) decide.

const API = 'https://api.telegram.org';

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type ResultadoTelegram = { ok: boolean; statusCode: number; error?: string };

// Una llamada a la Bot API. Devuelve el `description` de Telegram cuando falla, para
// poder DIAGNOSTICAR (antes se perdía el motivo y el aviso desaparecía en silencio).
async function llamar(token: string, metodo: string, cuerpo: Record<string, unknown>): Promise<ResultadoTelegram> {
  try {
    const resp = await fetch(`${API}/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      // No colgar el Route Handler si Telegram tarda.
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) return { ok: true, statusCode: resp.status };
    let descripcion = '';
    try {
      const j = (await resp.json()) as { description?: string };
      descripcion = j?.description ?? '';
    } catch { /* respuesta sin JSON */ }
    return { ok: false, statusCode: resp.status, error: descripcion };
  } catch (e) {
    return { ok: false, statusCode: 0, error: (e as Error)?.message ?? 'fallo de red' };
  }
}

// Telegram limita el `caption` de una foto a 1024 caracteres. Recortamos el CUERPO
// en texto plano (antes de escapar y de envolver el título en <b>), para no cortar
// nunca una etiqueta HTML ni una entidad a la mitad. El título (≤120) y el cuerpo
// (≤400) de un aviso caben de sobra; el recorte es solo un cinturón de seguridad.
function armarTexto(titulo: string, cuerpo: string | null | undefined, topeCuerpo: number): string {
  const t = `<b>${escaparHtml(titulo)}</b>`;
  const c = (cuerpo ?? '').trim();
  if (!c) return t;
  const recortado = c.length > topeCuerpo ? c.slice(0, Math.max(0, topeCuerpo - 1)) + '…' : c;
  return `${t}\n\n${escaparHtml(recortado)}`;
}

/**
 * Envía una notificación a un chat de Telegram. Si `url` es absoluta, agrega un
 * botón «Abrir». Si `imagenUrl` es una URL pública, la manda como FOTO con el
 * texto de pie (sendPhoto, caption ≤1024); si no, como mensaje (sendMessage).
 * No lanza: devuelve `{ ok, statusCode, error }`.
 *
 * Si `sendPhoto` falla (imagen privada, firmada y vencida, o que Telegram no puede
 * descargar), REINTENTA como mensaje de texto: el aviso importa más que la foto.
 * Antes, ese fallo hacía desaparecer el aviso entero.
 */
export async function enviarTelegram(
  chatId: string,
  titulo: string,
  cuerpo?: string | null,
  url?: string,
  imagenUrl?: string | null,
): Promise<ResultadoTelegram> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, statusCode: 0, error: 'falta TELEGRAM_BOT_TOKEN' };
  if (!chatId) return { ok: false, statusCode: 0, error: 'sin chat_id' };

  const teclado = url && /^https?:\/\//.test(url)
    ? { inline_keyboard: [[{ text: 'Abrir en la app', url }]] }
    : undefined;

  const comoTexto = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {
      chat_id: chatId, text: armarTexto(titulo, cuerpo, 3500),
      parse_mode: 'HTML', disable_web_page_preview: true,
    };
    if (teclado) c.reply_markup = teclado;
    return c;
  };

  // Con imagen pública: intenta la foto primero.
  if (imagenUrl && /^https?:\/\//.test(imagenUrl)) {
    const conFoto: Record<string, unknown> = {
      chat_id: chatId, photo: imagenUrl,
      caption: armarTexto(titulo, cuerpo, 900), parse_mode: 'HTML',
    };
    if (teclado) conFoto.reply_markup = teclado;
    const r = await llamar(token, 'sendPhoto', conFoto);
    if (r.ok) return r;
    console.error('[telegram] sendPhoto falló (%s): %s — reintento como texto', r.statusCode, r.error ?? '');
  }

  const r = await llamar(token, 'sendMessage', comoTexto());
  if (!r.ok) console.error('[telegram] sendMessage falló (%s): %s', r.statusCode, r.error ?? '');
  return r;
}
