// Traduce los mensajes de error de Supabase Auth (que vienen en inglés) a
// mensajes claros y amables en español. Pensado para voluntarios que no
// necesariamente entienden inglés ni jerga técnica.
export function mensajeAuth(mensaje: string | undefined | null): string {
  const m = (mensaje ?? '').toLowerCase();
  if (!m) return 'Ocurrió un error. Vuelve a intentarlo en un momento.';

  if (/already\s*(been\s*)?registered|already exists|user already/.test(m))
    return 'Ese correo ya está registrado. Inicia sesión o usa «¿Olvidaste tu contraseña?».';
  if (/invalid login credentials|invalid credentials|invalid grant/.test(m))
    return 'Correo/WhatsApp o contraseña incorrectos. Revísalos e inténtalo otra vez.';
  if (/email not confirmed|not confirmed|email_not_confirmed/.test(m))
    return 'Aún no confirmaste tu correo. Revisa tu bandeja de entrada (y la carpeta de spam) y toca el enlace de confirmación.';
  if (/different from the old|should be different|new password.*old password|same password/.test(m))
    return 'La nueva contraseña debe ser distinta a la anterior.';
  if (/password.*(at least|should be|too short|characters)|weak.?password|short.?password/.test(m))
    return 'La contraseña es demasiado corta. Usa al menos 8 caracteres.';
  if (/rate.?limit|too many|for security purposes|after \d+ second|only request this/.test(m))
    return 'Demasiados intentos seguidos. Espera un momento e inténtalo de nuevo.';
  if (/invalid format|unable to validate email|valid email|invalid email/.test(m))
    return 'El correo no tiene un formato válido. Revisa que esté bien escrito.';
  if (/captcha/.test(m))
    return 'La verificación anti-bot no se completó. Recárgala e inténtalo otra vez.';
  if (/signups? (not allowed|is disabled|are disabled)|disabled/.test(m))
    return 'El registro está temporalmente cerrado. Escríbele a la coordinación para que te den acceso.';
  if (/network|fetch failed|failed to fetch|load failed|timeout|timed out/.test(m))
    return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';

  // Último recurso: mensaje genérico en español (nunca dejamos texto en inglés).
  return 'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.';
}
