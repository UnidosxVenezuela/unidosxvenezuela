'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Cuenta el tiempo de sesión ACTIVO (no solo la pestaña abierta): cada minuto
 * cuenta como "activo" si la pestaña está visible y hubo interacción reciente
 * (mouse, teclado, scroll, toque). Acumula y descarga al servidor en bloques.
 * El tope de 24h/día lo aplica la base de datos.
 */
const INACTIVIDAD_MS = 90_000;   // sin interacción > 90s = ocioso, no cuenta
const FLUSH_CADA_MIN = 5;        // descarga al servidor cada 5 min activos

export default function RegistrarActividad() {
  useEffect(() => {
    const supabase = createClient();
    let ultimaInteraccion = Date.now();
    let minutosActivos = 0;

    const marcar = () => { ultimaInteraccion = Date.now(); };
    const eventos: (keyof DocumentEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'visibilitychange'];
    eventos.forEach((ev) => document.addEventListener(ev, marcar, { passive: true }));

    const flush = () => {
      if (minutosActivos <= 0) return;
      const min = minutosActivos;
      minutosActivos = 0;
      supabase.rpc('sumar_horas_sesion', { p_minutos: min }).then(() => {}, () => {});
    };

    const tick = setInterval(() => {
      const activo = document.visibilityState === 'visible' && (Date.now() - ultimaInteraccion) < INACTIVIDAD_MS;
      if (activo) {
        minutosActivos += 1;
        if (minutosActivos >= FLUSH_CADA_MIN) flush();
      }
    }, 60_000);

    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      clearInterval(tick);
      eventos.forEach((ev) => document.removeEventListener(ev, marcar));
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);
  return null;
}
