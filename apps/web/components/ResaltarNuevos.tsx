'use client';
import { useEffect, useRef } from 'react';
import { animate } from 'animejs';
import { sinMovimiento } from '@/lib/anime';

/**
 * Resalta con un destello de fondo las filas que APARECEN mientras miras la lista
 * (llegadas por tiempo real, tras `router.refresh()` de RealtimeRefrescar). Ayuda
 * a ver QUÉ cambió sin releer toda la lista.
 *
 * - NO destella en la carga inicial (el observer se conecta después del montaje).
 * - NO destella cuando cambia el contenido interno de una fila existente: solo
 *   cuando se inserta un nodo nuevo con `[data-fila]`.
 * - El destello termina en el color real de la fila (capturado del computed style),
 *   así no hay parpadeo con filas que ya traen fondo (p. ej. avisos sin leer).
 * - Respeta `prefers-reduced-motion`: si se pide menos movimiento, no hace nada
 *   (las señales estáticas —pill "Nuevo", fondo— siguen indicando lo nuevo).
 *
 * Uso: envolver la lista y marcar cada fila con `data-fila`.
 */
export default function ResaltarNuevos({ children, max = 10 }:
  { children: React.ReactNode; max?: number }) {
  const cont = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cont.current;
    if (!el || sinMovimiento() || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver((mutaciones) => {
      const nuevos: HTMLElement[] = [];
      for (const m of mutaciones) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const e = n as HTMLElement;
          if (e.hasAttribute?.('data-fila') && !nuevos.includes(e)) nuevos.push(e);
        });
      }
      nuevos.slice(0, max).forEach((e) => {
        const destino = getComputedStyle(e).backgroundColor || 'rgba(0,0,0,0)';
        animate(e, {
          backgroundColor: ['rgba(37,99,235,.16)', destino],
          duration: 1500,
          ease: 'outQuad',
          onComplete: () => { e.style.backgroundColor = ''; }, // vuelve al fondo definido por CSS/React
        });
      });
    });
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [max]);

  return <div ref={cont} style={{ display: 'contents' }}>{children}</div>;
}
