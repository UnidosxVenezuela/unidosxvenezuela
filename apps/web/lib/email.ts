// Envío de correos transaccionales e institucionales con Resend (SOLO servidor).
// La API key se lee de RESEND_API_KEY (env de Vercel) — NUNCA en el repo.
//
// ANTES (hasta 0217) esta función devolvía `void` y empezaba con `if (!API_KEY) return;`:
// sin la clave configurada, el envío se daba por bueno en SILENCIO y el `catch` solo
// escribía en consola. No había forma de saber si un correo salió o no.
//
// AHORA devuelve `{ ok, id?, error? }` —mismo molde que `lib/telegram.ts`, que devuelve
// `{ ok, statusCode, error? }`— y NUNCA lanza: el llamador (best-effort) decide qué
// hacer. Los cuatro call-sites históricos de `admin/usuarios/actions.ts` (l. 111, 201,
// 362 y 544) IGNORAN el retorno, así que el cambio de firma es compatible.
//
// El registro de lo enviado NO vive aquí, sino en `correo_envios` (0217): la fila se
// crea ANTES de llamar a esta función y se cierra con su resultado. Ver
// `app/(app)/alianzas/correo/actions.ts`.
import { Resend } from 'resend';
import { esEmailInternoWhatsapp } from './whatsapp';

const API_KEY = process.env.RESEND_API_KEY;
// Hasta verificar un dominio propio en Resend, 'onboarding@resend.dev' solo
// puede enviar al correo dueño de la cuenta. Configura RESEND_FROM con tu dominio.
const FROM = process.env.RESEND_FROM || 'Apoyo por Venezuela <onboarding@resend.dev>';

/** Resultado de un intento de envío. `id` es el identificador del mensaje en Resend
 *  (sirve para rastrear el correo en su panel). Nunca se lanza una excepción. */
export type ResultadoEmail = { ok: boolean; id?: string; error?: string };

export function emailActivo(): boolean {
  return !!API_KEY;
}

// Re-exportado desde aquí para que quien redacte un correo tenga a mano el escapador
// sin importar otro módulo. La implementación única vive en `lib/texto.ts`.
export { escaparHtml } from './texto';

/**
 * Envía un correo. No lanza: devuelve `{ ok, id?, error? }`.
 *
 * Descarta de entrada los correos internos de WhatsApp (`wa<dígitos>@wa.…`, ver
 * `lib/whatsapp.ts`): son direcciones sintéticas para poder iniciar sesión con el
 * número, no buzones reales. Enviarles algo es un rebote garantizado que además
 * castiga la reputación del dominio.
 */
export async function enviarEmail(opts: { to: string; subject: string; html: string }): Promise<ResultadoEmail> {
  const to = (opts.to ?? '').trim();
  if (!to) return { ok: false, error: 'sin destinatario' };
  // En MINÚSCULAS: `esEmailInternoWhatsapp` compara el dominio literal, y un correo
  // escrito con mayúsculas se colaría (el rebote sí llegaría igual).
  if (esEmailInternoWhatsapp(to.toLowerCase())) {
    return { ok: false, error: 'destinatario interno de WhatsApp (no recibe correo)' };
  }
  if (!API_KEY) return { ok: false, error: 'falta RESEND_API_KEY' };

  try {
    const { data, error } = await new Resend(API_KEY).emails.send({
      from: FROM,
      to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      console.error('[email] Resend rechazó el envío: %s', error.message ?? error.name ?? '');
      return { ok: false, error: error.message ?? error.name ?? 'rechazado por Resend' };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    // No interrumpimos la acción del usuario si el correo falla.
    const msg = (e as Error)?.message ?? 'fallo de red';
    console.error('[email] no se pudo enviar: %s', msg);
    return { ok: false, error: msg };
  }
}
