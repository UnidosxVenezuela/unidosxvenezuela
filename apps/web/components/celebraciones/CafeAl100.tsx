'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, lin, SombraSuelo, Ojo, Rubor, Chispa } from './estilo';

/**
 * «Café al 100 %» — al cerrar la acción, se rellena la taza y la energía sube a tope.
 *
 * Tres tiempos: la taza vacía y la cara de sueño → el café que sube (con vapor) →
 * el sorbo y el medidor disparándose a 100 % con chispas. El chiste está en el
 * cambio de cara: de arrastrarse a los ojos como platos.
 *
 * ACABADO: degradados de volumen, luz de borde, brillo en la loza, sombra
 * proyectada y rubor difuminado. El café lleva su propio degradado y un menisco
 * más claro arriba, que es lo que hace que parezca líquido y no un relleno.
 */

const U = 'cafe';
const NIVEL_Y = 6.5;      // fondo interior de la taza
const NIVEL_ALTO = 17;    // altura máxima del líquido

export default function CafeAl100({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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

      // 1) El café sube (se escala el rectángulo recortado, anclado abajo).
      const liquido = uno<SVGRectElement>('.cf-liquido');
      if (liquido) {
        tl.add(liquido, { height: [0, NIVEL_ALTO], y: [NIVEL_Y, NIVEL_Y - NIVEL_ALTO], duration: 1000, ease: 'inOutQuad' }, 200);
      }
      // Menisco: sigue al líquido.
      const menisco = uno<SVGEllipseElement>('.cf-menisco');
      const menisco2 = uno<SVGEllipseElement>('.cf-menisco2');
      if (menisco) tl.add(menisco, { cy: [NIVEL_Y, NIVEL_Y - NIVEL_ALTO], opacity: [0, 1], duration: 1000, ease: 'inOutQuad' }, 200);
      if (menisco2) tl.add(menisco2, { cy: [NIVEL_Y, NIVEL_Y - NIVEL_ALTO - 0.8], opacity: [0, 0.7], duration: 1000, ease: 'inOutQuad' }, 200);

      // 2) Vapor, en bucle mientras dura.
      const vapor = todos<SVGPathElement>('.cf-vapor');
      if (vapor.length) {
        vapor.forEach((v, i) => {
          vivos.push(animate(v, {
            translateY: [2, -13], opacity: [0, 0.55, 0], scale: [0.7, 1.15],
            duration: 1500, delay: 700 + i * 300, loop: 3, ease: 'outQuad',
          }));
        });
      }

      // 3) Cambio de cara: de sueño a despierto.
      const dormido = uno<SVGGElement>('.cf-dormido');
      const despierto = uno<SVGGElement>('.cf-despierto');
      if (dormido) tl.add(dormido, { opacity: [1, 0], duration: 140 }, 1280);
      if (despierto) tl.add(despierto, { opacity: [0, 1], duration: 200 }, 1300);
      // Sobresalto
      const cabeza = uno<SVGGElement>('.cf-cabeza');
      if (cabeza) {
        tl.add(cabeza, { translateY: [0, -4.5], scale: [1, 1.07], duration: 160, ease: 'outBack' }, 1280);
        tl.add(cabeza, { translateY: 0, scale: 1, duration: 320, ease: 'outBounce' }, 1450);
      }

      // 4) El medidor se llena y remata en 100 %.
      const barra = uno<SVGRectElement>('.cf-barra');
      if (barra) tl.add(barra, { width: [0, 42], duration: 1150, ease: 'outCubic' }, 300);
      const pct = uno<SVGTextElement>('.cf-pct');
      if (pct) {
        tl.add(pct, { opacity: [0, 1], duration: 200 }, 1300);
        tl.add(pct, { scale: [1, 1.35], duration: 180, ease: 'outBack' }, 1440);
        tl.add(pct, { scale: 1, duration: 260, ease: 'outQuad' }, 1620);
      }

      // 5) Chispas del remate.
      todos<SVGGElement>('.cf-chispa').forEach((g, i) => {
        const ang = (i / 7) * Math.PI * 2 + 0.5;
        tl.add(g, {
          translateX: +(Math.cos(ang) * 26).toFixed(1), translateY: +(Math.sin(ang) * 22).toFixed(1),
          scale: [0.4, 1.1], opacity: [1, 0], rotate: i % 2 ? 120 : -120,
          duration: 800, delay: i * 30, ease: 'outCubic',
        }, 1500);
      });

      tl.add(raiz, { opacity: 1, duration: 500 }, 2600);
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
      <DefsCelebracion u={U} tonos={['azul', 'piel', 'pelo', 'amarillo', 'verde', 'madera', 'blanco', 'rojo']} />
      <defs>
        <clipPath id={`taza-${U}`}>
          <path d="M -17 -10 Q -17 8 -13 10.5 Q -1 13 11 10.5 Q 15 8 15 -10 Z" />
        </clipPath>
        <linearGradient id={`cafe-${U}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5A2C" />
          <stop offset="45%" stopColor="#5C3618" />
          <stop offset="100%" stopColor="#38200D" />
        </linearGradient>
        <linearGradient id={`energia-${U}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={P.rojo.base} />
          <stop offset="52%" stopColor={P.amarillo.base} />
          <stop offset="100%" stopColor={P.verde.base} />
        </linearGradient>
      </defs>

      {/* ── Mesa ─────────────────────────────────────────────────────── */}
      <path d="M -50 30 H 50" stroke="var(--borde-f)" strokeWidth="2.6" strokeLinecap="round" opacity="0.7" />
      <SombraSuelo u={U} cx={-2} cy={30} rx={24} ry={3.6} opacidad={0.2} />

      {/* ── Personaje ────────────────────────────────────────────────── */}
      <g transform="translate(-24,0)">
        <path d="M -10 30 Q -11.5 14 0 12 Q 11.5 14 10 30 Z" fill={vol('azul', U)} />
        <path d="M 7.6 16 Q 10.4 21 9.2 29" fill="none" stroke={P.azul.brillo} strokeWidth="1.4" opacity="0.5" strokeLinecap="round" />
        {/* Brazo hacia la taza */}
        <path d="M 8.6 18 L 20 19.4" fill="none" stroke={P.piel.sombra} strokeWidth="5" strokeLinecap="round" />
        <path d="M 8.6 17.6 L 19.4 19" fill="none" stroke={P.piel.base} strokeWidth="3.6" strokeLinecap="round" />
        <circle cx="21.4" cy="19.4" r="3.4" fill={vol('piel', U)} />
        <g className="cf-cabeza">
          <circle cx="0" cy="2" r="9.2" fill={vol('piel', U)} />
          <path d="M 7.4 -2.8 A 9.2 9.2 0 0 1 7.6 6.8" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.5" strokeLinecap="round" />
          <Rubor x={-5.4} y={5.6} u={U} rx={2.2} ry={1.5} />
          <Rubor x={5.4} y={5.6} u={U} rx={2.2} ry={1.5} />
          <path d="M -9.3 1.4 Q -9.8 -9.6 0 -10.4 Q 9.8 -9.6 9.3 1.4 Q 7.8 -4.6 3 -3.4 Q -1.4 -2.2 -4 -4.4 Q -6.6 -6.6 -9.3 1.4 Z" fill={vol('pelo', U)} />
          <path d="M -6.2 -6.4 Q -0.8 -10 5 -7.2" fill="none" stroke={P.pelo.brillo} strokeWidth="1.3" opacity="0.6" strokeLinecap="round" />

          {/* Cara de sueño */}
          <g className="cf-dormido" opacity={reducido ? 0 : 1}>
            <path d="M -6 2.6 q 2.6 2.2 5.2 0" fill="none" stroke={P.pelo.sombra} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M 0.8 2.6 q 2.6 2.2 5.2 0" fill="none" stroke={P.pelo.sombra} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M -2.4 7.6 q 2.4 -1.6 4.8 0" fill="none" stroke={P.pelo.sombra} strokeWidth="1.4" strokeLinecap="round" />
          </g>
          {/* Cara despierta: ojos como platos */}
          <g className="cf-despierto" opacity={reducido ? 1 : 0}>
            <Ojo x={-3.4} y={2.6} r={3.4} iris="verde" u={U} />
            <Ojo x={3.4} y={2.6} r={3.4} iris="verde" u={U} />
            <path d="M -6.4 -1.6 q 2.6 -1.8 5 -0.6" fill="none" stroke={P.pelo.sombra} strokeWidth="1.1" strokeLinecap="round" />
            <path d="M 1.4 -2.2 q 2.4 -1.2 5 0.6" fill="none" stroke={P.pelo.sombra} strokeWidth="1.1" strokeLinecap="round" />
            <path d="M -3.2 7.2 q 3.2 4.6 6.4 0 q -3.2 1.4 -6.4 0 Z" fill={P.pelo.sombra} />
          </g>
        </g>
      </g>

      {/* ── Taza ─────────────────────────────────────────────────────────
          Una taza NO es una caja: hay que ver DENTRO. La boca es una elipse, y
          el café es otra elipse que sube por ella. Sin la elipse de boca el
          dibujo lee como un rectángulo marrón pegado a una pared blanca. */}
      <g transform="translate(16,6)">
        {/* Asa, por detrás del cuerpo */}
        <path d="M 13 -6 q 11 0 11 7 q 0 7 -11 7" fill="none" stroke={P.blanco.sombra} strokeWidth="5" strokeLinecap="round" />
        <path d="M 13 -6 q 9.4 0 9.4 7 q 0 7 -9.4 7" fill="none" stroke={P.blanco.luz} strokeWidth="2.6" strokeLinecap="round" />
        {/* Cuerpo troncocónico */}
        <path d="M -17 -10 Q -17 8 -13 10.5 Q -1 13 11 10.5 Q 15 8 15 -10 Z" fill={vol('blanco', U)} />
        <path d="M 11.4 -7 Q 12.6 3 9.4 9.6" fill="none" stroke={P.blanco.sombra} strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
        <path d="M -13.4 -6 Q -14 3 -11 8.6" fill="none" stroke="#fff" strokeWidth="2.8" opacity="0.6" strokeLinecap="round" />
        {/* Interior de la boca (oscuro) y el café subiendo dentro */}
        <ellipse cx="-1" cy="-10" rx="16" ry="4.6" fill="#6E5744" />
        <g clipPath={`url(#taza-${U})`}>
          <rect className="cf-liquido" x="-17" y={reducido ? NIVEL_Y - NIVEL_ALTO : NIVEL_Y} width="32"
            height={reducido ? NIVEL_ALTO : 0} fill={`url(#cafe-${U})`} />
        </g>
        {/* Superficie del café: la elipse que se ve por la boca */}
        <ellipse className="cf-menisco" cx="-1" cy={reducido ? NIVEL_Y - NIVEL_ALTO : NIVEL_Y} rx="15.2" ry="4.2"
          fill="#7A4E28" opacity={reducido ? 1 : 0} />
        <ellipse className="cf-menisco2" cx="-4" cy={reducido ? NIVEL_Y - NIVEL_ALTO - 0.8 : NIVEL_Y} rx="7" ry="1.6"
          fill="#A8703E" opacity={reducido ? 0.7 : 0} />
        {/* Labio de la taza, por encima de todo */}
        <ellipse cx="-1" cy="-10" rx="16" ry="4.6" fill="none" stroke={P.blanco.brillo} strokeWidth="2.4" />
        <ellipse cx="-1" cy="-10" rx="16" ry="4.6" fill="none" stroke={P.blanco.sombra} strokeWidth="0.9" opacity="0.6" />
        {/* Vapor */}
        {!reducido && [-8, -1, 6].map((x, i) => (
          <path key={i} className="cf-vapor" d={`M ${x} -13 q 3.4 -4.4 0 -8.4 q -3.4 -4.4 0 -7.4`} fill="none"
            stroke="var(--texto2)" strokeWidth="2.2" strokeLinecap="round" opacity="0" />
        ))}
      </g>

      {/* ── Medidor de energía ───────────────────────────────────────── */}
      <g transform="translate(-18,-32)">
        <text x="-24" y="-6" fontSize="6.4" fontWeight="800" fill="var(--texto2)" letterSpacing="1.2">ENERGÍA</text>
        <rect x="-24" y="0" width="40" height="8.6" rx="4.3" fill="var(--sup2)" stroke="var(--borde-f)" strokeWidth="0.9" />
        <rect className="cf-barra" x="-23" y="1" width={reducido ? 38 : 0} height="6.6" rx="3.3" fill={`url(#energia-${U})`} />
        {/* El rótulo va DESPUÉS de la barra, con aire: encima se solapaba. */}
        <text className="cf-pct" x="21" y="7" fontSize="9.2" fontWeight="900"
          fill={P.verde.base} opacity={reducido ? 1 : 0}
          style={{ transformOrigin: '30px 4px', paintOrder: 'stroke', stroke: 'var(--sup1)', strokeWidth: 2.4, strokeLinejoin: 'round' }}
        >100 %</text>
      </g>

      {/* Chispas del remate */}
      <g transform="translate(-24,-24)">
        {!reducido && Array.from({ length: 7 }, (_, i) => (
          <g className="cf-chispa" key={i} opacity="0">
            <Chispa r={i % 2 ? 3.4 : 2.6} color={[P.amarillo.base, P.verde.luz, P.amarillo.luz][i % 3]} />
          </g>
        ))}
      </g>
    </svg>
  );
}
