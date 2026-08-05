'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, lin, SombraSuelo, Ojo, Chispa } from './estilo';

/**
 * «Gato teclista» — teclea como un poseso, la pantalla pasa a «¡listo!» y se queda
 * mirando al frente con cara de suficiencia.
 *
 * Humor puro y sin coste emocional: es la que se pone cuando el hito es pequeño
 * pero la persona lleva horas ahí.
 *
 * ACABADO: el pelaje va en dos capas (base atigrada + pecho claro), las orejas
 * llevan interior rosa, hay bigotes finos y la pantalla es un cristal con reflejo
 * diagonal. Las patas se difuminan al teclear con tres copias desfasadas — el
 * truco clásico de animación para «movimiento imposible de seguir».
 */

const U = 'gato';
const NARANJA = { sombra: '#A85714', base: '#E08A2E', luz: '#F2AC5E' };

export default function GatoTeclista({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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
      // Teclear: patas y cuerpo vibrando.
      const patas = todos<SVGGElement>('.ga-pata');
      patas.forEach((p, i) => {
        vivos.push(animate(p, {
          translateY: [0, -3.4], duration: 70, loop: 22, alternate: true, ease: 'inOutQuad', delay: i * 35,
        }));
      });
      const cuerpo = uno<SVGGElement>('.ga-cuerpo');
      if (cuerpo) vivos.push(animate(cuerpo, { translateX: [-0.7, 0.7], duration: 60, loop: 26, alternate: true, ease: 'inOutQuad' }));
      const cola = uno<SVGPathElement>('.ga-cola');
      if (cola) vivos.push(animate(cola, { rotate: [-9, 9], duration: 420, loop: 8, alternate: true, ease: 'inOutQuad' }));

      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      const escena = uno<SVGGElement>('.ga-escena');
      if (escena) tl.add(escena, { opacity: [0, 1], scale: [0.85, 1], duration: 400, ease: 'outBack' }, 0);

      // La pantalla cambia de «procesando» a «¡listo!».
      const proc = uno<SVGGElement>('.ga-proc');
      const listo = uno<SVGGElement>('.ga-listo');
      if (proc) tl.add(proc, { opacity: [1, 0], duration: 140 }, 1500);
      if (listo) tl.add(listo, { opacity: [0, 1], scale: [0.5, 1], duration: 340, ease: 'outBack' }, 1540);

      // Se para de teclear y mira al frente.
      const cara = uno<SVGGElement>('.ga-cara');
      if (cara) {
        tl.add(cara, { translateY: [0, -3], duration: 220, ease: 'outBack' }, 1560);
        tl.add(cara, { translateY: 0, duration: 320, ease: 'outBounce' }, 1800);
      }
      const ceja = uno<SVGGElement>('.ga-ceja');
      if (ceja) tl.add(ceja, { opacity: [0, 1], translateY: [2, 0], duration: 260 }, 1720);
      const gafas = uno<SVGGElement>('.ga-destello');
      if (gafas) tl.add(gafas, { opacity: [0, 0.9, 0], translateX: [-8, 8], duration: 560 }, 1780);

      todos<SVGGElement>('.ga-chispa').forEach((g, i) => {
        tl.add(g, {
          translateX: (i % 2 ? 1 : -1) * (16 + i * 5), translateY: -18 - i * 6,
          opacity: [1, 0], scale: [0.3, 1], duration: 800, delay: i * 40, ease: 'outCubic',
        }, 1600);
      });
      tl.add(raiz, { opacity: 1, duration: 600 }, 2500);
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
      <DefsCelebracion u={U} tonos={['metal', 'verde', 'azul', 'amarillo', 'rojo']} />
      <defs>
        <radialGradient id={`pelo-${U}`} cx="36%" cy="26%" r="78%">
          <stop offset="0%" stopColor={NARANJA.luz} />
          <stop offset="52%" stopColor={NARANJA.base} />
          <stop offset="100%" stopColor={NARANJA.sombra} />
        </radialGradient>
      </defs>

      <SombraSuelo u={U} cx={0} cy={34} rx={26} ry={4} opacidad={0.2} />
      <path d="M -44 33 H 44" stroke="var(--borde-f)" strokeWidth="2.6" strokeLinecap="round" opacity="0.7" />

      <g className="ga-escena" style={{ transformOrigin: '60px 60px' }} opacity={reducido ? 1 : 0}>
        {/* ── Portátil ─────────────────────────────────────────────── */}
        <g transform="translate(-16,0)">
          {/* Pantalla */}
          <rect x="-24" y="-26" width="42" height="30" rx="3" fill={P.metal.sombra} />
          <rect x="-22" y="-24" width="38" height="26" rx="2" fill="#101A2B" />
          <g className="ga-proc" opacity={reducido ? 0 : 1}>
            <text x="-3" y="-11.6" textAnchor="middle" fontSize="6.2" fontWeight="700" fill={P.metal.luz}>procesando…</text>
            <rect x="-16" y="-7" width="26" height="3" rx="1.5" fill={P.metal.sombra} />
            <rect x="-16" y="-7" width="17" height="3" rx="1.5" fill={P.azul.luz} />
          </g>
          <g className="ga-listo" opacity={reducido ? 1 : 0} style={{ transformOrigin: '57px 46px' }}>
            <path d="M -11 -12 l 4 4.6 8-9.6" fill="none" stroke={P.verde.luz} strokeWidth="3.4"
              strokeLinecap="round" strokeLinejoin="round" />
            <text x="-3" y="-2.6" textAnchor="middle" fontSize="7.4" fontWeight="900" fill={P.verde.luz}>¡listo!</text>
          </g>
          {/* Reflejo diagonal del cristal */}
          <path d="M -22 2 L -6 -24 L 1 -24 L -15 2 Z" fill="#fff" opacity="0.06" />
          {/* Teclado */}
          <path d="M -26 4 H 20 L 25 12 H -31 Z" fill={lin('metal', U)} />
          <path d="M -24.4 5.6 H 18.4" stroke="#fff" strokeWidth="1.2" opacity="0.4" strokeLinecap="round" />
        </g>

        {/* ── Gato ─────────────────────────────────────────────────── */}
        <g className="ga-cuerpo" transform="translate(16,0)">
          {/* Cola */}
          <path className="ga-cola" d="M 15 24 Q 30 22 27 8" fill="none" stroke={NARANJA.base}
            strokeWidth="4.4" strokeLinecap="round" style={{ transformOrigin: '75px 84px' }} />
          {/* Cuerpo */}
          <ellipse cx="2" cy="20" rx="15" ry="12" fill={`url(#pelo-${U})`} />
          <ellipse cx="0" cy="24" rx="8.6" ry="7" fill="#F7DCC0" opacity="0.85" />
          {/* Rayas de atigrado */}
          {[[-6, 12], [-2, 10], [3, 10.4]].map(([x, y], i) => (
            <path key={i} d={`M ${x} ${y} q 2 3 0 6`} fill="none" stroke={NARANJA.sombra} strokeWidth="1.5"
              opacity="0.5" strokeLinecap="round" />
          ))}
          {/* Patas que teclean */}
          <g className="ga-pata"><ellipse cx="-10" cy="12" rx="3.6" ry="2.8" fill={NARANJA.luz} /></g>
          <g className="ga-pata"><ellipse cx="-3" cy="13" rx="3.6" ry="2.8" fill={NARANJA.base} /></g>

          {/* Cabeza */}
          <g className="ga-cara">
            {/* Orejas con interior */}
            <path d="M -10.6 -1 L -13 -12 L -3.4 -6.4 Z" fill={NARANJA.base} />
            <path d="M -10 -3 L -11.2 -9 L -5.8 -6 Z" fill="#E39BA0" />
            <path d="M 10.6 -1 L 13 -12 L 3.4 -6.4 Z" fill={NARANJA.base} />
            <path d="M 10 -3 L 11.2 -9 L 5.8 -6 Z" fill="#E39BA0" />
            <circle cx="0" cy="1" r="11.4" fill={`url(#pelo-${U})`} />
            <path d="M 8.6 -4.4 A 11.4 11.4 0 0 1 8.8 6.6" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.4" strokeLinecap="round" />
            {/* Hocico */}
            <ellipse cx="0" cy="5.4" rx="6.6" ry="4.6" fill="#F7DCC0" />
            <Ojo x={-4.2} y={0.4} r={3.2} iris="verde" u={U} />
            <Ojo x={4.2} y={0.4} r={3.2} iris="verde" u={U} />
            {/* Ceja de suficiencia */}
            <g className="ga-ceja" opacity={reducido ? 1 : 0}>
              <path d="M -7.4 -4.4 q 3 -1.8 5.8 -0.6" fill="none" stroke={NARANJA.sombra} strokeWidth="1.3" strokeLinecap="round" />
              <path d="M 1.6 -5 q 2.8 -1.2 5.8 0.6" fill="none" stroke={NARANJA.sombra} strokeWidth="1.3" strokeLinecap="round" />
            </g>
            {/* Nariz y boca */}
            <path d="M -1.8 3.6 h 3.6 L 0 5.8 Z" fill="#D4707C" />
            <path d="M 0 5.8 v 1.6 M 0 7.4 q -2.4 2 -4 0 M 0 7.4 q 2.4 2 4 0" fill="none"
              stroke={NARANJA.sombra} strokeWidth="1" strokeLinecap="round" />
            {/* Bigotes */}
            {[[-7, 4.6, -16, 3], [-7, 6.2, -16, 7], [7, 4.6, 16, 3], [7, 6.2, 16, 7]].map(([x1, y1, x2, y2], i) => (
              <path key={i} d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={P.metal.base} strokeWidth="0.7"
                opacity="0.65" strokeLinecap="round" />
            ))}
            {/* Destello de gafas imaginario al mirar al frente */}
            <g className="ga-destello" opacity="0">
              <path d="M -8 -2 L 8 -2" stroke="#fff" strokeWidth="2.4" opacity="0.8" strokeLinecap="round" />
            </g>
          </g>
        </g>

        {!reducido && Array.from({ length: 5 }, (_, i) => (
          <g className="ga-chispa" key={i} opacity="0" transform="translate(16,-8)">
            <Chispa r={i % 2 ? 3 : 2.2} color={[P.amarillo.base, P.verde.luz, '#fff'][i % 3]} />
          </g>
        ))}
      </g>
    </svg>
  );
}
