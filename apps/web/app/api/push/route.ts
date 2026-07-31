// Route Handler que ENVÍA la notificación push cuando Supabase inserta una fila
// en `notificaciones` (el mismo trigger que alimenta la campana). Lo dispara un
// Database Webhook de Supabase (Database → Webhooks) con la cabecera
// `x-webhook-secret`. Corre en Node (web-push usa crypto de Node) y usa la
// service_role para leer las suscripciones (SOLO en el servidor).
import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FilaNotificacion = {
  destinatario_id?: string;
  titulo?: string;
  cuerpo?: string | null;
  enlace?: string | null;
  tipo?: string | null;
  imagen_url?: string | null;
};

export async function POST(req: Request) {
  const secreto = process.env.PUSH_WEBHOOK_SECRET;
  if (!secreto || req.headers.get('x-webhook-secret') !== secreto) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  // VAPID solo condiciona el CANAL WEB-PUSH. Antes se devolvía 500 aquí y, con ello,
  // Telegram (que es un canal independiente) no se enviaba NUNCA si faltaban las claves.
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const hayVapid = !!(pub && priv);
  if (hayVapid) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:soporte@unidosxvnezuela.com',
      pub!,
      priv!,
    );
  } else {
    console.error('[push] VAPID sin configurar: se omite el web-push (Telegram sigue saliendo)');
  }

  let payload: { record?: FilaNotificacion } | null = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'json inválido' }, { status: 400 });
  }
  const registro = payload?.record;
  if (!registro?.destinatario_id) {
    return NextResponse.json({ ok: true, enviadas: 0 });
  }

  const admin = createAdminClient();

  // ── Canal 1: web-push (VAPID → service worker) ── Aislado en su propio try/catch: un
  // fallo suyo NO debe impedir el envío por Telegram, y tampoco debe devolver 500 (eso
  // haría que Supabase reintentara el webhook y duplicara los avisos ya entregados).
  let enviadas = 0;
  if (hayVapid) {
    try {
      const { data: subs, error } = await admin
        .from('push_suscripciones')
        .select('endpoint, p256dh, auth')
        .eq('perfil_id', registro.destinatario_id);
      if (error) throw new Error(error.message);

      if (subs && subs.length > 0) {
        const carga = JSON.stringify({
          title: registro.titulo || 'Apoyo por Venezuela',
          body: registro.cuerpo || '',
          url: registro.enlace || '/notificaciones',
          tag: registro.tipo || 'aviso',
          image: registro.imagen_url || undefined,   // avisos con imagen (0170)
        });

        const caducadas: string[] = [];
        await Promise.all(
          (subs as Array<{ endpoint: string; p256dh: string; auth: string }>).map(async (s) => {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                carga,
              );
              enviadas++;
            } catch (e) {
              const cod = (e as { statusCode?: number })?.statusCode;
              if (cod === 404 || cod === 410) caducadas.push(s.endpoint);
            }
          }),
        );

        if (caducadas.length) {
          await admin.from('push_suscripciones').delete().in('endpoint', caducadas);
        }
      }
    } catch (e) {
      console.error('[push] fallo el canal web-push:', (e as Error)?.message ?? e);
    }
  }

  // ── Canal 2: Telegram (si la persona lo vinculó) ── best-effort. Corre aunque
  // no haya suscripción push. El try/catch es OBLIGATORIO: si Telegram fallara y
  // devolviéramos 500, Supabase reintentaría el webhook → push duplicado. El
  // push es la garantía; Telegram es adicional.
  let telegram: 'enviado' | 'sin-vincular' | 'fallo' | 'omitido' = 'omitido';
  try {
    const { data: p, error: eP } = await admin
      .from('perfiles')
      .select('telegram_chat_id')
      .eq('id', registro.destinatario_id)
      .maybeSingle();
    if (eP) throw new Error(eP.message);
    const chatId = (p as { telegram_chat_id?: string | null } | null)?.telegram_chat_id;
    if (!chatId) {
      telegram = 'sin-vincular';
    } else {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
      const enlace = registro.enlace || '/notificaciones';
      const url = base ? base.replace(/\/$/, '') + enlace : undefined;
      const r = await enviarTelegram(chatId, registro.titulo || 'Apoyo por Venezuela', registro.cuerpo ?? '', url, registro.imagen_url ?? null);
      telegram = r.ok ? 'enviado' : 'fallo';
    }
  } catch (e) {
    // Telegram nunca debe romper el push ni forzar reintento del webhook.
    telegram = 'fallo';
    console.error('[telegram] no se pudo enviar el aviso:', (e as Error)?.message ?? e);
  }

  return NextResponse.json({ ok: true, enviadas, push: hayVapid ? 'ok' : 'sin-vapid', telegram });
}
