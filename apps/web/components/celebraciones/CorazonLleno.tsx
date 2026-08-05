'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, SombraSuelo } from './estilo';

/**
 * «Corazón lleno» — late y se va llenando hasta rebosar, con ondas suaves.
 *
 * Es el remate emotivo del flujo: para cuando una necesidad queda cubierta. Va
 * SIN confeti a propósito — el confeti lo haría festivo, y este momento es de otra
 * cosa. Las ondas concéntricas hacen el trabajo.
 *
 * ACABADO: el corazón vacío es un contorno grueso con relleno tenue; el que se
 * llena sube por dentro con un menisco claro y un brillo especular fijo arriba a
 * la izquierda que NO se mueve con el llenado (así se lee como superficie
 * brillante y no como parte del líquido).
 */

const U = 'coraz';
const D_CORAZON = 'M 0 26 C -34 2 -27 -24 -12.6 -24 C -4.6 -24 0 -18 0 -13.4 C 0 -18 4.6 -24 12.6 -24 C 27 -24 34 2 0 26 Z';

export default function CorazonLleno({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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

      const grupo = uno<SVGGElement>('.cl-grupo');
      if (grupo) tl.add(grupo, { opacity: [0, 1], scale: [0.6, 1], duration: 460, ease: 'outBack' }, 0);

      // Llenado.
      const nivel = uno<SVGRectElement>('.cl-nivel');
      if (nivel) tl.add(nivel, { y: [26, -26], duration: 1250, ease: 'inOutQuad' }, 380);

      // Latido: dos golpes, como un corazón de verdad (fuerte-flojo).
      if (grupo) {
        vivos.push(animate(grupo, {
          scale: [{ to: 1.09, duration: 130, ease: 'outQuad' }, { to: 1, duration: 170, ease: 'inQuad' },
                  { to: 1.05, duration: 110, ease: 'outQuad' }, { to: 1, duration: 300, ease: 'inQuad' }],
          loop: 4, delay: 500,
        }));
      }
      // Ondas al completarse.
      todos<SVGCircleElement>('.cl-onda').forEach((c, i) => {
        tl.add(c, { r: [12, 44], opacity: [0.5, 0], strokeWidth: [3, 0.6], duration: 1150, delay: i * 240, ease: 'outQuad' }, 1500);
      });
      const brillo = uno<SVGEllipseElement>('.cl-brillo');
      if (brillo) tl.add(brillo, { opacity: [0.2, 0.65], duration: 500 }, 1400);
      tl.add(raiz, { opacity: 1, duration: 600 }, 2600);
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
      <DefsCelebracion u={U} tonos={['rojo']} />
      <defs>
        <clipPath id={`cor-${U}`}><path d={D_CORAZON} /></clipPath>
        <linearGradient id={`sangre-${U}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#F0616F" />
          <stop offset="55%" stopColor="#D62B3C" />
          <stop offset="100%" stopColor="#8C1220" />
        </linearGradient>
      </defs>

      {/* Ondas */}
      {!reducido && [0, 1, 2].map((i) => (
        <circle className="cl-onda" key={i} cx="0" cy="0" r="12" fill="none" stroke={P.rojo.luz} strokeWidth="3" opacity="0" />
      ))}

      <SombraSuelo u={U} cx={0} cy={34} rx={17} ry={3.2} opacidad={0.18} />

      <g className="cl-grupo" style={{ transformOrigin: '60px 60px' }} opacity={reducido ? 1 : 0}>
        {/* Vaso: corazón vacío */}
        <path d={D_CORAZON} fill={P.rojo.base} opacity="0.16" />
        {/* Contenido */}
        <g clipPath={`url(#cor-${U})`}>
          <rect className="cl-nivel" x="-36" y={reducido ? -26 : 26} width="72" height="60" fill={`url(#sangre-${U})`} />
        </g>
        {/* Contorno */}
        <path d={D_CORAZON} fill="none" stroke={P.rojo.sombra} strokeWidth="2.6" strokeLinejoin="round" opacity="0.85" />
        {/* Brillo especular: FIJO, no sube con el líquido. */}
        <ellipse className="cl-brillo" cx="-11" cy="-11" rx="6" ry="4.2" fill="#fff"
          opacity={reducido ? 0.65 : 0.2} transform="rotate(-32 -11 -11)" />
        <path d="M -19.4 -13 Q -22 -3 -14.6 6.6" fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.35" strokeLinecap="round" />
      </g>
    </svg>
  );
}
