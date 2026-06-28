// Envío de correos transaccionales con Resend (solo servidor).
// La API key se lee de RESEND_API_KEY (env de Vercel) — NUNCA en el repo.
// Si no está configurada, las funciones no hacen nada (no rompen el flujo).
import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY;
// Hasta verificar un dominio propio en Resend, 'onboarding@resend.dev' solo
// puede enviar al correo dueño de la cuenta. Configura RESEND_FROM con tu dominio.
const FROM = process.env.RESEND_FROM || 'UnidosXVenezuela <onboarding@resend.dev>';

export function emailActivo() {
  return !!API_KEY;
}

export async function enviarEmail(opts: { to: string; subject: string; html: string }) {
  if (!API_KEY) return; // no configurado: no-op
  try {
    await new Resend(API_KEY).emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (e) {
    // No interrumpimos la acción del usuario si el email falla.
    console.error('Resend: no se pudo enviar el correo', e);
  }
}
