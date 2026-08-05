'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, Chispa } from './estilo';

/**
 * «Choque de manos» — dos manos chocan con onda de impacto y destellos.
 *
 * Aquí no lo hace nadie solo: por eso las dos manos tienen TONOS DE PIEL DISTINTOS
 * y mangas de colores distintos. Es un detalle pequeño y es el que cuenta la
 * historia — si fueran iguales parecería una persona aplaudiendo.
 *
 * ACABADO: cada mano lleva dedos separados (no una manopla), nudillos insinuados,
 * degradado de volumen y luz de borde. Las líneas de impacto salen del punto de
 * contacto, no del centro del lienzo.
 */

const U = 'choque';
const PIEL_A = { sombra: '#A9663A', base: '#D99560', luz: '#EFB98A' };
const PIEL_B = { sombra: '#6E4526', base: '#966039', luz: '#B98457' };

/** Una mano: palma + cuatro dedos + pulgar. `dir` = 1 derecha, -1 izquierda. */
function Mano({ dir, piel, manga, u }: { dir: 1 | -1; piel: typeof PIEL_A; manga: string; u: string }) {
  return (
    <g transform={`scale(${dir},1) rotate(-13)`}>
      {/* Manga */}
      <path d="M 22 -2 L 34 -9 L 34 12 L 22 8 Z" fill={manga} />
      <path d="M 24 -1 L 32.6 -6" stroke="#fff" strokeWidth="1.4" opacity="0.3" strokeLinecap="round" />
      {/* Palma */}
      <path d="M 2 -9 Q 20 -12 23 -1 Q 24 7 16 9.6 Q 4 12 1 4 Z" fill={piel.base} />
      <path d="M 2 -9 Q 20 -12 23 -1 Q 24 7 16 9.6 Q 4 12 1 4 Z" fill={`url(#vol-piel-${u})`} opacity="0.35" />
      {/* Dedos */}
      {[-8.6, -3.4, 1.8, 7].map((y, i) => (
        <rect key={i} x={-6 - (i === 0 || i === 3 ? 1.4 : 0)} y={y - 1.9} width={10 + (i === 1 || i === 2 ? 1.6 : 0)}
          height="3.9" rx="1.95" fill={i % 2 ? piel.base : piel.luz} />
      ))}
      {/* Pulgar */}
      <path d="M 8 8.4 Q 4 14.4 10 15.6 Q 15 16 15.6 11" fill={piel.base} />
      {/* Nudillos y luz de borde */}
      <path d="M -3 -7.6 q 2.4 -1.4 4.6 0" fill="none" stroke={piel.sombra} strokeWidth="0.8" opacity="0.55" strokeLinecap="round" />
      <path d="M -3 8.4 q 2.4 1.2 4.6 0" fill="none" stroke={piel.sombra} strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
      <path d="M 3 -9.6 Q 18 -11.6 22 -2.4" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.4" strokeLinecap="round" />
    </g>
  );
}

export default function ChoqueManos({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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

      const izq = uno<SVGGElement>('.ch-izq');
      const der = uno<SVGGElement>('.ch-der');
      if (izq) {
        tl.add(izq, { translateX: [-54, -3], opacity: [0, 1], duration: 480, ease: 'inQuad' }, 100);
        tl.add(izq, { translateX: -14, duration: 130, ease: 'outQuad' }, 580);       // retroceso del golpe
        tl.add(izq, { translateX: -8, duration: 420, ease: 'outBounce' }, 720);
      }
      if (der) {
        tl.add(der, { translateX: [54, 3], opacity: [0, 1], duration: 480, ease: 'inQuad' }, 100);
        tl.add(der, { translateX: 14, duration: 130, ease: 'outQuad' }, 580);
        tl.add(der, { translateX: 8, duration: 420, ease: 'outBounce' }, 720);
      }
      // Onda de impacto.
      const onda = uno<SVGCircleElement>('.ch-onda');
      if (onda) tl.add(onda, { r: [3, 34], opacity: [0.85, 0], strokeWidth: [5, 0.8], duration: 700, ease: 'outQuad' }, 570);
      const fog = uno<SVGCircleElement>('.ch-fogonazo');
      if (fog) tl.add(fog, { opacity: [0, 0.85, 0], scale: [0.3, 1.6], duration: 380 }, 560);
      // Líneas de impacto.
      todos<SVGPathElement>('.ch-linea').forEach((l, i) => {
        tl.add(l, { opacity: [0.9, 0], scale: [0.4, 1.5], duration: 520, delay: i * 16 }, 580);
      });
      const rot = uno<SVGGElement>('.ch-rotulo');
      if (rot) {
        tl.add(rot, { opacity: [0, 1], scale: [0.4, 1], rotate: [-10, -6], duration: 460, ease: 'outBack' }, 700);
      }
      todos<SVGGElement>('.ch-chispa').forEach((g, i) => {
        const ang = (i / 8) * Math.PI * 2 + 0.4;
        tl.add(g, {
          translateX: +(Math.cos(ang) * 32).toFixed(1), translateY: +(Math.sin(ang) * 26).toFixed(1),
          opacity: [1, 0], scale: [0.3, 1.1], duration: 800, delay: i * 22, ease: 'outCubic',
        }, 620);
      });
      tl.add(raiz, { opacity: 1, duration: 700 }, 2000);
    } catch {
      vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } });
      finRef.current();
      return;
    }
    return () => { vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } }); };
  }, [reducido]);

  return (
    <svg
      ref={raizRef} width={size} height={size} viewBox="-60 -60 120 120"
      preserveAspectRatio="xMidYMid meet"
      className={'cel-svg' + (reducido ? ' cel-svg-quieto' : '')}
      style={{ maxWidth: '100%', height: 'auto' }} aria-hidden="true" focusable="false"
    >
      <DefsCelebracion u={U} tonos={['piel', 'azul', 'rojo', 'amarillo']} />

      {/* Líneas de impacto, desde el punto de contacto */}
      {!reducido && Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * 360;
        return (
          <path className="ch-linea" key={i} d="M 0 -15 L 0 -25" stroke={P.amarillo.base} strokeWidth="2.6"
            strokeLinecap="round" opacity="0" transform={`rotate(${a})`} style={{ transformOrigin: '60px 60px' }} />
        );
      })}
      <circle className="ch-onda" cx="0" cy="0" r="3" fill="none" stroke={P.amarillo.luz} strokeWidth="5" opacity="0" />
      <circle className="ch-fogonazo" cx="0" cy="0" r="16" fill={`url(#brillo-${U})`} opacity="0"
        style={{ transformOrigin: '60px 60px' }} />

      {!reducido && Array.from({ length: 8 }, (_, i) => (
        <g className="ch-chispa" key={i} opacity="0">
          <Chispa r={i % 2 ? 3.2 : 2.4} color={[P.amarillo.base, P.azul.luz, P.rojo.luz][i % 3]} />
        </g>
      ))}

      <g className="ch-izq" opacity={reducido ? 1 : 0}
        transform={reducido ? 'translate(-8,0)' : undefined} style={{ transformOrigin: '60px 60px' }}>
        <Mano dir={-1} piel={PIEL_A} manga={P.azul.base} u={U} />
      </g>
      <g className="ch-der" opacity={reducido ? 1 : 0}
        transform={reducido ? 'translate(8,0)' : undefined} style={{ transformOrigin: '60px 60px' }}>
        <Mano dir={1} piel={PIEL_B} manga={P.rojo.base} u={U} />
      </g>

      {/* Rótulo */}
      <g className="ch-rotulo" opacity={reducido ? 1 : 0}
        transform={reducido ? 'rotate(-6 0 -34)' : undefined} style={{ transformOrigin: '60px 26px' }}>
        <text x="0" y="-32" textAnchor="middle" fontSize="17" fontWeight="900" fill={P.amarillo.base}
          style={{ paintOrder: 'stroke', stroke: P.azul.sombra, strokeWidth: 4, strokeLinejoin: 'round' }}>¡ESO!</text>
      </g>
    </svg>
  );
}
