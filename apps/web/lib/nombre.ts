// Privacidad de identidad: por defecto solo se muestra el PRIMER NOMBRE de cada
// persona. El nombre completo (con apellidos) queda reservado para los
// administradores (que supervisan quién hizo qué) y para uno mismo.

/** Primer nombre (primer token) de un nombre completo. */
export function primerNombre(nombre?: string | null): string {
  const s = (nombre ?? '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0] || s;
}

/**
 * Nombre a mostrar. `verCompleto` debe ser verdadero solo cuando el que mira es
 * administrador o es su propio nombre; en cualquier otro caso se ocultan los
 * apellidos y se muestra solo el primer nombre.
 */
export function nombreMostrado(nombre: string | null | undefined, verCompleto: boolean): string {
  if (verCompleto) return (nombre ?? '').trim();
  return primerNombre(nombre);
}
