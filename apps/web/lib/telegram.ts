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

export type ResultadoTelegram = { ok: boolean; statusCode: number };

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
 * No lanza: devuelve `{ ok, statusCode }`.
 */
export async function enviarTelegram(
  chatId: string,
  titulo: string,
  cuerpo?: string | null,
  url?: string,
  imagenUrl?: string | null,
): Promise<ResultadoTelegram> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { ok: false, statusCode: 0 };

  const teclado = url && /^https?:\/\//.test(url)
    ? { inline_keyboard: [[{ text: 'Abrir en la app', url }]] }
    : undefined;

  const usarFoto = !!(imagenUrl && /^https?:\/\//.test(imagenUrl));
  const metodo = usarFoto ? 'sendPhoto' : 'sendMessage';
  const cuerpoJson: Record<string, unknown> = usarFoto
    ? { chat_id: chatId, photo: imagenUrl, caption: armarTexto(titulo, cuerpo, 900), parse_mode: 'HTML' }
    : { chat_id: chatId, text: armarTexto(titulo, cuerpo, 3500), parse_mode: 'HTML', disable_web_page_preview: true };
  if (teclado) cuerpoJson.reply_markup = teclado;

  try {
    const resp = await fetch(`${API}/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpoJson),
      // No colgar el Route Handler si Telegram tarda.
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: resp.ok, statusCode: resp.status };
  } catch {
    return { ok: false, statusCode: 0 };
  }
}
