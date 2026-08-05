'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline, stagger } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, lin, SombraSuelo, Ojo, Rubor, Chispa } from './estilo';

/**
 * «¡Lo logréee!» — llega ARRASTRÁNDOSE hasta la meta con su letrero, y al tocarla
 * se levanta y lo ondea.
 *
 * La gracia es el contraste: primero el agotamiento (tirones, polvo, sudor, el
 * letrero temblando) y de golpe el triunfo. No se celebra la emergencia: se
 * reconoce a quien empujó hasta cerrar.
 *
 * ACABADO (ver `estilo.tsx`): cada forma redonda lleva su degradado radial, hay
 * luz de borde en el canto derecho, rubor difuminado, sombra proyectada en el
 * suelo y brillos especulares. Nada de rellenos lisos.
 *
 * MONTAJE
 *   - Dos POSES dibujadas (`.ll-arrastre` / `.ll-triunfo`) que se cruzan en 180 ms
 *     tapadas por un salto. Más barato y legible que un rig.
 *   - El LETRERO es continuo entre las dos: es el hilo que las enlaza.
 *   - Un grupo, una propiedad: `.ll-heroe` avanza, `.ll-cuerpo` salta, `.ll-bob`
 *     respira, `.ll-letrero` se alza, `.ll-tiembla` vibra. Así dos animaciones
 *     nunca pelean por el mismo `transform`.
 */

const U = 'lolog';
const pivote = (x: number, y: number) => `${60 + x}px ${60 + y}px`;
const MANO = pivote(2, 24);

const CHISPAS = Array.from({ length: 10 }, (_, i) => {
  const ang = (i / 10) * Math.PI * 2 + 0.35;
  const d = i % 2 ? 26 : 35;
  return {
    x: +(Math.cos(ang) * d).toFixed(1),
    y: +(Math.sin(ang) * d).toFixed(1),
    color: [P.amarillo.base, P.azul.luz, P.rojo.base, P.verde.luz][i % 4],
    r: i % 3 === 0 ? 3.4 : 2.6,
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
      const tiembla = uno<SVGGElement>('.ll-tiembla');
      const gota = uno<SVGGElement>('.ll-gota');
      const polvo = todos<SVGPathElement>('.ll-polvo');

      if (bob) vivos.push(animate(bob, { translateY: [0, -2.2], duration: 210, loop: 8, alternate: true, ease: 'inOutQuad' }));
      if (tiembla) vivos.push(animate(tiembla, { rotate: [-2.8, 2.8], duration: 105, loop: 16, alternate: true, ease: 'inOutQuad' }));
      if (gota) vivos.push(animate(gota, { translateY: [0, 11], opacity: [0.9, 0], duration: 720, delay: 340, loop: 2, ease: 'inQuad' }));
      if (polvo.length) {
        vivos.push(animate(polvo, {
          translateX: [0, -9], opacity: [0.55, 0], duration: 520, delay: stagger(110), loop: 3, ease: 'outQuad',
        }));
      }

      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      const heroe = uno<SVGGElement>('.ll-heroe');
      if (heroe) {
        tl.add(heroe, { opacity: [0, 1], duration: 200 }, 0);
        // Tres TIRONES, no un avance continuo: así se ve el esfuerzo.
        tl.add(heroe, { translateX: [-24, -12], duration: 430 }, 200);
        tl.add(heroe, { translateX: 1, duration: 430 }, 690);
        tl.add(heroe, { translateX: 14, duration: 470 }, 1180);
      }

      const arrastre = uno<SVGGElement>('.ll-arrastre');
      const triunfo = uno<SVGGElement>('.ll-triunfo');
      const cuerpo = uno<SVGGElement>('.ll-cuerpo');
      if (arrastre) tl.add(arrastre, { opacity: [1, 0], duration: 170 }, 1690);
      if (triunfo) tl.add(triunfo, { opacity: [0, 1], duration: 230 }, 1700);
      if (cuerpo) {
        tl.add(cuerpo, { translateY: [0, -9], duration: 210 }, 1670);
        tl.add(cuerpo, { translateY: 0, duration: 300, ease: 'outBounce' }, 1880);
      }

      const letrero = uno<SVGGElement>('.ll-letrero');
      if (tiembla) tl.add(tiembla, { rotate: 0, duration: 260 }, 1700);
      if (letrero) {
        tl.add(letrero, { translateY: [0, -25], duration: 520, ease: 'outBack' }, 1700);
        tl.add(letrero, { rotate: [-13, 0], duration: 430, ease: 'outCubic' }, 1700);
      }

      todos<SVGGElement>('.ll-chispa').forEach((g, i) => {
        const c = CHISPAS[i];
        if (!c) return;
        tl.add(g, {
          translateX: c.x, translateY: c.y, rotate: i % 2 ? 160 : -150,
          scale: [1, 0.4], opacity: [1, 0], duration: 950, delay: i * 26, ease: 'outCubic',
        }, 2170);
      });

      // Remate: tres ondeos y se queda en alto.
      if (letrero) {
        tl.add(letrero, {
          rotate: [{ to: 9, duration: 200 }, { to: -8, duration: 240 }, { to: 6, duration: 210 }, { to: 0, duration: 230 }],
          ease: 'inOutQuad',
        }, 2260);
      }
      tl.add(raiz, { opacity: 1, duration: 420 }, 2940);
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
      <DefsCelebracion u={U} tonos={['azul', 'piel', 'pelo', 'amarillo', 'madera', 'metal', 'rojo']} />

      {/* ── Escenario ─────────────────────────────────────────────────── */}
      <path d="M -56 31.5 H 56" stroke="var(--borde-f)" strokeWidth="2.6" strokeLinecap="round" opacity="0.7" />
      {/* Poste de meta, con volumen */}
      <rect x="36.6" y="-15" width="2.8" height="47" rx="1.4" fill={lin('metal', U)} />
      <g>
        <rect x="39" y="-16" width="15" height="11" rx="1.2" fill="#fff" />
        <rect x="39" y="-16" width="7.5" height="5.5" fill={P.pelo.sombra} />
        <rect x="46.5" y="-10.5" width="7.5" height="5.5" fill={P.pelo.sombra} />
        <rect x="39" y="-16" width="15" height="11" rx="1.2" fill="none" stroke={P.metal.sombra} strokeWidth="0.9" />
      </g>

      {/* ── El personaje ──────────────────────────────────────────────── */}
      <g className="ll-heroe" transform={reducido ? 'translate(14,0)' : 'translate(-24,0)'} opacity={reducido ? 1 : 0}>
        <SombraSuelo u={U} cx={0} cy={32} rx={17} ry={3.4} opacidad={0.22} />
        <g className="ll-cuerpo">
          <g className="ll-bob">

            {/* POSE A — arrastrándose, hecho polvo */}
            <g className="ll-arrastre" opacity={reducido ? 0 : 1}>
              <path className="ll-polvo" d="M -29 25 h 7" stroke={P.metal.base} strokeWidth="2.2" strokeLinecap="round" opacity="0" />
              <path className="ll-polvo" d="M -32 29.5 h 9" stroke={P.metal.base} strokeWidth="2.2" strokeLinecap="round" opacity="0" />
              <path className="ll-polvo" d="M -28 33 h 6" stroke={P.metal.base} strokeWidth="2.2" strokeLinecap="round" opacity="0" />
              {/* Piernas arrastradas */}
              <path d="M -3 26 C -11 28.4 -17 30.4 -23 30.4" fill="none" stroke={P.azul.sombra} strokeWidth="5.4" strokeLinecap="round" />
              <path d="M -2 29.3 C -10 31.4 -16 33.4 -21 33.4" fill="none" stroke={P.azul.base} strokeWidth="5.4" strokeLinecap="round" />
              <ellipse cx="-24" cy="30.4" rx="3.8" ry="2.4" fill={vol('pelo', U)} />
              <ellipse cx="-22" cy="33.4" rx="3.8" ry="2.4" fill={vol('pelo', U)} />
              {/* Torso con volumen y pliegue */}
              <ellipse cx="0" cy="25" rx="13.4" ry="6.9" fill={vol('azul', U)} />
              <path d="M -9 21.6 Q 0 19.4 9.4 21.8" fill="none" stroke={P.azul.brillo} strokeWidth="1.3" opacity="0.45" strokeLinecap="round" />
              <path d="M -7 27.8 q 6 1.8 12 0" fill="none" stroke={P.azul.sombra} strokeWidth="1.1" opacity="0.6" strokeLinecap="round" />
              {/* Brazo que tira */}
              <path d="M 9 24.6 L 20 28.2" fill="none" stroke={P.piel.sombra} strokeWidth="4.6" strokeLinecap="round" />
              <path d="M 9 24.2 L 19.4 27.6" fill="none" stroke={P.piel.base} strokeWidth="3.4" strokeLinecap="round" />
              <circle cx="21" cy="28.6" r="3.4" fill={vol('piel', U)} />
              <path d="M 3 21 L 2 24" stroke={P.piel.base} strokeWidth="4.2" strokeLinecap="round" />
              {/* Cabeza agotada */}
              <circle cx="13" cy="17.6" r="8" fill={vol('piel', U)} />
              <path d="M 19.4 13 A 8 8 0 0 1 19.8 21.4" fill="none" stroke="#fff" strokeWidth="1.3" opacity="0.5" strokeLinecap="round" />
              <path d="M 5.4 15.2 Q 8.6 6.6 18.4 10.9 Q 21.2 12.2 20.7 15 Q 14 10.7 5.4 15.2 Z" fill={vol('pelo', U)} />
              <path d="M 8.4 12.6 Q 12.6 9.8 17.6 11.8" fill="none" stroke={P.pelo.brillo} strokeWidth="1" opacity="0.55" strokeLinecap="round" />
              {/* Ojos cerrados de esfuerzo */}
              <path d="M 9.4 18 q 1.8 1.9 3.6 0" fill="none" stroke={P.pelo.sombra} strokeWidth="1.4" strokeLinecap="round" />
              <path d="M 15 18 q 1.8 1.9 3.6 0" fill="none" stroke={P.pelo.sombra} strokeWidth="1.4" strokeLinecap="round" />
              <ellipse cx="14.4" cy="22.3" rx="2.3" ry="1.9" fill={P.pelo.sombra} />
              <ellipse cx="14.4" cy="23" rx="1.5" ry="1" fill={P.rojo.luz} opacity="0.75" />
              <Rubor x={8.6} y={20.4} u={U} rx={2.6} ry={1.7} />
              {/* Gota de sudor */}
              <g className="ll-gota">
                <path d="M 21.4 9.6 q 2.9 3.8 0 5.2 q -2.9 -1.4 0 -5.2 Z" fill={P.azul.luz} opacity="0.9" />
                <circle cx="20.6" cy="12.6" r="0.7" fill="#fff" opacity="0.9" />
              </g>
            </g>

            {/* POSE B — de pie, triunfante */}
            <g className="ll-triunfo" opacity={reducido ? 1 : 0}>
              <path d="M -4 31 L -2.4 16" fill="none" stroke={P.azul.sombra} strokeWidth="5.4" strokeLinecap="round" />
              <path d="M 5 31 L 3.4 16" fill="none" stroke={P.azul.base} strokeWidth="5.4" strokeLinecap="round" />
              <ellipse cx="-5.6" cy="31.2" rx="4" ry="2.4" fill={vol('pelo', U)} />
              <ellipse cx="6.6" cy="31.2" rx="4" ry="2.4" fill={vol('pelo', U)} />
              {/* Torso */}
              <path d="M -9.4 17 Q -11 2.6 0 0.6 Q 11 2.6 9.4 17 Z" fill={vol('azul', U)} />
              <path d="M 7.4 5 Q 10.4 10 8.8 16.4" fill="none" stroke={P.azul.brillo} strokeWidth="1.4" opacity="0.5" strokeLinecap="round" />
              <path d="M -5.4 10.6 q 5.4 2 10.8 0" fill="none" stroke={P.azul.sombra} strokeWidth="1.1" opacity="0.5" strokeLinecap="round" />
              {/* Puño en alto: hombro → codo → puño, con el codo marcado */}
              <path d="M -8 4.6 L -13.4 -1.2 L -16 -6.4" fill="none" stroke={P.piel.sombra} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M -8 4.2 L -13 -1.6 L -15.6 -6.6" fill="none" stroke={P.piel.base} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="-16.4" cy="-8" r="3.9" fill={vol('piel', U)} />
              <path d="M -18.6 -10 q 2.4 -1.4 4.6 0" fill="none" stroke={P.piel.brillo} strokeWidth="1.1" opacity="0.7" strokeLinecap="round" />
              {/* Brazo del letrero */}
              <path d="M 7.4 5 L 3.4 -1.8" fill="none" stroke={P.piel.sombra} strokeWidth="4.8" strokeLinecap="round" />
              <path d="M 7.2 4.6 L 3.4 -1.6" fill="none" stroke={P.piel.base} strokeWidth="3.4" strokeLinecap="round" />
              <circle cx="2.8" cy="-2.8" r="3.5" fill={vol('piel', U)} />
              {/* Cabeza feliz */}
              <circle cx="0" cy="-8" r="9" fill={vol('piel', U)} />
              <path d="M 7.2 -12.6 A 9 9 0 0 1 7.4 -3" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.5" strokeLinecap="round" />
              {/* Rubor DENTRO de la silueta: pegado al borde se difumina fuera y
                  parece orejeras. Va bajo los ojos y hacia dentro. */}
              <Rubor x={-5.2} y={-4.2} u={U} rx={2.1} ry={1.4} />
              <Rubor x={5.2} y={-4.2} u={U} rx={2.1} ry={1.4} />
              {/* Pelo: casquete con volumen + flequillo + mechón suelto */}
              <path d="M -9.1 -8.6 Q -9.6 -19.6 0 -20.4 Q 9.6 -19.6 9.1 -8.6 Q 7.6 -14.6 3 -13.4 Q -1.4 -12.2 -4 -14.4 Q -6.6 -16.6 -9.1 -8.6 Z" fill={vol('pelo', U)} />
              <path d="M -6.4 -16.4 Q -1 -20 4.8 -17.2" fill="none" stroke={P.pelo.brillo} strokeWidth="1.3" opacity="0.65" strokeLinecap="round" />
              <path d="M 6.4 -18.2 q 4.4 -1.6 4.2 3.4 q -2 -2.6 -4.2 -3.4 Z" fill={vol('pelo', U)} />
              <Ojo x={-3.4} y={-7.4} r={2.9} iris="pelo" u={U} />
              <Ojo x={3.4} y={-7.4} r={2.9} iris="pelo" u={U} />
              {/* Cejas alzadas de alegría */}
              <path d="M -5.8 -11.4 q 2.4 -1.5 4.6 -0.4" fill="none" stroke={P.pelo.sombra} strokeWidth="1.1" strokeLinecap="round" />
              <path d="M 1.2 -11.8 q 2.2 -1.1 4.6 0.4" fill="none" stroke={P.pelo.sombra} strokeWidth="1.1" strokeLinecap="round" />
              {/* Boca abierta de grito */}
              <path d="M -3.6 -2.8 q 3.6 5.6 7.2 0 q -3.6 1.6 -7.2 0 Z" fill={P.pelo.sombra} />
              <path d="M -2 -1.6 q 2 2.6 4 0" fill={P.rojo.luz} opacity="0.85" />
            </g>

          </g>
        </g>

        {/* Confeti del remate */}
        <g transform="translate(2,-4)">
          {!reducido && CHISPAS.map((c, i) => (
            <g className="ll-chispa" key={i} opacity="0"><Chispa r={c.r} color={c.color} /></g>
          ))}
        </g>

        {/* ── Letrero: lo único continuo entre las dos poses ───────────── */}
        <g className="ll-letrero" style={{ transformOrigin: MANO, transform: reducido ? 'translateY(-25px)' : 'rotate(-13deg)' }}>
          <g className="ll-tiembla" style={{ transformOrigin: MANO }}>
            <rect x="0.6" y="-6" width="3" height="31" rx="1.5" fill={lin('madera', U)} />
            <path d="M 2.6 -4 V 23" stroke={P.madera.brillo} strokeWidth="0.7" opacity="0.5" strokeLinecap="round" />
            <g>
              <rect x="-25" y="-24" width="54" height="18.4" rx="3.4" fill={P.amarillo.sombra} transform="translate(0,1.2)" opacity="0.45" />
              <rect x="-25" y="-24" width="54" height="18.4" rx="3.4" fill={lin('amarillo', U)} stroke={P.amarillo.sombra} strokeWidth="1.2" />
              <path d="M -22.4 -21.6 H 26.4" stroke="#fff" strokeWidth="1.4" opacity="0.55" strokeLinecap="round" />
              <text
                x="2" y="-14.6" textAnchor="middle" dominantBaseline="central"
                fontSize="9.4" fontWeight="900" fill={P.azul.sombra}
                textLength="45" lengthAdjust="spacingAndGlyphs"
                style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 1.6, strokeLinejoin: 'round' }}
              >¡LO LOGRÉEE!</text>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
