'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, lin, SombraSuelo, Chispa } from './estilo';

/**
 * «Trofeo» — sube con rayos de luz girando detrás y remata con un destello.
 *
 * ACABADO: la copa lleva degradado dorado de tres paradas MÁS una banda especular
 * vertical (el reflejo alargado que tiene todo metal pulido) y un reflejo curvo en
 * el labio. Sin esa banda, un trofeo dorado parece plástico.
 */

const U = 'trofeo';

export default function Trofeo({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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
      const rayos = uno<SVGGElement>('.tr-rayos');
      if (rayos) vivos.push(animate(rayos, { rotate: [0, 360], duration: 14000, loop: true, ease: 'linear' }));

      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      if (rayos) tl.add(rayos, { opacity: [0, 0.55], scale: [0.5, 1], duration: 620, ease: 'outCubic' }, 260);
      const copa = uno<SVGGElement>('.tr-copa');
      if (copa) {
        tl.add(copa, { translateY: [26, 0], opacity: [0, 1], duration: 620, ease: 'outBack' }, 120);
        tl.add(copa, { scale: [1, 1.09], duration: 180, ease: 'outQuad' }, 900);
        tl.add(copa, { scale: 1, duration: 380, ease: 'outBounce' }, 1080);
      }
      const brillo = uno<SVGRectElement>('.tr-brillo');
      if (brillo) tl.add(brillo, { translateX: [-16, 16], opacity: [0, 0.85, 0], duration: 700, ease: 'inOutQuad' }, 900);
      const cinta = uno<SVGGElement>('.tr-cinta');
      if (cinta) tl.add(cinta, { opacity: [0, 1], translateY: [8, 0], duration: 420, ease: 'outBack' }, 1180);
      todos<SVGGElement>('.tr-chispa').forEach((g, i) => {
        const ang = (i / 9) * Math.PI * 2 + 0.4;
        tl.add(g, {
          translateX: +(Math.cos(ang) * 34).toFixed(1), translateY: +(Math.sin(ang) * 30).toFixed(1),
          opacity: [1, 0], scale: [0.3, 1.15], duration: 900, delay: i * 24, ease: 'outCubic',
        }, 1000);
      });
      tl.add(raiz, { opacity: 1, duration: 600 }, 2300);
    } catch {
      vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } });
      finRef.current();
      return;
    }
    return () => { vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } }); };
  }, [reducido]);

  const RAYOS = Array.from({ length: 12 }, (_, i) => i * 30);

  return (
    <svg
      ref={raizRef} width={size} height={size} viewBox="-60 -60 120 120"
      preserveAspectRatio="xMidYMid meet"
      className={'cel-svg' + (reducido ? ' cel-svg-quieto' : '')}
      style={{ maxWidth: '100%', height: 'auto' }} aria-hidden="true" focusable="false"
    >
      <DefsCelebracion u={U} tonos={['amarillo', 'naranja', 'rojo', 'metal']} />
      <defs>
        <linearGradient id={`oro-${U}`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0%" stopColor="#B8790A" />
          <stop offset="26%" stopColor="#FFD75E" />
          <stop offset="48%" stopColor="#FFF3C4" />
          <stop offset="70%" stopColor="#F2B417" />
          <stop offset="100%" stopColor="#96620A" />
        </linearGradient>
        <clipPath id={`copa-${U}`}>
          <path d="M -15 -22 H 15 Q 15 4 0 9 Q -15 4 -15 -22 Z" />
        </clipPath>
      </defs>

      {/* Rayos giratorios */}
      <g className="tr-rayos" opacity={reducido ? 0.55 : 0} style={{ transformOrigin: '60px 58px' }}
        transform={reducido ? undefined : 'scale(0.5)'}>
        {RAYOS.map((a) => (
          <path key={a} d="M 0 -2.8 L 46 0 L 0 2.8 Z" fill={P.amarillo.luz} opacity="0.5"
            transform={`rotate(${a} 0 -2)`} />
        ))}
      </g>

      <SombraSuelo u={U} cx={0} cy={34} rx={19} ry={3.6} opacidad={0.22} />

      <g className="tr-copa" style={{ transformOrigin: '60px 66px' }} opacity={reducido ? 1 : 0}>
        {/* Asas */}
        <path d="M -15 -18 q -11 0 -11 8 q 0 8 11 9" fill="none" stroke="#C98A0C" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M 15 -18 q 11 0 11 8 q 0 8 -11 9" fill="none" stroke="#C98A0C" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M -15 -18 q -9.4 0 -9.4 8" fill="none" stroke="#FFE79A" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
        {/* Cáliz */}
        <path d="M -15 -22 H 15 Q 15 4 0 9 Q -15 4 -15 -22 Z" fill={`url(#oro-${U})`} />
        {/* Banda especular que barre al rematar */}
        <g clipPath={`url(#copa-${U})`}>
          <rect className="tr-brillo" x="-4" y="-24" width="7" height="36" fill="#fff" opacity="0" transform="skewX(-14)" />
        </g>
        {/* Labio y reflejo curvo */}
        <rect x="-16.6" y="-24.6" width="33.2" height="4.4" rx="2.2" fill={lin('amarillo', U)} />
        <path d="M -11 -19 Q -12.4 -6 -5.4 2.4" fill="none" stroke="#FFF6D8" strokeWidth="2.2" opacity="0.7" strokeLinecap="round" />
        {/* Estrella grabada */}
        <path d="M 0 -14 l 2.5 5.1 5.6 .8 -4.1 4 1 5.6 -5-2.6 -5 2.6 1-5.6 -4.1-4 5.6-.8 Z" fill="#FFF6D8" opacity="0.85" />
        {/* Pie */}
        <rect x="-3.4" y="9" width="6.8" height="9" fill={lin('amarillo', U)} />
        <path d="M -11 18 H 11 L 13 26 H -13 Z" fill={`url(#oro-${U})`} />
        <rect x="-14.4" y="26" width="28.8" height="5.4" rx="2" fill={lin('amarillo', U)} />
        <path d="M -12 27.6 H 12" stroke="#FFF3C4" strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
      </g>

      {/* Cinta */}
      <g className="tr-cinta" opacity={reducido ? 1 : 0}>
        <rect x="-27" y="36" width="54" height="14" rx="7" fill={P.rojo.sombra} opacity="0.35" transform="translate(0,1.4)" />
        <rect x="-27" y="36" width="54" height="14" rx="7" fill={vol('rojo', U)} />
        <text x="0" y="43.4" textAnchor="middle" dominantBaseline="central" fontSize="7.6" fontWeight="900"
          fill="#fff" letterSpacing="1.4">GRACIAS</text>
      </g>

      {!reducido && Array.from({ length: 9 }, (_, i) => (
        <g className="tr-chispa" key={i} opacity="0" transform="translate(0,-10)">
          <Chispa r={i % 2 ? 3.4 : 2.4} color={i % 3 ? P.amarillo.luz : '#fff'} />
        </g>
      ))}
    </svg>
  );
}
