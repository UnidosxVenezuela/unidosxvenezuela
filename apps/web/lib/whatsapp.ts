// Utilidades de WhatsApp compartidas (cliente y servidor): normalización del
// número y correo interno determinístico para cuentas sin correo (login por
// número). Funciones PURAS, sin dependencias de servidor — se pueden importar
// desde componentes cliente.

/** Solo dígitos, con código de país. Devuelve null si no parece un número válido. */
export function normalizarWhatsapp(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length >= 7 && d.length <= 15 ? d : null;
}

// Dominio interno (NUNCA se envían correos aquí). El correo se deriva del número
// para poder iniciar sesión con el WhatsApp, sin almacenar un alias aparte.
const DOMINIO_WA = 'wa.unidosxvnezuela.com';

/** Correo interno determinístico para una cuenta creada con WhatsApp. */
export function emailInternoWhatsapp(digitos: string): string {
  return `wa${digitos}@${DOMINIO_WA}`;
}

/** ¿Es un correo interno de WhatsApp (no un correo real de la persona)? */
export function esEmailInternoWhatsapp(email: string | null | undefined): boolean {
  return !!email && email.endsWith('@' + DOMINIO_WA);
}

/** Para mostrar: +<dígitos>. Vacío si el número no es válido. */
export function mostrarWhatsapp(digitos: string | null | undefined): string {
  const d = normalizarWhatsapp(digitos);
  return d ? '+' + d : '';
}

/** Enlace wa.me con un mensaje opcional prellenado. */
export function linkWaMe(digitos: string, mensaje?: string): string {
  const base = 'https://wa.me/' + digitos;
  return mensaje ? base + '?text=' + encodeURIComponent(mensaje) : base;
}
