'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, svg } from 'animejs';
import { sinMovimiento } from '@/lib/anime';

/**
 * Checkmark que se "dibuja" al montar (cierre de una acción con éxito). Usa
 * `svg.createDrawable` de anime.js v4 para animar el trazo. Con `reduced-motion`
 * se muestra ya dibujado (sin animación). Hereda el color con `currentColor`.
 */
export default function CheckDibujado({ size = 18 }: { size?: number }) {
  const ref = useRef<SVGPathElement>(null);

  useLayoutEffect(() => {
    const path = ref.current;
    if (!path || sinMovimiento()) return; // reduced-motion: queda visible completo
    // Se dibuja del 0 al 1 (empieza oculto antes del primer pintado → sin parpadeo).
    animate(svg.createDrawable(path), { draw: ['0 0', '0 1'], duration: 460, ease: 'outQuad' });
  }, []);

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path ref={ref} d="M20 6 L9 17 L4 12" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
