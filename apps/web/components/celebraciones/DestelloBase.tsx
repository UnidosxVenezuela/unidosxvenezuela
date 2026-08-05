'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline, svg } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Destello»: un visto que se dibuja dentro de un disco azul mientras salen
 * chispas tricolor. Es la animación de REFERENCIA del contrato (ver la cabecera
 * de `lib/celebraciones.ts`) y además la RED DE SEGURIDAD del motor: si un vídeo
 * falla, no carga o la conexión va justa, sale esta. Pesa ~2 KB, sin assets.
 *
 * Truco del lienzo: `viewBox="-60 -60 120 120"` deja el ORIGEN en el centro, así
 * `translate(0,0)` es el centro y `scale` escala desde el centro sin pelearse
 * con `transform-origin` en SVG.
 */

/** Chispas deterministas (nada de azar a nivel de módulo): ángulo, distancia y color. */
const CHISPAS = Array.from({ length: 12 }, (_, i) => {
  const ang = (i / 12) * Math.PI * 2 + (i % 2 ? 0.26 : 0);
  // Se quedan dentro del viewBox (±60) contando su propio tamaño: el <svg>
  // recorta lo que se salga y una chispa cortada canta mucho.
  const dist = i % 3 === 0 ? 51 : i % 3 === 1 ? 42 : 47;
  return {
    x: +(Math.cos(ang) * dist).toFixed(1),
    y: +(Math.sin(ang) * dist).toFixed(1),
    giro: i % 2 ? 150 : -130,
    redonda: i % 3 === 2,
    color: ['var(--amarillo)', 'var(--azul)', 'var(--rojo)'][i % 3],
  };
});

export default function DestelloBase({ onFin, reducido, size = 160 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: no se anima NADA. El SVG ya está pintado en su
    // fotograma final (disco visible, visto trazado, chispas ocultas por CSS).
    if (reducido || !raiz) return;

    const disco = raiz.querySelector<SVGCircleElement>('.cel-disco');
    const anillo = raiz.querySelector<SVGCircleElement>('.cel-anillo');
    const visto = raiz.querySelector<SVGPathElement>('.cel-visto');
    const chispas = Array.from(raiz.querySelectorAll<SVGGElement>('.cel-chispa'));

    let tl: ReturnType<typeof createTimeline> | null = null;
    try {
      const linea = createTimeline({ defaults: { ease: 'outCubic' }, onComplete: () => finRef.current() });
      tl = linea;
      if (disco) linea.add(disco, { scale: [0.2, 1], opacity: [0, 1], duration: 460, ease: 'outBack' }, 0);
      if (anillo) linea.add(anillo, { scale: [0.5, 1.95], opacity: [0.55, 0], duration: 820, ease: 'outQuad' }, 80);
      if (visto) linea.add(svg.createDrawable(visto), { draw: ['0 0', '0 1'], duration: 420, ease: 'outQuad' }, 280);
      // Una entrada por chispa con valores literales (más simple de tipar que los
      // valores por función, y el escalonado se hace con el `delay` de cada una).
      chispas.forEach((g, i) => {
        const ch = CHISPAS[i];
        if (!ch) return;
        linea.add(g, {
          translateX: ch.x,
          translateY: ch.y,
          rotate: ch.giro,
          scale: [1, 0.45],
          opacity: [1, 0],
          duration: 980,
          delay: i * 26,
        }, 200);
      });
      // Un respiro al final para que dé tiempo a leer el mensaje del overlay
      // (el motor además garantiza un mínimo en pantalla).
      linea.add(raiz, { opacity: 1, duration: 900 });
    } catch {
      // Si anime.js falla, nunca dejamos el dibujo a medias ni la celebración colgada.
      finRef.current();
      return;
    }

    return () => { tl?.revert(); };
  }, [reducido]);

  return (
    <svg
      ref={raizRef}
      width={size}
      height={size}
      viewBox="-60 -60 120 120"
      className={'cel-svg' + (reducido ? ' cel-svg-quieto' : '')}
      aria-hidden="true"
      focusable="false"
    >
      {/* Anillo y chispas nacen invisibles: la línea de tiempo los enciende cuando
          les toca (si no, se verían quietos encima del disco los primeros ms). Si
          anime.js fallara, simplemente no salen: el disco y el visto siguen bien. */}
      <circle className="cel-anillo" r="26" style={{ fill: 'none', stroke: 'var(--amarillo)', strokeWidth: 3, opacity: 0 }} />
      <circle className="cel-disco" r="26" style={{ fill: 'var(--azul)' }} />
      <path
        className="cel-visto"
        d="M -11 1 L -3.5 8.5 L 12 -8"
        style={{ fill: 'none', stroke: '#fff', strokeWidth: 4.4 }}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {!reducido && CHISPAS.map((ch, i) => (
        <g className="cel-chispa" key={i} style={{ opacity: 0 }}>
          {ch.redonda
            ? <circle r="3.4" style={{ fill: ch.color }} />
            : <rect x="-2.6" y="-5" width="5.2" height="10" rx="1.6" style={{ fill: ch.color }} />}
        </g>
      ))}
    </svg>
  );
}
