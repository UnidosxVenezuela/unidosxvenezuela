'use client';
import { useId, useLayoutEffect, useRef } from 'react';
import { animate, createTimeline, stagger } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Gato teclista» — un gato teclea como un poseso con las patas borrosas
 * mientras la pantalla dice «procesando…». Al terminar la barra, la pantalla
 * cambia a «¡listo!», el gato se endereza, pone cara de suficiencia y se queda
 * mirando al frente. Humor puro, y el remate es la mirada.
 *
 * Dibujo ORIGINAL: gato genérico de trazo propio, ningún personaje ni meme con
 * dueño. Si el rótulo recuerda a algo, la ilustración es nuestra.
 *
 * NOTAS DE MONTAJE
 *  - LA CABEZA vive dentro de `<g transform="translate(18,-14)">` y se dibuja
 *    con coordenadas propias alrededor de (0,0). Así anime.js puede rotarla
 *    (el asentimiento del final) alrededor de su centro sin tocar
 *    `transform-origin`: con `viewBox="-60 -60 120 120"` el origen por defecto
 *    cae en el (0,0) LOCAL de cada elemento.
 *  - EL DESENFOQUE de las patas no es un filtro (caro en móvil y desigual entre
 *    navegadores): son dos copias fantasma desplazadas arriba y abajo que se
 *    encienden mientras teclea. Es una estela de tebeo, y cuesta 0.
 *  - DOS CARAS CRUZADAS (`.gt-cara-foco` / `.gt-cara-listo`) en vez de un rig de
 *    facciones: más barato y se lee mejor a tamaño pequeño.
 *  - La barra de la pantalla crece animando el ATRIBUTO `width` (nada de
 *    escalar, que deformaría el redondeo).
 *  - Los ids de `clipPath` salen de `useId()`: el panel puede pintar varias
 *    vistas previas a la vez y dos ids iguales se pisan.
 */

/** Acentos deliberados de la ilustración (el resto va con tokens del tema). */
const PELO = '#e0a05c';
const RAYA = '#c07c34';
const HOCICO = '#f8e6cf';
const OREJA = '#efb0a8';
const NARIZ = '#c4595c';
const PUPILA = '#15161c';
/** La pantalla es una pantalla: colores propios en los dos temas. */
const CRISTAL = '#0b1020';
const MARCO = '#141a2e';
const VERDE = '#6fe7a9';

/** Un ojo concentrado: pupila de gato, grande y fija en el teclado. */
function OjoFoco({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},-3)`}>
      <ellipse rx="4.2" ry="4.9" fill="#ffffff" stroke="var(--texto)" strokeWidth="1.1" />
      <ellipse cy="0.2" rx="1.7" ry="3.6" fill={PUPILA} />
      <circle cx="-1.3" cy="-1.8" r="0.9" fill="#ffffff" />
    </g>
  );
}

/** El mismo ojo, a media asta: la cara de «ya está, y lo sabes». */
function OjoSuficiencia({ x }: { x: number }) {
  return (
    <g transform={`translate(${x},-3)`}>
      <ellipse rx="4.2" ry="4.9" fill="#ffffff" stroke="var(--texto)" strokeWidth="1.1" />
      <ellipse cy="1.4" rx="1.5" ry="2.6" fill={PUPILA} />
      {/* Párpado: media pastilla del color del pelo tapando la mitad de arriba. */}
      <path d="M -4.8 0.2 a 4.8 5.4 0 0 1 9.6 0 Z" fill={PELO} stroke="var(--texto)" strokeWidth="1.1" strokeLinejoin="round" />
    </g>
  );
}

export default function GatoTeclista({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  const uid = useId().replace(/:/g, '');
  const idCristal = `gt-cristal-${uid}`;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: el SVG ya está en su fotograma final (pantalla en
    // «¡listo!», patas quietas, cara de suficiencia). No se anima NADA.
    if (reducido || !raiz) return;

    const uno = <T extends SVGElement>(sel: string) => raiz.querySelector<T>(sel);
    const todos = <T extends SVGElement>(sel: string) => Array.from(raiz.querySelectorAll<T>(sel));

    const gato = uno<SVGGElement>('.gt-gato');
    const cabeza = uno<SVGGElement>('.gt-cabeza');
    const patas = todos<SVGGElement>('.gt-pata');
    const ecos = todos<SVGGElement>('.gt-eco');
    const puntos = todos<SVGCircleElement>('.gt-punto');
    const barra = uno<SVGRectElement>('.gt-barra');
    const proc = uno<SVGGElement>('.gt-proc');
    const listo = uno<SVGGElement>('.gt-listo');
    const destello = uno<SVGRectElement>('.gt-destello');
    const caraFoco = uno<SVGGElement>('.gt-cara-foco');
    const caraListo = uno<SVGGElement>('.gt-cara-listo');
    const sudor = uno<SVGGElement>('.gt-sudor');
    const ding = uno<SVGGElement>('.gt-ding');

    /** Si anime.js falla, la pantalla se queda en «¡listo!», nunca a medias. */
    const rescate = () => {
      if (proc) proc.style.opacity = '0';
      if (listo) listo.style.opacity = '1';
      if (caraFoco) caraFoco.style.opacity = '0';
      if (caraListo) caraListo.style.opacity = '1';
      if (barra) barra.setAttribute('width', '32');
      ecos.forEach((e) => { e.style.opacity = '0'; });
    };

    const vivos: { revert: () => void }[] = [];
    try {
      // ── El tecleo: bucles aparte del guion principal ──────────────────
      if (patas.length) {
        // El `stagger` hace que las patas alternen: una sube mientras la otra baja.
        vivos.push(animate(patas, {
          translateY: [{ to: -5, duration: 85 }, { to: 0, duration: 85 }],
          // 8 vueltas dejan un silencio corto antes del último tecleo del guion
          // (1840 ms). Ese silencio es la mitad del chiste.
          delay: stagger(85, { start: 260 }),
          loop: 8,
          ease: 'inOutQuad',
        }));
      }
      if (ecos.length) {
        vivos.push(animate(ecos, { opacity: [0, 0.42], duration: 200, delay: 280, ease: 'outQuad' }));
      }
      if (cabeza) {
        vivos.push(animate(cabeza, {
          translateY: [{ to: -1.6, duration: 175 }, { to: 0, duration: 175 }],
          delay: 300, loop: 4, ease: 'inOutQuad',
        }));
      }
      if (puntos.length) {
        vivos.push(animate(puntos, {
          opacity: [{ to: 1, duration: 200 }, { to: 0.15, duration: 400 }],
          delay: stagger(190, { start: 320 }), loop: 3, ease: 'inOutQuad',
        }));
      }
      if (sudor) {
        vivos.push(animate(sudor, {
          translateY: [{ to: 0, duration: 120 }, { to: 13, duration: 620 }],
          opacity: [{ to: 0.85, duration: 120 }, { to: 0, duration: 620 }],
          delay: 760, loop: 2, ease: 'inQuad',
        }));
      }

      // ── El guion ──────────────────────────────────────────────────────
      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      if (gato) tl.add(gato, { translateY: [7, 0], opacity: [0, 1], duration: 320, ease: 'outQuad' }, 0);
      if (barra) tl.add(barra, { width: [0, 32], duration: 1520, ease: 'inOutQuad' }, 300);

      // Golpe final de tecla: las dos patas a la vez y fuerte.
      patas.forEach((p) => {
        tl.add(p, {
          translateY: [{ to: -8, duration: 100 }, { to: 2, duration: 110 }, { to: 0, duration: 170 }],
          ease: 'outQuad',
        }, 1840);
      });

      // La pantalla cambia. Este es el chiste, así que va con destello.
      if (destello) {
        tl.add(destello, { opacity: [{ to: 0.8, duration: 90 }, { to: 0, duration: 260 }], duration: 350 }, 1980);
      }
      if (proc) tl.add(proc, { opacity: [1, 0], duration: 130 }, 1980);
      if (listo) tl.add(listo, { opacity: [0, 1], scale: [0.45, 1], duration: 420, ease: 'outBack' }, 2020);
      if (ecos.length) tl.add(ecos, { opacity: 0, duration: 160 }, 1990);

      // El gato se endereza y cambia la cara.
      if (caraFoco) tl.add(caraFoco, { opacity: [1, 0], duration: 130 }, 2080);
      if (caraListo) tl.add(caraListo, { opacity: [0, 1], duration: 200 }, 2110);
      if (gato) tl.add(gato, { translateY: [0, -3.5], duration: 320, ease: 'outBack' }, 2080);

      // REMATE: brillo de suficiencia y un asentimiento cortito mirando al frente.
      if (ding) tl.add(ding, { opacity: [0, 1], scale: [0, 1], rotate: [-40, 0], duration: 380, ease: 'outBack' }, 2280);
      if (cabeza) {
        tl.add(cabeza, {
          rotate: [{ to: -5, duration: 190 }, { to: 0, duration: 260 }],
          translateY: 0,
          ease: 'inOutQuad',
        }, 2380);
      }
      if (ding) {
        tl.add(ding, { scale: [{ to: 1.25, duration: 170 }, { to: 1, duration: 220 }], opacity: 1, ease: 'inOutQuad' }, 2700);
      }

      // Colchón final: la cara de suficiencia necesita su silencio.
      tl.add(raiz, { opacity: 1, duration: 420 }, 2900);
    } catch {
      rescate();
      vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } });
      finRef.current();
      return;
    }

    return () => { vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } }); };
  }, [reducido]);

  /** Pata + estela: las copias fantasma van dentro, así se mueven con ella. */
  const pata = (x: number) => (
    <g className="gt-pata" key={x}>
      <g className="gt-eco" opacity="0">
        <g transform="translate(0,-4.5)">
          <rect x={x} y="6" width="9.5" height="17" rx="4.7" fill={PELO} />
        </g>
        <g transform="translate(0,4.5)">
          <rect x={x} y="6" width="9.5" height="17" rx="4.7" fill={PELO} />
        </g>
      </g>
      <rect x={x} y="6" width="9.5" height="17" rx="4.7" fill={PELO} stroke="var(--texto)" strokeWidth="1.5" />
      <rect x={x - 1.8} y="15.5" width="13" height="8" rx="4" fill={PELO} stroke="var(--texto)" strokeWidth="1.5" />
      <g stroke="var(--texto)" strokeWidth="1" opacity="0.4" fill="none">
        <path d={`M ${x + 2.4} 18.4 v 2.6`} />
        <path d={`M ${x + 6.2} 18.4 v 2.6`} />
      </g>
    </g>
  );

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
      <defs>
        <clipPath id={idCristal}>
          <rect x="-50.5" y="-27.5" width="39" height="28" rx="2" />
        </clipPath>
      </defs>

      {/* Encuadre: el conjunto va de -56 a 52 y de -41 a 39. */}
      <g transform="translate(2,1)">

        {/* ── Mesa ─────────────────────────────────────────────────────── */}
        <rect x="-56" y="30" width="108" height="9" rx="4.5" fill="var(--sup3)" stroke="var(--borde-f)" strokeWidth="1.4" />

        {/* ── Monitor ──────────────────────────────────────────────────── */}
        <path d="M -35 4 L -38 25 L -24 25 L -27 4 Z" fill="var(--sup3)" stroke="var(--texto)" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="-43" y="25" width="24" height="5" rx="2.5" fill="var(--sup3)" stroke="var(--texto)" strokeWidth="1.8" />
        <rect x="-54" y="-31" width="46" height="35" rx="4" fill={MARCO} stroke="var(--texto)" strokeWidth="2" />
        <rect x="-50.5" y="-27.5" width="39" height="28" rx="2" fill={CRISTAL} />

        <g clipPath={`url(#${idCristal})`}>
          {/* Estado A: trabajando. */}
          <g className="gt-proc" opacity={reducido ? 0 : 1}>
            <text
              x="-31"
              y="-16"
              textAnchor="middle"
              fontSize="6"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fill={VERDE}
            >
              procesando
            </text>
            <circle className="gt-punto" cx="-35.5" cy="-10" r="1.5" fill={VERDE} opacity="0.15" />
            <circle className="gt-punto" cx="-31" cy="-10" r="1.5" fill={VERDE} opacity="0.15" />
            <circle className="gt-punto" cx="-26.5" cy="-10" r="1.5" fill={VERDE} opacity="0.15" />
            <rect x="-47" y="-6" width="32" height="4" rx="2" fill="#243055" />
            <rect className="gt-barra" x="-47" y="-6" width={reducido ? 32 : 0} height="4" rx="2" fill={VERDE} />
          </g>

          {/* Estado B: ya está. Va colocado con su propio `<g>` y dibujado
              alrededor de (0,0) para que el «pop» crezca desde el centro de la
              pantalla; si escalara desde el origen del lienzo entraría volando
              desde la derecha. Ojo con el recorte: el visto y el rótulo caben
              justos en 39 × 28, por eso la letra es 10,5 y no más. */}
          <g transform="translate(-31,-11)">
            <g className="gt-listo" opacity={reducido ? 1 : 0}>
              <path d="M -6 -6.5 l 4 4.2 l 8.5 -9.4" fill="none" stroke={VERDE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <text y="7.5" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="var(--amarillo)">¡listo!</text>
            </g>
          </g>

          <rect className="gt-destello" x="-50.5" y="-27.5" width="39" height="28" fill="#ffffff" opacity="0" />
        </g>

        {/* ── El gato ──────────────────────────────────────────────────── */}
        <g className="gt-gato">
          {/* Cuerpo (el teclado le tapa la parte de abajo). */}
          <path d="M 3 -4 Q 18 -9 33 -4 L 39 28 L -3 28 Z" fill={PELO} stroke="var(--texto)" strokeWidth="1.7" strokeLinejoin="round" />
          {/* Pechera clara: cae entre las dos patas, así que se ve entera. */}
          <ellipse cx="18" cy="12" rx="7.5" ry="10" fill={HOCICO} opacity="0.85" />

          {/* Cabeza: coordenadas propias alrededor de (0,0) para poder girarla. */}
          <g transform="translate(18,-14)">
            <g className="gt-cabeza">
              {/* Orejas: van ANTES que la cabeza para que la elipse les tape la
                  base. Separadas 3 unidades en el centro; pegadas parecerían un
                  lazo en vez de dos orejas. */}
              <g stroke="var(--texto)" strokeWidth="1.7" strokeLinejoin="round">
                <path d="M -12 -10 L -14.5 -25.5 L -1.5 -17 Z" fill={PELO} />
                <path d="M 12 -10 L 14.5 -25.5 L 1.5 -17 Z" fill={PELO} />
                <path d="M -10.4 -12 L -12 -21.5 L -3.5 -16.5 Z" fill={OREJA} strokeWidth="1.1" />
                <path d="M 10.4 -12 L 12 -21.5 L 3.5 -16.5 Z" fill={OREJA} strokeWidth="1.1" />
                <ellipse rx="16" ry="14.5" fill={PELO} />
              </g>

              {/* Rayas de la frente. */}
              <g stroke={RAYA} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.75">
                <path d="M -9 -9.5 q 2.2 -3.6 4.4 0" />
                <path d="M -2.2 -11.6 q 2.2 -3.6 4.4 0" />
                <path d="M 4.6 -9.5 q 2.2 -3.6 4.4 0" />
              </g>

              {/* Bigotes. */}
              <g stroke="var(--texto)" strokeWidth="1.1" strokeLinecap="round" opacity="0.65" fill="none">
                <path d="M -9 4.6 L -19 2" />
                <path d="M -9 6.4 L -19 7.8" />
                <path d="M 9 4.6 L 19 2" />
                <path d="M 9 6.4 L 19 7.8" />
              </g>

              <ellipse cy="6" rx="8.5" ry="6" fill={HOCICO} />
              <path d="M -2.4 2.4 h 4.8 l -2.4 2.9 Z" fill={NARIZ} />

              {/* Cara A: a tope. */}
              <g className="gt-cara-foco" opacity={reducido ? 0 : 1}>
                <OjoFoco x={-5.5} />
                <OjoFoco x={5.5} />
                <g stroke="var(--texto)" strokeWidth="1.5" strokeLinecap="round" fill="none">
                  <path d="M 0 5.3 q -2.6 3.2 -5 0.6" />
                  <path d="M 0 5.3 q 2.6 3.2 5 0.6" />
                </g>
              </g>

              {/* Cara B: y lo sabes. */}
              <g className="gt-cara-listo" opacity={reducido ? 1 : 0}>
                <OjoSuficiencia x={-5.5} />
                <OjoSuficiencia x={5.5} />
                <path d="M -4.4 5.4 q 4.6 3.4 8.6 -1.6" fill="none" stroke="var(--texto)" strokeWidth="1.6" strokeLinecap="round" />
              </g>

              {/* Gota de sudor mientras teclea: va JUSTO FUERA de la elipse de
                  la cabeza (rx 16), en la sien, para que se lea como sudor. */}
              <g className="gt-sudor" opacity="0">
                <path d="M 17 -11 q 3.2 4 0 6.2 q -3.2 -2.2 0 -6.2 Z" fill="#7fb4ff" stroke="var(--texto)" strokeWidth="0.9" />
              </g>
            </g>
          </g>
        </g>

        {/* ── Teclado y patas (delante del teclado) ────────────────────── */}
        <rect x="-6" y="21" width="48" height="9" rx="3" fill="var(--sup2)" stroke="var(--texto)" strokeWidth="1.6" />
        <g fill="var(--borde-f)">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} x={-2 + i * 6} width="4" y="23.2" height="2.2" rx="1" />
          ))}
          <rect x="4" y="26.6" width="26" height="2.2" rx="1.1" />
        </g>
        {pata(5)}
        {pata(24)}

        {/* Chispa de suficiencia: el «ding» del final. */}
        <g transform="translate(40,-36)">
          <g className="gt-ding" opacity={reducido ? 1 : 0}>
            <path
              d="M 0 -9 Q 1.6 -1.6 9 0 Q 1.6 1.6 0 9 Q -1.6 1.6 -9 0 Q -1.6 -1.6 0 -9 Z"
              fill="var(--amarillo)"
              stroke="var(--amarillo-osc)"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
