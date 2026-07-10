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

/**
 * Envía un mensaje a un chat de Telegram. Si `url` es absoluta, agrega un botón
 * «Abrir» que la abre. No lanza: devuelve `{ ok, statusCode }`.
 */
export async function enviarTelegram(
  chatId: string,
  titulo: string,
  cuerpo?: string | null,
  url?: string,
): Promise<ResultadoTelegram> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { ok: false, statusCode: 0 };

  const texto = cuerpo && cuerpo.trim()
    ? `<b>${escaparHtml(titulo)}</b>\n\n${escaparHtml(cuerpo)}`
    : `<b>${escaparHtml(titulo)}</b>`;

  const cuerpoJson: Record<string, unknown> = {
    chat_id: chatId,
    text: texto,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (url && /^https?:\/\//.test(url)) {
    cuerpoJson.reply_markup = { inline_keyboard: [[{ text: 'Abrir en la app', url }]] };
  }

  try {
    const resp = await fetch(`${API}/bot${token}/sendMessage`, {
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
