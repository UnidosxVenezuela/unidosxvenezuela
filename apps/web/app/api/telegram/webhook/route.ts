// Webhook del bot de Telegram. Telegram lo llama (POST) en cada mensaje al bot.
// Maneja la VINCULACIÓN (deep-link `/start <token>`) y la DESVINCULACIÓN
// (`/stop`). No usa sesión: opera con service_role (bypassa RLS) tras validar la
// cabecera secreta fijada en `setWebhook?secret_token=…`. Responde SIEMPRE 200
// (salvo el 401 del secreto) para que Telegram no reintente; las réplicas al
// usuario van por `enviarTelegram`.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TgMensaje = {
  text?: string;
  from?: { id?: number; username?: string };
  chat?: { id?: number; type?: string };
};
// Telegram entrega el texto en `message` o, si la persona lo corrige, en `edited_message`.
// Antes solo se miraba `message`: un mensaje editado se ignoraba en silencio.
type TgUpdate = { message?: TgMensaje; edited_message?: TgMensaje };

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: Request) {
  // 1) Autenticidad: cabecera secreta compartida al registrar el webhook.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  let update: TgUpdate | null = null;
  try { update = await req.json(); } catch { return ok(); }

  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id;
  const texto = (msg?.text ?? '').trim();
  // Ignora updates que no traigan texto (callback, entrada/salida de chat, etc.).
  if (chatId == null || !texto) return ok();
  // Solo chats PRIVADOS: vincular desde un grupo ataría la cuenta al chat del grupo y
  // los avisos (personales) acabarían en él.
  const tipoChat = msg?.chat?.type ?? 'private';
  if (tipoChat !== 'private') {
    if (texto.startsWith('/start') || texto.startsWith('/stop')) {
      await enviarTelegram(String(chatId), 'Escríbeme en privado',
        'La vinculación es personal: abre un chat directo conmigo y repite el enlace desde tu perfil en la app.');
    }
    return ok();
  }
  const chat = String(chatId);

  // Comando y argumento: «/start<@bot> <token>».
  const partes = texto.split(/\s+/);
  const cmd = ((partes[0] ?? '').split('@')[0] ?? '').toLowerCase();
  const arg = partes.slice(1).join(' ').trim();

  const admin = createAdminClient();

  // ── Vincular: /start <token> ──
  if (cmd === '/start' && arg) {
    const { data: enlace } = await admin
      .from('telegram_enlaces')
      .select('token, perfil_id, usado_en, expira_en')
      .eq('token', arg)
      .maybeSingle();
    const e = enlace as
      | { token: string; perfil_id: string; usado_en: string | null; expira_en: string }
      | null;
    if (!e || e.usado_en || new Date(e.expira_en).getTime() < Date.now()) {
      await enviarTelegram(chat, 'Enlace no válido o vencido',
        'Genera uno nuevo desde tu perfil en la app (sección «Avisos por Telegram»).');
      return ok();
    }
    const username = msg?.from?.username ? '@' + msg.from.username : null;
    // `.select()` para CONFIRMAR que la fila se actualizó: sin él, un update que no toca
    // ninguna fila respondía «✅ Vinculado» y luego no llegaba ningún aviso.
    const { data: filas, error: upErr } = await admin
      .from('perfiles')
      .update({ telegram_chat_id: chat, telegram_username: username })
      .eq('id', e.perfil_id)
      .select('id');
    if (upErr) {
      // Índice único parcial: este chat ya está en otra cuenta.
      if ((upErr as { code?: string }).code === '23505') {
        await enviarTelegram(chat, 'Este Telegram ya está vinculado a otra cuenta',
          'Escribe /stop para desvincularlo y vuelve a intentarlo.');
        return ok();
      }
      console.error('[telegram] no se pudo vincular el chat:', upErr.message);
      await enviarTelegram(chat, 'No se pudo vincular', 'Inténtalo de nuevo en un momento.');
      return ok();
    }
    if (!filas || filas.length === 0) {
      console.error('[telegram] token válido pero sin perfil que actualizar:', e.perfil_id);
      await enviarTelegram(chat, 'No se pudo vincular',
        'No encontramos tu cuenta. Genera un enlace nuevo desde tu perfil en la app.');
      return ok();
    }
    // Marca el token usado (un solo uso).
    await admin.from('telegram_enlaces')
      .update({ usado_en: new Date().toISOString() })
      .eq('token', e.token);
    await enviarTelegram(chat, '✅ Vinculado',
      'Recibirás aquí los avisos de la plataforma. Escribe /stop para desvincular cuando quieras.');
    return ok();
  }

  // ── /start sin token: cómo vincular ──
  if (cmd === '/start') {
    await enviarTelegram(chat, 'Apoyo por Venezuela',
      'Para recibir avisos aquí: entra a la app → tu perfil → «Avisos por Telegram» → «Vincular Telegram», y abre el enlace que te damos.');
    return ok();
  }

  // ── Desvincular ──
  if (cmd === '/stop' || cmd === '/desvincular') {
    const { data: filas } = await admin.from('perfiles')
      .update({ telegram_chat_id: null, telegram_username: null })
      .eq('telegram_chat_id', chat)
      .select('id');
    // Informa según lo que realmente pasó (antes decía «Desvinculado» aunque este chat
    // no estuviera vinculado a ninguna cuenta, lo que despistaba al diagnosticar).
    if (filas && filas.length > 0) {
      await enviarTelegram(chat, 'Desvinculado',
        'Ya no recibirás avisos por Telegram. Puedes volver a vincular desde tu perfil.');
    } else {
      await enviarTelegram(chat, 'Este chat no estaba vinculado',
        'No había ninguna cuenta enlazada aquí. Para recibir avisos: entra a la app → tu perfil → «Avisos por Telegram».');
    }
    return ok();
  }

  // ── Ayuda ──
  await enviarTelegram(chat, 'Comandos',
    '/start — vincular tu cuenta · /stop — desvincular. La vinculación se inicia desde tu perfil en la app.');
  return ok();
}
