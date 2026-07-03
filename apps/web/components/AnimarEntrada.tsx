'use client';
import { useLayoutEffect, useRef } from 'react';
import anime from 'animejs';

/** Anima la entrada (fade + slide) de los elementos `selector` dentro del panel. */
export default function AnimarEntrada({
  children, selector = '.tarjeta',
}: { children: React.ReactNode; selector?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const cont = ref.current;
    if (!cont) return;
    const targets = Array.from(cont.querySelectorAll<HTMLElement>(selector));
    if (!targets.length) return;
    // Respeta la preferencia del sistema: sin movimiento, contenido visible ya.
    const sinMovimiento = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (sinMovimiento) { targets.forEach((t) => { t.style.opacity = '1'; }); return; }
    // Estado inicial antes de pintar → sin parpadeo.
    targets.forEach((t) => { t.style.opacity = '0'; });
    try {
      anime({
        targets,
        opacity: [0, 1],
        translateY: [14, 0],
        delay: anime.stagger(55),
        duration: 480,
        easing: 'easeOutCubic',
      });
    } catch {
      // Si la animación falla, nunca dejamos las tarjetas invisibles.
      targets.forEach((t) => { t.style.opacity = '1'; });
    }
  }, [selector]);

  return <div ref={ref}>{children}</div>;
}
