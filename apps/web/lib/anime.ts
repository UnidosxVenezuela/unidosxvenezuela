'use client';
// Guardas y helpers compartidos para animar con anime.js v4 respetando la
// accesibilidad. Regla de la plataforma: si el usuario pide menos movimiento,
// NO animamos posición/escala — dejamos el estado final visible.
// (Ver el skill `anime-js` para el detalle de la API v4.)

/** ¿El sistema pide reducir el movimiento? true → no animar transformes. */
export function sinMovimiento(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
