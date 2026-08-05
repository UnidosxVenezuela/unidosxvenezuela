'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, Chispa } from './estilo';

/**
 * «Barra al 100 %» — corre hasta el tope, se pone verde y estalla.
 *
 * La más universal de todas: no necesita explicación en ningún idioma ni cultura.
 * Por eso es de las que entran en cualquier evento.
 *
 * ACABADO: el carril tiene sombra interior (hundido) y la barra un degradado
 * vertical con brillo superior (abultada). Ese contraste hundido/abultado es lo
 * que convierte dos rectángulos en un control físico. El número usa cifras
 * tabulares para no bailar mientras cuenta.
 */

const U = 'barra';

export default function Barra100({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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

      const carril = uno<SVGGElement>('.ba-carril');
      if (carril) tl.add(carril, { opacity: [0, 1], scaleX: [0.85, 1], duration: 340, ease: 'outBack' }, 0);

      const barra = uno<SVGRectElement>('.ba-barra');
      if (barra) tl.add(barra, { width: [0, 74], duration: 1300, ease: 'inOutQuad' }, 260);

      // Contador sincronizado con la barra.
      const num = uno<SVGTextElement>('.ba-num');
      if (num) {
        const obj = { v: 0 };
        tl.add(obj, {
          v: 100, duration: 1300, ease: 'inOutQuad', modifier: (x: number) => Math.round(x),
          onUpdate: () => { num.textContent = Math.round(obj.v) + ' %'; },
        }, 260);
        tl.add(num, { scale: [1, 1.4], duration: 180, ease: 'outBack' }, 1560);
        tl.add(num, { scale: 1, duration: 300, ease: 'outQuad' }, 1740);
      }
      // Fogonazo al llegar.
      const fog = uno<SVGRectElement>('.ba-fogonazo');
      if (fog) tl.add(fog, { opacity: [0, 0.9, 0], duration: 420 }, 1520);
      const rot = uno<SVGGElement>('.ba-rotulo');
      if (rot) tl.add(rot, { opacity: [0, 1], translateY: [8, 0], duration: 420, ease: 'outBack' }, 1620);

      todos<SVGGElement>('.ba-chispa').forEach((g, i) => {
        const ang = (i / 10) * Math.PI * 2;
        tl.add(g, {
          translateX: +(Math.cos(ang) * 40).toFixed(1), translateY: +(Math.sin(ang) * 24).toFixed(1),
          opacity: [1, 0], scale: [0.3, 1.1], rotate: i % 2 ? 150 : -150,
          duration: 850, delay: i * 20, ease: 'outCubic',
        }, 1540);
      });
      tl.add(raiz, { opacity: 1, duration: 600 }, 2400);
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
      <DefsCelebracion u={U} tonos={['verde', 'azul', 'amarillo']} />
      <defs>
        <linearGradient id={`llena-${U}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6BDCA0" />
          <stop offset="45%" stopColor={P.verde.base} />
          <stop offset="100%" stopColor={P.verde.sombra} />
        </linearGradient>
        <clipPath id={`carril-${U}`}>
          <rect x="-38" y="-9" width="76" height="18" rx="9" />
        </clipPath>
      </defs>

      {!reducido && Array.from({ length: 10 }, (_, i) => (
        <g className="ba-chispa" key={i} opacity="0">
          <Chispa r={i % 2 ? 3.4 : 2.4} color={[P.verde.luz, P.amarillo.base, '#fff'][i % 3]} />
        </g>
      ))}

      <text x="0" y="-24" textAnchor="middle" fontSize="8" fontWeight="800" fill="var(--texto2)" letterSpacing="0.8">
        Cobertura del ítem
      </text>

      <g className="ba-carril" style={{ transformOrigin: '60px 60px' }} opacity={reducido ? 1 : 0}>
        {/* Carril hundido */}
        <rect x="-38" y="-9" width="76" height="18" rx="9" fill="var(--sup2)" />
        <rect x="-38" y="-9" width="76" height="18" rx="9" fill="none" stroke="var(--borde-f)" strokeWidth="1.4" />
        <path d="M -33 -6.4 H 33" stroke="#0B1220" strokeWidth="2" opacity="0.09" strokeLinecap="round" />
        {/* Barra abultada */}
        <g clipPath={`url(#carril-${U})`}>
          <rect className="ba-barra" x="-37" y="-8" width={reducido ? 74 : 0} height="16" rx="8" fill={`url(#llena-${U})`} />
          <rect className="ba-fogonazo" x="-38" y="-9" width="76" height="18" fill="#fff" opacity="0" />
        </g>
        {/* Brillo superior de la barra */}
        <path d="M -32 -4.6 H 30" stroke="#fff" strokeWidth="2.2" opacity={reducido ? 0.4 : 0} strokeLinecap="round" className="ba-lustre" />
      </g>

      <text className="ba-num" x="0" y="26" textAnchor="middle" fontSize="15" fontWeight="900" fill={P.verde.base}
        style={{ transformOrigin: '60px 82px', fontVariantNumeric: 'tabular-nums' }}>
        {reducido ? '100 %' : '0 %'}
      </text>

      <g className="ba-rotulo" opacity={reducido ? 1 : 0}>
        <text x="0" y="41" textAnchor="middle" fontSize="8.4" fontWeight="800" fill="var(--texto2)">meta cubierta</text>
      </g>
    </svg>
  );
}
