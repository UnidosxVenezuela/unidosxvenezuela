'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline, svg } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, SombraSuelo, Chispa } from './estilo';

/**
 * «Planta que crece» — un brote sale de la tierra y florece.
 *
 * La metáfora de reconstruir. Es la más CONTENIDA de todas a propósito: en una
 * plataforma de respuesta a un terremoto, no todo remate puede ser confeti. Esta
 * celebra sin brindar sobre la tragedia, y por eso es la que mejor encaja cuando
 * se cierra algo grave.
 *
 * ACABADO: el tallo se dibuja con `strokeDashoffset` (crece de verdad, no aparece);
 * los pétalos llevan degradado radial y una vena central más clara; la tierra tiene
 * dos tonos y grumos, que es lo que la separa de una mancha marrón.
 */

const U = 'planta';

export default function PlantaCrece({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    if (reducido || !raiz) return;
    const uno = <T extends SVGElement>(s: string) => raiz.querySelector<T>(s);
    const todos = <T extends SVGElement>(s: string) => Array.from(raiz.querySelectorAll<T>(s));
    const vivos: { revert: () => void }[] = [];

    try {
      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      // El tallo se dibuja.
      const tallo = uno<SVGPathElement>('.pl-tallo');
      if (tallo) {
        try {
          tl.add(tallo, { ...svg.createDrawable(tallo) as object, draw: '0 1', duration: 900, ease: 'inOutQuad' } as never, 200);
        } catch {
          const largo = tallo.getTotalLength();
          tallo.style.strokeDasharray = String(largo);
          tallo.style.strokeDashoffset = String(largo);
          tl.add(tallo, { strokeDashoffset: [largo, 0], duration: 900, ease: 'inOutQuad' }, 200);
        }
      }
      // Hojas.
      todos<SVGGElement>('.pl-hoja').forEach((h, i) => {
        tl.add(h, { scale: [0, 1], opacity: [0, 1], rotate: [i ? 34 : -34, 0], duration: 460, ease: 'outBack' }, 620 + i * 190);
      });
      // Flor.
      const flor = uno<SVGGElement>('.pl-flor');
      if (flor) {
        tl.add(flor, { scale: [0, 1], rotate: [-140, 0], opacity: [0, 1], duration: 720, ease: 'outBack' }, 1180);
        vivos.push(animate(flor, { rotate: [-3.5, 3.5], duration: 1500, loop: 3, alternate: true, ease: 'inOutQuad', delay: 1900 }));
      }
      // Polen que sube.
      todos<SVGCircleElement>('.pl-polen').forEach((c, i) => {
        tl.add(c, {
          translateY: [0, -26 - i * 4], translateX: (i % 2 ? 1 : -1) * (7 + i * 2.4),
          opacity: [0.9, 0], scale: [1, 0.4], duration: 1150, delay: i * 110, ease: 'outQuad',
        }, 1600);
      });
      tl.add(raiz, { opacity: 1, duration: 600 }, 2600);
    } catch {
      vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } });
      finRef.current();
      return;
    }
    return () => { vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } }); };
  }, [reducido]);

  const PETALOS = [0, 60, 120, 180, 240, 300];

  return (
    <svg
      ref={raizRef} width={size} height={size} viewBox="-60 -60 120 120"
      preserveAspectRatio="xMidYMid meet"
      className={'cel-svg' + (reducido ? ' cel-svg-quieto' : '')}
      style={{ maxWidth: '100%', height: 'auto' }} aria-hidden="true" focusable="false"
    >
      <DefsCelebracion u={U} tonos={['verde', 'amarillo', 'madera', 'naranja']} />
      <defs>
        <radialGradient id={`petalo-${U}`} cx="42%" cy="26%" r="76%">
          <stop offset="0%" stopColor="#FFF0A8" />
          <stop offset="55%" stopColor={P.amarillo.base} />
          <stop offset="100%" stopColor="#D89409" />
        </radialGradient>
      </defs>

      <SombraSuelo u={U} cx={0} cy={35} rx={22} ry={3.6} opacidad={0.16} />

      {/* Tierra: dos tonos + grumos */}
      <path d="M -25 34 Q -22 24 0 24 Q 22 24 25 34 Z" fill={P.madera.sombra} />
      <path d="M -21 30 Q -17 26 0 26 Q 17 26 21 30 Z" fill={P.madera.base} opacity="0.9" />
      {[[-13, 29], [-5, 27.4], [7, 28.4], [14, 30]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={i % 2 ? 2.2 : 1.6} ry={1.1} fill={P.madera.luz} opacity="0.5" />
      ))}
      <path d="M -34 34 H 34" stroke="var(--borde-f)" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />

      {/* Tallo */}
      <path className="pl-tallo" d="M 0 26 C 0 14 -3 6 0 -6" fill="none" stroke={P.verde.base}
        strokeWidth="3.4" strokeLinecap="round" />
      <path d="M 0 24 C 0 14 -2.4 6 0 -5" fill="none" stroke={P.verde.luz} strokeWidth="1.2"
        strokeLinecap="round" opacity="0.6" />

      {/* Hojas */}
      <g className="pl-hoja" style={{ transformOrigin: '60px 76px' }} opacity={reducido ? 1 : 0}>
        <path d="M -1.4 16 Q -13 12 -15 3 Q -5 3 -1.4 16 Z" fill={vol('verde', U)} />
        <path d="M -2.4 14.4 Q -9.6 10.4 -12.6 5.4" fill="none" stroke={P.verde.sombra} strokeWidth="0.9" opacity="0.6" />
      </g>
      <g className="pl-hoja" style={{ transformOrigin: '60px 70px' }} opacity={reducido ? 1 : 0}>
        <path d="M 1.4 10 Q 13 6 15 -3 Q 5 -3 1.4 10 Z" fill={vol('verde', U)} />
        <path d="M 2.4 8.4 Q 9.6 4.4 12.6 -0.6" fill="none" stroke={P.verde.sombra} strokeWidth="0.9" opacity="0.6" />
      </g>

      {/* Flor */}
      <g className="pl-flor" style={{ transformOrigin: '60px 54px' }} opacity={reducido ? 1 : 0}>
        <g transform="translate(0,-6)">
          {PETALOS.map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <ellipse cy="-9.6" rx="5" ry="8.6" fill={`url(#petalo-${U})`} />
              <path d="M 0 -3.4 V -16" stroke="#FFF6D0" strokeWidth="1" opacity="0.6" strokeLinecap="round" />
            </g>
          ))}
          <circle r="5.2" fill={vol('naranja', U)} />
          <circle r="5.2" fill="none" stroke="#9E4409" strokeWidth="0.9" opacity="0.5" />
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} r="0.9" fill="#7A3406" opacity="0.6"
              transform={`rotate(${a}) translate(0,-2.4)`} />
          ))}
          <ellipse cx="-1.6" cy="-1.8" rx="1.6" ry="1.1" fill="#fff" opacity="0.45" transform="rotate(-30 -1.6 -1.8)" />
        </g>
      </g>

      {!reducido && Array.from({ length: 5 }, (_, i) => (
        <circle className="pl-polen" key={i} cx={i % 2 ? 3 : -3} cy="-12" r="1.3" fill={P.amarillo.luz} opacity="0" />
      ))}
    </svg>
  );
}
