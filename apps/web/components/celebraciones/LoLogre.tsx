'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline, stagger } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «¡Lo logréee!» — llega arrastrándose, muerto, y al cruzar la meta se levanta
 * con el cartel en alto.
 *
 * ESTILO. Sigue la referencia aprobada: cartoon de PEGATINA — contorno negro
 * grueso, color PLANO (nada de degradados) y la bandera de Venezuela como paleta.
 * Por eso NO usa `estilo.tsx`, que es el sistema de sombreado 3D: mezclarlos daría
 * un híbrido que no es ninguno de los dos. Si más adelante se aprueban otras en
 * este mismo lenguaje, lo que hay que extraer es ESTE fichero, no aquél.
 *
 * Cómo se consigue el contorno: cada forma lleva `stroke` negro con
 * `strokeLinejoin="round"`, y las piezas van en orden de profundidad (lo de atrás
 * primero). Un contorno de grosor constante funciona AQUÍ justamente porque el
 * lenguaje es de pegatina; en una ilustración con volumen quedaría rígido.
 *
 * MONTAJE
 *   - Dos poses dibujadas que se cruzan en 180 ms, tapadas por un salto.
 *   - Un grupo, una propiedad: `.ll-heroe` avanza, `.ll-cuerpo` salta, `.ll-bob`
 *     respira, `.ll-cartel` se alza. Así dos animaciones nunca pelean por el
 *     mismo `transform`.
 */

const TINTA = '#14171C';
const AMARILLO = '#FFD100';
const AZUL = '#1B4FA0';
const ROJO = '#E33241';
const PIEL = '#F8CBA2';
const PIEL_S = '#E3A87B';
const PELO = '#1B1B1F';

const G = 2.3;  // grosor del contorno

/** Confeti en colores de bandera: cuadrados girados, círculos y chispas. */
const CONFETI = Array.from({ length: 16 }, (_, i) => {
  const ang = (i / 16) * Math.PI * 2 + 0.4;
  const dist = 22 + (i % 4) * 8;
  return {
    x: +(Math.cos(ang) * dist).toFixed(1),
    y: +(Math.sin(ang) * dist * 0.78).toFixed(1),
    color: [AMARILLO, AZUL, ROJO][i % 3],
    forma: i % 3,           // 0 cuadro · 1 círculo · 2 chispa
    giro: (i * 37) % 360,
  };
});

export default function LoLogre({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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
      const bob = uno<SVGGElement>('.ll-bob');
      const sudor = todos<SVGGElement>('.ll-sudor');
      const esfuerzo = todos<SVGPathElement>('.ll-esfuerzo');

      // Jadeo mientras se arrastra. Nº PAR de vueltas con `alternate` → acaba donde empezó.
      if (bob) vivos.push(animate(bob, { translateY: [0, -1.9], duration: 220, loop: 8, alternate: true, ease: 'inOutQuad' }));
      if (sudor.length) {
        vivos.push(animate(sudor, {
          translateY: [0, 9], opacity: [1, 0], duration: 760, delay: stagger(220), loop: 2, ease: 'inQuad',
        }));
      }
      if (esfuerzo.length) {
        vivos.push(animate(esfuerzo, {
          translateX: [0, -7], opacity: [0.9, 0], duration: 520, delay: stagger(120), loop: 3, ease: 'outQuad',
        }));
      }

      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      const heroe = uno<SVGGElement>('.ll-heroe');
      if (heroe) {
        tl.add(heroe, { opacity: [0, 1], duration: 200 }, 0);
        // Tres TIRONES: el esfuerzo se ve en los tirones, no en un avance liso.
        tl.add(heroe, { translateX: [-26, -14], duration: 430 }, 200);
        tl.add(heroe, { translateX: -2, duration: 430 }, 690);
        tl.add(heroe, { translateX: 11, duration: 470 }, 1180);
      }

      const arrastre = uno<SVGGElement>('.ll-arrastre');
      const triunfo = uno<SVGGElement>('.ll-triunfo');
      const cuerpo = uno<SVGGElement>('.ll-cuerpo');
      if (arrastre) tl.add(arrastre, { opacity: [1, 0], duration: 160 }, 1690);
      if (triunfo) tl.add(triunfo, { opacity: [0, 1], duration: 220 }, 1700);
      if (cuerpo) {
        tl.add(cuerpo, { translateY: [0, -10], duration: 210 }, 1670);
        tl.add(cuerpo, { translateY: 0, duration: 300, ease: 'outBounce' }, 1880);
      }

      const cartel = uno<SVGGElement>('.ll-cartel');
      if (cartel) {
        tl.add(cartel, { opacity: [0, 1], translateY: [16, 0], scale: [0.55, 1], duration: 520, ease: 'outBack' }, 1700);
        // Ondeo del remate.
        tl.add(cartel, {
          rotate: [{ to: 5, duration: 220 }, { to: -4.5, duration: 250 }, { to: 3, duration: 220 }, { to: 0, duration: 240 }],
          ease: 'inOutQuad',
        }, 2260);
      }

      todos<SVGGElement>('.ll-conf').forEach((g, i) => {
        const c = CONFETI[i];
        if (!c) return;
        tl.add(g, {
          translateX: c.x, translateY: c.y, rotate: i % 2 ? 190 : -170,
          scale: [0.3, 1], opacity: [1, 0], duration: 1250, delay: i * 20, ease: 'outCubic',
        }, 2200);
      });

      tl.add(raiz, { opacity: 1, duration: 420 }, 2960);
    } catch {
      vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } });
      finRef.current();
      return;
    }
    return () => { vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } }); };
  }, [reducido]);

  /** Zapato blanco con franjas rojas (el de la referencia). */
  const Zapato = ({ x, y, r = 0 }: { x: number; y: number; r?: number }) => (
    <g transform={`translate(${x},${y}) rotate(${r})`}>
      <path d="M -5.4 -2.4 Q 1.6 -3.4 4.4 0 Q 5.4 2.4 2 2.8 L -4.6 2.6 Q -6.2 1 -5.4 -2.4 Z"
        fill="#FFFFFF" stroke={TINTA} strokeWidth={G} strokeLinejoin="round" />
      <path d="M -3.4 -2.6 V 2.7 M -1 -2.9 V 2.8" stroke={ROJO} strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );

  return (
    <svg
      ref={raizRef} width={size} height={size} viewBox="-60 -60 120 120"
      preserveAspectRatio="xMidYMid meet"
      className={'cel-svg' + (reducido ? ' cel-svg-quieto' : '')}
      style={{ maxWidth: '100%', height: 'auto' }} aria-hidden="true" focusable="false"
    >
      {/* ── Meta: franja a cuadros con los colores de la bandera + banderín ── */}
      <g>
        <rect x="18" y="28" width="34" height="6.4" rx="1.4" fill="#FFFFFF" stroke={TINTA} strokeWidth={G} strokeLinejoin="round" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={19.2 + i * 5.4} y={i % 2 ? 31.4 : 29} width="5.4" height="3.2"
            fill={[AMARILLO, AZUL, ROJO][i % 3]} />
        ))}
        <rect x="18" y="28" width="34" height="6.4" rx="1.4" fill="none" stroke={TINTA} strokeWidth={G} strokeLinejoin="round" />
        <path d="M 50 29 V 8" stroke={TINTA} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M 50 8 L 50 17 L 38 12.6 Z" fill={ROJO} stroke={TINTA} strokeWidth={G} strokeLinejoin="round" />
      </g>

      <g className="ll-escala" transform="translate(0,4) scale(1.28)">
      <g className="ll-heroe" transform={reducido ? 'translate(11,0)' : 'translate(-26,0)'} opacity={reducido ? 1 : 0}>
        <g className="ll-cuerpo">
          <g className="ll-bob">

            {/* ══════════ POSE A — arrastrándose, muerto ══════════ */}
            <g className="ll-arrastre" opacity={reducido ? 0 : 1}>
              {/* Rayas de esfuerzo */}
              {!reducido && [[-34, 20], [-37, 26], [-33, 31]].map(([x, y], i) => (
                <path className="ll-esfuerzo" key={i} d={`M ${x} ${y} h ${6 + i}`}
                  stroke={TINTA} strokeWidth="1.8" strokeLinecap="round" opacity="0" />
              ))}

              {/* Pierna trasera + zapato */}
              <path d="M -6 25 Q -17 27 -25 29" fill="none" stroke={TINTA} strokeWidth={G + 5} strokeLinecap="round" />
              <path d="M -6 25 Q -17 27 -25 29" fill="none" stroke={AZUL} strokeWidth={G + 2.4} strokeLinecap="round" />
              <Zapato x={-27} y={29.4} r={-8} />
              {/* Pierna delantera + zapato */}
              <path d="M -5 29 Q -15 31.4 -22 33" fill="none" stroke={TINTA} strokeWidth={G + 5} strokeLinecap="round" />
              <path d="M -5 29 Q -15 31.4 -22 33" fill="none" stroke={AZUL} strokeWidth={G + 2.4} strokeLinecap="round" />
              <Zapato x={-24} y={33.2} r={-4} />

              {/* Torso tumbado (camiseta amarilla) */}
              <path d="M -9 19.4 Q 3 17 9 21 Q 12 24.6 8 28.4 Q -2 31 -10 28 Q -13 24 -9 19.4 Z"
                fill={AMARILLO} stroke={TINTA} strokeWidth={G} strokeLinejoin="round" />
              {/* Brazos estirados hacia delante */}
              <path d="M 8 24 L 19 27.6" fill="none" stroke={TINTA} strokeWidth={G + 4.6} strokeLinecap="round" />
              <path d="M 8 24 L 19 27.6" fill="none" stroke={PIEL} strokeWidth={G + 2} strokeLinecap="round" />
              <path d="M 9 27.4 L 17.6 30.6" fill="none" stroke={TINTA} strokeWidth={G + 4.6} strokeLinecap="round" />
              <path d="M 9 27.4 L 17.6 30.6" fill="none" stroke={PIEL_S} strokeWidth={G + 2} strokeLinecap="round" />
              <ellipse cx="20.6" cy="28" rx="3.4" ry="2.8" fill={PIEL} stroke={TINTA} strokeWidth={G} />
              <ellipse cx="19.2" cy="31" rx="3.2" ry="2.6" fill={PIEL_S} stroke={TINTA} strokeWidth={G} />

              {/* Cabeza */}
              <g>
                <circle cx="15.6" cy="17.6" r="8.6" fill={PIEL} stroke={TINTA} strokeWidth={G} />
                {/* Pelo en púas */}
                <path d="M 7.4 13.4 Q 6.4 4.4 12.8 5.8 Q 14.6 1.4 18.6 4.6 Q 22.8 2.4 23.6 7.6 Q 26.6 9.8 23.8 13 Q 19.6 8.2 7.4 13.4 Z"
                  fill={PELO} stroke={TINTA} strokeWidth={G} strokeLinejoin="round" />
                {/* Ojos medio cerrados de agotamiento */}
                <path d="M 10.6 17 q 2.6 -2.4 5 -0.4" fill="none" stroke={TINTA} strokeWidth="1.9" strokeLinecap="round" />
                <path d="M 17.4 16.4 q 2.4 -1.8 4.6 0.4" fill="none" stroke={TINTA} strokeWidth="1.9" strokeLinecap="round" />
                <path d="M 11.4 18.6 h 3.4 M 18.4 18.2 h 3.2" stroke={TINTA} strokeWidth="1.5" strokeLinecap="round" />
                {/* Boca abierta + lengua fuera */}
                <path d="M 13 21.6 Q 16.6 20.6 19.6 21.8 Q 18 25.4 13 21.6 Z" fill={TINTA} />
                <path d="M 15 23.6 q 2.4 0.4 2.6 3 q -2.4 1.4 -3.6 -0.8 Z" fill={ROJO} stroke={TINTA} strokeWidth="1.5" strokeLinejoin="round" />
                {/* Rubor plano (sin difuminar: aquí el lenguaje es plano) */}
                <ellipse cx="9.6" cy="20.6" rx="2.2" ry="1.4" fill={ROJO} opacity="0.35" />
              </g>

              {/* Gotas de sudor */}
              {!reducido && [[7.4, 8.4], [24.4, 10.4], [5.6, 14]].map(([x, y], i) => (
                <g className="ll-sudor" key={i}>
                  <path d={`M ${x} ${y} q 2.6 3.6 0 4.9 q -2.6 -1.3 0 -4.9 Z`}
                    fill="#63A6E8" stroke={TINTA} strokeWidth="1.6" strokeLinejoin="round" />
                </g>
              ))}
            </g>

            {/* ══════════ POSE B — de pie, gritando ══════════ */}
            <g className="ll-triunfo" opacity={reducido ? 1 : 0}>
              {/* Piernas */}
              <path d="M -4.4 31 L -3 17" fill="none" stroke={TINTA} strokeWidth={G + 5.4} strokeLinecap="round" />
              <path d="M -4.4 31 L -3 17" fill="none" stroke={AZUL} strokeWidth={G + 2.8} strokeLinecap="round" />
              <path d="M 5.4 31 L 4 17" fill="none" stroke={TINTA} strokeWidth={G + 5.4} strokeLinecap="round" />
              <path d="M 5.4 31 L 4 17" fill="none" stroke={AZUL} strokeWidth={G + 2.8} strokeLinecap="round" />
              <Zapato x={-6.6} y={31.6} r={-6} />
              <Zapato x={7.4} y={31.6} r={6} />

              {/* Camiseta */}
              <path d="M -9.4 18 Q -11.4 3.6 0 1.4 Q 11.4 3.6 9.4 18 Q 0 20.4 -9.4 18 Z"
                fill={AMARILLO} stroke={TINTA} strokeWidth={G} strokeLinejoin="round" />
              {/* Brazos en alto */}
              <path d="M -8 6 L -15.6 -14.6" fill="none" stroke={TINTA} strokeWidth={G + 4.8} strokeLinecap="round" />
              <path d="M -8 6 L -15.6 -14.6" fill="none" stroke={PIEL} strokeWidth={G + 2.2} strokeLinecap="round" />
              <path d="M 8 6 L 15.6 -14.6" fill="none" stroke={TINTA} strokeWidth={G + 4.8} strokeLinecap="round" />
              <path d="M 8 6 L 15.6 -14.6" fill="none" stroke={PIEL} strokeWidth={G + 2.2} strokeLinecap="round" />
              <circle cx="-16.6" cy="-16.4" r="3.6" fill={PIEL} stroke={TINTA} strokeWidth={G} />
              <circle cx="16.6" cy="-16.4" r="3.6" fill={PIEL} stroke={TINTA} strokeWidth={G} />

              {/* Cabeza */}
              <circle cx="0" cy="-7" r="9.2" fill={PIEL} stroke={TINTA} strokeWidth={G} />
              <path d="M -9.1 -12.6 Q -10.6 -22.4 -3.6 -20.4 Q -1.4 -25 2.6 -21.6 Q 7.6 -23.4 8.2 -18 Q 11.6 -15.4 8.8 -12.2 Q 3.6 -17.6 -9.1 -12.6 Z"
                fill={PELO} stroke={TINTA} strokeWidth={G} strokeLinejoin="round" />
              {/* Ojos cerrados de risa */}
              <path d="M -6.4 -8.4 q 2.6 -3 5 0" fill="none" stroke={TINTA} strokeWidth="2" strokeLinecap="round" />
              <path d="M 1.4 -8.4 q 2.6 -3 5 0" fill="none" stroke={TINTA} strokeWidth="2" strokeLinecap="round" />
              {/* Boca de grito + lengua */}
              <path d="M -5.4 -3 Q 0 -4.4 5.4 -3 Q 4.6 4.6 0 5 Q -4.6 4.6 -5.4 -3 Z"
                fill={TINTA} stroke={TINTA} strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M -3 2 Q 0 0.6 3 2 Q 2.4 4.6 0 4.8 Q -2.4 4.6 -3 2 Z" fill={ROJO} />
              <ellipse cx="-7.2" cy="-3.6" rx="2.4" ry="1.5" fill={ROJO} opacity="0.35" />
              <ellipse cx="7.2" cy="-3.6" rx="2.4" ry="1.5" fill={ROJO} opacity="0.35" />
            </g>

          </g>
        </g>

        {/* ── Confeti ── */}
        <g transform="translate(0,-14)">
          {!reducido && CONFETI.map((c, i) => (
            <g className="ll-conf" key={i} opacity="0" transform={`rotate(${c.giro})`}>
              {c.forma === 0 && <rect x="-2" y="-2.8" width="4" height="5.6" rx="0.8" fill={c.color} />}
              {c.forma === 1 && <circle r="2.4" fill={c.color} />}
              {c.forma === 2 && (
                <path d="M 0 -4 Q 0.7 -0.7 4 0 Q 0.7 0.7 0 4 Q -0.7 0.7 -4 0 Q -0.7 -0.7 0 -4 Z" fill={c.color} />
              )}
            </g>
          ))}
        </g>

        {/* ── El cartel ── */}
        <g className="ll-cartel" opacity={reducido ? 1 : 0} style={{ transformOrigin: '60px 33px' }}>
          <g transform="rotate(-3)">
            <rect x="-33" y="-41" width="66" height="21" rx="4.4" fill="#FFFFFF" stroke={TINTA} strokeWidth="2.8" strokeLinejoin="round" />
            <clipPath id="cartel-lolog">
              <rect x="-33" y="-41" width="66" height="21" rx="4.4" />
            </clipPath>
            <g clipPath="url(#cartel-lolog)">
              <rect x="-33" y="-41" width="66" height="7" fill={AMARILLO} />
              <rect x="-33" y="-34" width="66" height="7" fill={AZUL} />
              <rect x="-33" y="-27" width="66" height="7" fill={ROJO} />
            </g>
            <rect x="-33" y="-41" width="66" height="21" rx="4.4" fill="none" stroke={TINTA} strokeWidth="2.8" strokeLinejoin="round" />
            <text
              x="0" y="-30.2" textAnchor="middle" dominantBaseline="central"
              fontSize="12.4" fontWeight="900" fill="#FFFFFF"
              textLength="56" lengthAdjust="spacingAndGlyphs"
              style={{ paintOrder: 'stroke', stroke: TINTA, strokeWidth: 3.4, strokeLinejoin: 'round' }}
            >¡Lo logréee!</text>
          </g>
        </g>
      </g>
      </g>
    </svg>
  );
}
