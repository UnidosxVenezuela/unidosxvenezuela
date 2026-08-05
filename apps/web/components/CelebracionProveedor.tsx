'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Celebracion from './Celebracion';
import {
  PARAM_CELEBRACION,
  celebracionesActivas,
  esEventoCelebracion,
  marcarVista,
  mensajeCelebracion,
  puedeServirVideo,
  siguienteCelebracion,
  type Celebracion as TipoCelebracion,
} from '@/lib/celebraciones';

/**
 * EL DISPARADOR. Va montado una sola vez en `app/(app)/layout.tsx`, junto al
 * <Toast/>, dentro de un <Suspense> (obligatorio: `useSearchParams()` fuerza el
 * bailout a cliente).
 *
 * MECANISMO ELEGIDO — un parámetro de búsqueda, `?celebrar=<evento>`:
 *
 *   `redirigirOk(volver, 'Solicitud entregada.', 'entrega_completada')`
 *        →  /insumos/123?ok=Solicitud%20entregada.&celebrar=entrega_completada
 *
 * POR QUÉ ESE Y NO OTRO:
 *  - Todas las acciones de finalización terminan en `redirigirOk`, que es
 *    `never` (hace `redirect()`): NINGUNA devuelve valor al cliente. El único
 *    canal servidor→cliente que ya existe es la query string.
 *  - No hace falta contexto de React, ni store, ni event bus, ni cookies, ni
 *    tabla nueva: cero infraestructura. Un tercer argumento OPCIONAL en
 *    `redirigirOk` deja intactas las ~198 llamadas que no celebran.
 *  - Sobrevive a la recarga y al «atrás» del navegador sin estado global.
 *  - Se limpia solo (ver abajo), así que no se queda pegado en la URL ni
 *    vuelve a dispararse al recargar.
 *
 * QUIÉN LIMPIA EL PARÁMETRO (esto es lo delicado): el <Toast/> hace
 * `router.replace()` con SU foto de los parámetros. Si dos componentes limpian
 * a la vez, el segundo reescribe lo que borró el primero y el parámetro
 * «revive» (y la celebración se dispararía dos veces). Regla:
 *   - hay `ok`/`err`  → lo borra el <Toast/> en su único `router.replace`
 *                        (un solo escritor, sin carrera). Es el caso normal.
 *   - viene suelto     → lo borra este componente con `history.replaceState`,
 *                        que no invalida el router y no compite con nadie.
 */

type Activa = { celebracion: TipoCelebracion; mensaje: string; ronda: number };

/** Borra `?celebrar=` de la URL sin tocar el router (no invalida ni renavega). */
function limpiarParametro(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM_CELEBRACION)) return;
    url.searchParams.delete(PARAM_CELEBRACION);
    const qs = url.searchParams.toString();
    window.history.replaceState(null, '', url.pathname + (qs ? '?' + qs : '') + url.hash);
  } catch {
    /* si el navegador no deja tocar el historial, se ignora: el guardia de
       arriba impide que la misma señal dispare dos veces */
  }
}

export default function CelebracionProveedor() {
  const params = useSearchParams();
  const [activa, setActiva] = useState<Activa | null>(null);
  const ronda = useRef(0);

  useEffect(() => {
    const crudo = params.get(PARAM_CELEBRACION);
    // Sin señal no se toca nada: una celebración en curso sigue su vida (el
    // <Toast/> cambia la URL justo detrás y este efecto se vuelve a ejecutar).
    if (!crudo) return;

    // Si nadie más va a limpiar, limpiamos nosotros (ver cabecera).
    if (!params.get('ok') && !params.get('err')) limpiarParametro();

    // El valor viene de la URL: no es de fiar hasta validarlo contra la unión.
    if (!esEventoCelebracion(crudo)) return;

    // Preferencia de la persona: si las apagó, aquí se acaba (el toast sigue).
    if (!celebracionesActivas()) return;

    // Con datos limitados o sin soporte de WebM, fuera los vídeos (~1 MB) y a SVG.
    const elegida = siguienteCelebracion(crudo, { permitirVideo: puedeServirVideo() });
    if (!elegida) return;

    marcarVista(elegida.id); // consume la carta de la baraja
    ronda.current += 1;
    setActiva({ celebracion: elegida, mensaje: mensajeCelebracion(crudo), ronda: ronda.current });
  }, [params]);

  if (!activa) return null;
  return (
    <Celebracion
      // `key` por ronda: dos celebraciones seguidas reinician la animación en
      // vez de reutilizar el componente a medio camino.
      key={activa.ronda}
      celebracion={activa.celebracion}
      mensaje={activa.mensaje}
      alCerrar={() => setActiva(null)}
    />
  );
}
