'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate } from 'animejs';
import { sinMovimiento } from '@/lib/anime';

/**
 * Revela (fade + slide) los elementos `selector` a medida que entran en la
 * pantalla al hacer scroll — para páginas largas (ayuda, guías). Cada elemento
 * se anima una sola vez. Con `reduced-motion` o sin JS, todo queda visible desde
 * el inicio (no se oculta nada). Envuelve el contenido; `display:contents` no
 * altera el layout.
 */
export default function RevelarScroll({ children, selector = '.tarjeta' }:
  { children: React.ReactNode; selector?: string }) {
  const cont = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = cont.current;
    if (!el || sinMovimiento() || typeof IntersectionObserver === 'undefined') return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(selector));
    if (!items.length) return;
    // Ocultar antes del primer pintado (evita parpadeo). Solo con JS + movimiento.
    items.forEach((it) => { it.style.opacity = '0'; it.style.transform = 'translateY(10px)'; });
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        const it = e.target as HTMLElement;
        io.unobserve(it);
        animate(it, {
          opacity: [0, 1], translateY: [10, 0], duration: 500, ease: 'outCubic',
          onComplete: () => { it.style.transform = ''; },
        });
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    items.forEach((it) => io.observe(it));
    return () => io.disconnect();
  }, [selector]);

  return <div ref={cont} style={{ display: 'contents' }}>{children}</div>;
}
