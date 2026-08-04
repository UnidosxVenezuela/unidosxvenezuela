'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline, stagger } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «¡Lo logréee!» — alguien que llega ARRASTRÁNDOSE hasta la meta, con su letrero
 * a cuestas, y al tocarla se levanta y lo ondea.
 *
 * La gracia está en el contraste: primero el agotamiento (tirones, polvo, gota de
 * sudor, letrero que tiembla) y de golpe el triunfo. Sin banalizar nada: no se
 * celebra la emergencia, se reconoce a quien empujó hasta cerrar la tarea.
 *
 * CÓMO ESTÁ MONTADA (para quien la retoque)
 *   - Dos POSES dibujadas, no un esqueleto: `.ll-pose-arrastre` y
 *     `.ll-pose-triunfo` se cruzan en 180 ms, tapadas por un salto. Es la forma
 *     más barata y legible de contar «se levanta» sin rig ni morphing.
 *   - El LETRERO es continuo (no cambia entre poses): es el hilo que enlaza las
 *     dos, y por eso es lo único que se mueve durante todo el plano.
 *   - Grupos anidados para que dos animaciones nunca peleen por el mismo
 *     `transform`: `.ll-heroe` avanza (translateX), `.ll-cuerpo` salta
 *     (translateY), `.ll-bob` respira (bucle), `.ll-letrero` se alza y
 *     `.ll-letrero-tiembla` vibra. Un grupo, una propiedad.
 *
 * OJO con los `transform` estáticos: anime.js escribe en `style.transform`, que
 * pisa el atributo `transform` del SVG. Por eso ningún grupo animado lleva un
 * `transform` que haya que conservar — solo la pose inicial, que anime sustituye.
 */

/** Acentos deliberados de la ilustración (el resto va con tokens del tema). */
const PIEL = '#e9b183';
const PELO = '#4b3a2a';
const PALO = '#9a7247';

/**
 * `viewBox="-60 -60 120 120"` + `transform-box: view-box` (el valor inicial):
 * el origen de `transform-origin` es la esquina (-60,-60), así que el punto (x,y)
 * del dibujo se escribe como (60+x, 60+y) px. Sin esto, todo gira por el centro.
 */
const pivote = (x: number, y: number) => `${60 + x}px ${60 + y}px`;

/** Pivote del letrero = la mano que lo sostiene. */
const MANO = pivote(2, 24);

/** Confeti del remate. Determinista: nada de azar a nivel de módulo. */
const CHISPAS = Array.from({ length: 9 }, (_, i) => {
  const ang = (i / 9) * Math.PI * 2 + 0.4;
  const dist = i % 2 ? 25 : 33;
  return {
    x: +(Math.cos(ang) * dist).toFixed(1),
    y: +(Math.sin(ang) * dist).toFixed(1),
    color: ['var(--amarillo)', 'var(--azul)', 'var(--rojo)'][i % 3],
    redonda: i % 3 === 1,
  };
});

export default function LoLogre({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: el SVG ya se pinta en su fotograma final (de pie,
    // letrero en alto). No se anima NADA, ni aquí ni por CSS.
    if (reducido || !raiz) return;

    const uno = <T extends SVGElement>(sel: string) => raiz.querySelector<T>(sel);
    const todos = <T extends SVGElement>(sel: string) => Array.from(raiz.querySelectorAll<T>(sel));

    const heroe = uno<SVGGElement>('.ll-heroe');
    const cuerpo = uno<SVGGElement>('.ll-cuerpo');
    const bob = uno<SVGGElement>('.ll-bob');
    const arrastre = uno<SVGGElement>('.ll-pose-arrastre');
    const triunfo = uno<SVGGElement>('.ll-pose-triunfo');
    const letrero = uno<SVGGElement>('.ll-letrero');
    const tiembla = uno<SVGGElement>('.ll-letrero-tiembla');
    const gota = uno<SVGPathElement>('.ll-gota');
    const polvo = todos<SVGPathElement>('.ll-polvo');
    const chispas = todos<SVGGElement>('.ll-chispa');

    // Todo lo que haya que revertir al desmontar (bucles sueltos + línea de tiempo).
    const vivos: { revert: () => void }[] = [];

    try {
      // ── Bucles del esfuerzo: duran lo que dura el arrastre (~1,7 s) ────────
      if (bob) {
        // Respiración del cuerpo mientras se arrastra. Nº PAR de iteraciones con
        // `alternate` → termina exactamente donde empezó, sin saltos al cortar.
        vivos.push(animate(bob, {
          translateY: [0, -2.2], duration: 210, loop: 8, alternate: true, ease: 'inOutQuad',
        }));
      }
      if (tiembla) {
        vivos.push(animate(tiembla, {
          rotate: [-2.6, 2.6], duration: 105, loop: 16, alternate: true, ease: 'inOutQuad',
        }));
      }
      if (gota) {
        vivos.push(animate(gota, {
          translateY: [0, 10], opacity: [0.85, 0], duration: 720, delay: 350, loop: 2, ease: 'inQuad',
        }));
      }
      if (polvo.length) {
        // Sin `scale`: en SVG escala alrededor del centro del viewBox, y estas
        // rayas viven a la izquierda — se arrastrarían hacia el medio.
        vivos.push(animate(polvo, {
          translateX: [0, -8], opacity: [0.5, 0],
          duration: 520, delay: stagger(110), loop: 3, ease: 'outQuad',
        }));
      }

      // ── Línea de tiempo principal ─────────────────────────────────────────
      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      if (heroe) {
        tl.add(heroe, { opacity: [0, 1], duration: 200 }, 0);
        // Tres TIRONES, no un desplazamiento continuo: así se ve el esfuerzo.
        // El recorrido (-24 → 14) está calculado para que ni las piernas ni el
        // polvo salgan del viewBox al empezar, y para que la mano acabe tocando
        // el poste de la meta (x = 38).
        tl.add(heroe, { translateX: [-24, -12], duration: 430 }, 200);
        tl.add(heroe, { translateX: 1, duration: 430 }, 690);
        tl.add(heroe, { translateX: 14, duration: 470 }, 1180);
      }

      // Llegada: cruce de poses tapado por un salto. 180 ms bastan.
      if (arrastre) tl.add(arrastre, { opacity: [1, 0], duration: 170 }, 1690);
      if (triunfo) tl.add(triunfo, { opacity: [0, 1], duration: 230 }, 1700);
      if (cuerpo) {
        tl.add(cuerpo, { translateY: [0, -8], duration: 210, ease: 'outQuad' }, 1670);
        tl.add(cuerpo, { translateY: 0, duration: 290, ease: 'outBounce' }, 1880);
      }

      // El letrero se alza y deja de temblar.
      if (tiembla) tl.add(tiembla, { rotate: 0, duration: 260 }, 1700);
      if (letrero) {
        tl.add(letrero, { translateY: [0, -24], duration: 520, ease: 'outBack' }, 1700);
        tl.add(letrero, { rotate: [-13, 0], duration: 430, ease: 'outCubic' }, 1700);
      }

      // Confeti del remate.
      chispas.forEach((g, i) => {
        const ch = CHISPAS[i];
        if (!ch) return;
        tl.add(g, {
          translateX: ch.x, translateY: ch.y, rotate: i % 2 ? 150 : -140,
          scale: [1, 0.5], opacity: [1, 0], duration: 900, delay: i * 28, ease: 'outCubic',
        }, 2180);
      });

      // Golpe de gracia: tres ondeos del letrero y se queda quieto en alto.
      if (letrero) {
        tl.add(letrero, {
          rotate: [
            { to: 9, duration: 200 },
            { to: -8, duration: 240 },
            { to: 6, duration: 210 },
            { to: 0, duration: 230 },
          ],
          ease: 'inOutQuad',
        }, 2260);
      }
      // Colchón final: que el letrero se lea antes de que el motor cierre.
      tl.add(raiz, { opacity: 1, duration: 420 }, 2940);
    } catch {
      // Si anime.js falla, nunca dejamos la celebración colgada ni a medio dibujar.
      vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } });
      finRef.current();
      return;
    }

    return () => { vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } }); };
  }, [reducido]);

  return (
    <svg
      ref={raizRef}
      width={size}
      height={size}
      viewBox="-60 -60 120 120"
      preserveAspectRatio="xMidYMid meet"
      className={'cel-svg' + (reducido ? ' cel-svg-quieto' : '')}
      style={{ maxWidth: '100%', height: 'auto' }}
      aria-hidden="true"
      focusable="false"
    >
      {/* ── Escenario: suelo y meta ─────────────────────────────────────── */}
      <path d="M -56 31 H 56" fill="none" stroke="var(--borde-f)" strokeWidth="3" strokeLinecap="round" />
      <path d="M 38 31 V -14" fill="none" stroke="var(--texto2)" strokeWidth="2.6" strokeLinecap="round" />
      <g>
        <rect x="38" y="-15" width="7" height="5" fill="var(--texto)" />
        <rect x="45" y="-15" width="7" height="5" fill="var(--sup1)" />
        <rect x="38" y="-10" width="7" height="5" fill="var(--sup1)" />
        <rect x="45" y="-10" width="7" height="5" fill="var(--texto)" />
        <rect x="38" y="-15" width="14" height="10" fill="none" stroke="var(--texto)" strokeWidth="1.2" />
      </g>

      {/* ── El personaje ────────────────────────────────────────────────── */}
      <g className="ll-heroe" transform={reducido ? 'translate(14,0)' : 'translate(-24,0)'} opacity={reducido ? 1 : 0}>
        <g className="ll-cuerpo">
          <g className="ll-bob">

            {/* Pose A: arrastrándose, hecho polvo. */}
            <g className="ll-pose-arrastre" opacity={reducido ? 0 : 1}>
              {/* Polvo del arrastre (detrás). */}
              <path className="ll-polvo" d="M -28 24 h 6" stroke="var(--texto2)" strokeWidth="2" strokeLinecap="round" opacity="0" />
              <path className="ll-polvo" d="M -31 29 h 8" stroke="var(--texto2)" strokeWidth="2" strokeLinecap="round" opacity="0" />
              <path className="ll-polvo" d="M -27 33 h 5" stroke="var(--texto2)" strokeWidth="2" strokeLinecap="round" opacity="0" />
              {/* Piernas arrastradas. */}
              <path d="M -3 26 C -11 28 -17 30 -23 30" fill="none" stroke="var(--texto2)" strokeWidth="5" strokeLinecap="round" />
              <path d="M -2 29 C -10 31 -16 33 -21 33" fill="none" stroke="var(--texto2)" strokeWidth="5" strokeLinecap="round" />
              <ellipse cx="-24" cy="30" rx="3.6" ry="2.2" fill={PELO} stroke="var(--texto)" strokeWidth="1" />
              <ellipse cx="-22" cy="33" rx="3.6" ry="2.2" fill={PELO} stroke="var(--texto)" strokeWidth="1" />
              {/* Torso. */}
              <ellipse cx="0" cy="25" rx="13" ry="6.6" fill="var(--azul)" stroke="var(--texto)" strokeWidth="1.4" />
              {/* Brazo que tira hacia adelante. */}
              <path d="M 9 25 L 20 28.5" fill="none" stroke={PIEL} strokeWidth="4.2" strokeLinecap="round" />
              <circle cx="21" cy="28.8" r="3.2" fill={PIEL} stroke="var(--texto)" strokeWidth="1" />
              {/* Brazo que sostiene el letrero. */}
              <path d="M 3 21 L 2 24" fill="none" stroke={PIEL} strokeWidth="4.2" strokeLinecap="round" />
              {/* Cabeza agotada. */}
              <circle cx="13" cy="18" r="7.6" fill={PIEL} stroke="var(--texto)" strokeWidth="1.4" />
              <path d="M 5.8 15.6 Q 9 7.6 18 11.6 Q 20.6 12.8 20.2 15.4 Q 14 11.4 5.8 15.6 Z" fill={PELO} />
              <path d="M 9.6 18.4 q 1.6 1.8 3.2 0" fill="none" stroke="var(--texto)" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M 15 18.4 q 1.6 1.8 3.2 0" fill="none" stroke="var(--texto)" strokeWidth="1.3" strokeLinecap="round" />
              <ellipse cx="14.4" cy="22.4" rx="2.1" ry="1.7" fill="var(--texto)" />
              {/* Gota de sudor. */}
              <path className="ll-gota" d="M 21 10.5 q 2.7 3.6 0 4.9 q -2.7 -1.3 0 -4.9 Z" fill="var(--azul)" opacity="0.85" />
            </g>

            {/* Pose B: de pie, triunfante. */}
            <g className="ll-pose-triunfo" opacity={reducido ? 1 : 0}>
              <path d="M -4 31 L -2 16" fill="none" stroke="var(--texto2)" strokeWidth="5" strokeLinecap="round" />
              <path d="M 5 31 L 3 16" fill="none" stroke="var(--texto2)" strokeWidth="5" strokeLinecap="round" />
              <ellipse cx="-5.5" cy="31" rx="3.8" ry="2.2" fill={PELO} stroke="var(--texto)" strokeWidth="1" />
              <ellipse cx="6.5" cy="31" rx="3.8" ry="2.2" fill={PELO} stroke="var(--texto)" strokeWidth="1" />
              <path d="M -9 17 Q -10.5 3 0 1 Q 10.5 3 9 17 Z" fill="var(--azul)" stroke="var(--texto)" strokeWidth="1.4" />
              {/* Puño en alto. */}
              <path d="M -7 6 L -15 -4" fill="none" stroke={PIEL} strokeWidth="4.2" strokeLinecap="round" />
              <circle cx="-16" cy="-5.4" r="3.6" fill={PIEL} stroke="var(--texto)" strokeWidth="1" />
              {/* Brazo que sube el letrero (la mano queda junto al palo). */}
              <path d="M 7 6 L 3.4 -1.6" fill="none" stroke={PIEL} strokeWidth="4.2" strokeLinecap="round" />
              <circle cx="2.8" cy="-2.6" r="3.2" fill={PIEL} stroke="var(--texto)" strokeWidth="1" />
              {/* Cabeza feliz. */}
              <circle cx="0" cy="-8" r="8.6" fill={PIEL} stroke="var(--texto)" strokeWidth="1.4" />
              <path d="M -8.6 -11.2 Q -4.4 -19.6 4.2 -16.4 Q 8.8 -14.6 8.6 -11.2 Q 2 -15.4 -8.6 -11.2 Z" fill={PELO} />
              <path d="M -5.6 -7.6 q 2.3 -2.7 4.6 0" fill="none" stroke="var(--texto)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M 1 -7.6 q 2.3 -2.7 4.6 0" fill="none" stroke="var(--texto)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M -4.2 -3.2 q 4.2 4.8 8.4 0" fill="none" stroke="var(--texto)" strokeWidth="1.8" strokeLinecap="round" />
            </g>

          </g>
        </g>

        {/* Confeti del remate: nace en el pecho y sale disparado. */}
        <g transform="translate(2,-4)">
          {!reducido && CHISPAS.map((ch, i) => (
            <g className="ll-chispa" key={i} opacity="0">
              {ch.redonda
                ? <circle r="2.8" fill={ch.color} />
                : <rect x="-2" y="-3.8" width="4" height="7.6" rx="1.3" fill={ch.color} />}
            </g>
          ))}
        </g>

        {/* ── El letrero: lo único continuo entre las dos poses ─────────── */}
        <g
          className="ll-letrero"
          style={{ transformOrigin: MANO, transform: reducido ? 'translateY(-24px)' : 'rotate(-13deg)' }}
        >
          <g className="ll-letrero-tiembla" style={{ transformOrigin: MANO }}>
            <path d="M 2 25 L 2 -6" fill="none" stroke={PALO} strokeWidth="3" strokeLinecap="round" />
            <rect x="-24" y="-23" width="52" height="17" rx="3.5" fill="var(--amarillo)" stroke="var(--azul)" strokeWidth="2" />
            {/* `textLength` fija el ancho pase lo que pase con la tipografía:
                el rótulo NUNCA se sale del cartel, ni con la fuente de respaldo. */}
            <text
              x="2"
              y="-14.2"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="9"
              fontWeight="800"
              fill="var(--azul)"
              textLength="44"
              lengthAdjust="spacingAndGlyphs"
            >
              ¡LO LOGRÉEE!
            </text>
          </g>
        </g>
      </g>
    </svg>
  );
}
