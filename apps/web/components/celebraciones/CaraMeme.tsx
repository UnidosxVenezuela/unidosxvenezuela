'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { createTimeline, svg } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Cara de satisfacción» — una cara de meme DIBUJADA a mano con paths: ojos
 * enormes, cejas por las nubes y una sonrisa de suficiencia absurda. Debajo, un
 * rótulo que primero suelta una frase y luego la remata con otra.
 *
 * ORIGINAL A PROPÓSITO: nada de calcar memes existentes (Pepe, Doge, personajes
 * de marcas…). Es geometría propia — elipses, arcos y una boca asimétrica — y el
 * humor está en la exageración y en el texto, no en citar a nadie.
 *
 * NOTAS DE MONTAJE
 *   - Las frases van en PAREJAS (planteamiento → remate) y la pareja se sortea al
 *     montar. El sorteo va en un efecto, no en el render: así el HTML del
 *     servidor y el del cliente coinciden siempre (hidratación limpia).
 *   - Cada ojo lleva su propio `transform-origin`: sin eso, en SVG el `scale`
 *     pivota en el centro del viewBox y los ojos entrarían volando desde la nariz.
 *   - `textLength` en los rótulos: el ancho queda fijado pase lo que pase con la
 *     tipografía, así que el texto nunca se sale de la pastilla.
 */

/** Parejas planteamiento → remate. Cortas, en español y con carácter. */
const FRASES: readonly (readonly [string, string])[] = [
  ['Eso lo hice yo.', 'Ni sudé... casi.'],
  ['Otra que cae.', 'Imparable, pues.'],
  ['Listo el pollo.', 'Siguiente, por favor.'],
  ['¿Difícil? Nah.', 'Yo solo cumplo.'],
  ['Ya está resuelto.', 'De nada, equipo.'],
];

/**
 * `viewBox="-60 -60 120 120"` + `transform-box: view-box` (el valor inicial):
 * el punto (x,y) del dibujo se escribe como (60+x, 60+y) px en `transform-origin`.
 */
const pivote = (x: number, y: number) => `${60 + x}px ${60 + y}px`;

/** Chispas del remate. Deterministas: nada de azar a nivel de módulo. */
const CHISPAS = Array.from({ length: 6 }, (_, i) => {
  const ang = (i / 6) * Math.PI * 2 - Math.PI / 2 + 0.3;
  return {
    x: +(Math.cos(ang) * 40).toFixed(1),
    y: +(Math.sin(ang) * 40).toFixed(1),
    color: ['var(--amarillo)', 'var(--azul)', 'var(--rojo)'][i % 3],
  };
});

/** Ancho fijado del rótulo: natural para la frase, pero nunca más que la pastilla
 *  (104 de ancho menos 6 de margen a cada lado). */
const anchoRotulo = (frase: string) => Math.min(92, +(frase.length * 5.6).toFixed(1));

export default function CaraMeme({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  // La pareja de frases se sortea DESPUÉS de montar (ver nota de cabecera).
  const [par, setPar] = useState(0);
  useLayoutEffect(() => { setPar(Math.floor(Math.random() * FRASES.length)); }, []);
  const frases = FRASES[par] ?? FRASES[0] ?? (['¡Listo!', '¡Bien hecho!'] as const);

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: el SVG ya está en su fotograma final (cara completa,
    // boca dibujada, remate a la vista). No se anima NADA.
    if (reducido || !raiz) return;

    const uno = <T extends SVGElement>(sel: string) => raiz.querySelector<T>(sel);
    const todos = <T extends SVGElement>(sel: string) => Array.from(raiz.querySelectorAll<T>(sel));

    const cabeza = uno<SVGGElement>('.cm-cabeza');
    const ojos = todos<SVGGElement>('.cm-ojo');
    const pupilas = todos<SVGCircleElement>('.cm-pupila');
    const cejas = todos<SVGPathElement>('.cm-ceja');
    const boca = uno<SVGPathElement>('.cm-boca');
    const mejillas = todos<SVGEllipseElement>('.cm-mejilla');
    const glint = uno<SVGPathElement>('.cm-glint');
    const pastilla = uno<SVGRectElement>('.cm-pastilla');
    const fraseA = uno<SVGTextElement>('.cm-frase-a');
    const fraseB = uno<SVGTextElement>('.cm-frase-b');
    const chispas = todos<SVGGElement>('.cm-chispa');

    let tl: ReturnType<typeof createTimeline> | null = null;
    try {
      const linea = createTimeline({ defaults: { ease: 'outCubic' }, onComplete: () => finRef.current() });
      tl = linea;

      if (cabeza) linea.add(cabeza, { scale: [0.5, 1], opacity: [0, 1], duration: 430, ease: 'outBack' }, 0);

      ojos.forEach((o, i) => {
        linea.add(o, { scale: [0.15, 1], duration: 380, delay: i * 70, ease: 'outBack' }, 150);
      });
      cejas.forEach((c, i) => {
        linea.add(c, { translateY: [13, 0], opacity: [0, 1], duration: 330, delay: i * 70, ease: 'outBack' }, 380);
      });

      // La boca se DIBUJA: es el gesto que remata la cara.
      if (boca) linea.add(svg.createDrawable(boca), { draw: ['0 0', '0 1'], duration: 470, ease: 'outQuad' }, 560);

      // Miradita de lado antes de soltar la frase.
      if (pupilas.length) {
        linea.add(pupilas, {
          translateX: [{ to: -3.6, duration: 230 }, { to: 3.6, duration: 270 }, { to: 0, duration: 230 }],
          ease: 'inOutQuad',
        }, 880);
      }
      if (mejillas.length) linea.add(mejillas, { opacity: [0, 0.26], duration: 300 }, 1120);

      // Rótulo: planteamiento…
      if (pastilla) linea.add(pastilla, { scale: [0.7, 1], opacity: [0, 1], duration: 330, ease: 'outBack' }, 900);
      if (fraseA) linea.add(fraseA, { opacity: [0, 1], translateY: [10, 0], duration: 320, ease: 'outBack' }, 940);

      // Destello de suficiencia.
      if (glint) {
        linea.add(glint, {
          scale: [0, 1.25], rotate: [0, 95],
          opacity: [{ to: 1, duration: 190 }, { to: 0, duration: 300 }],
          duration: 490,
        }, 1400);
      }

      // …y remate.
      if (fraseA) linea.add(fraseA, { opacity: [1, 0], translateY: [0, -10], duration: 170, ease: 'inQuad' }, 1900);
      if (fraseB) linea.add(fraseB, { opacity: [0, 1], translateY: [11, 0], duration: 290, ease: 'outBack' }, 2030);
      if (pastilla) {
        linea.add(pastilla, {
          // 1,1 es el tope: por encima, la pastilla (104 de ancho) rebasa el viewBox.
          scale: [{ to: 1.1, duration: 150 }, { to: 1, duration: 230 }],
          ease: 'outQuad',
        }, 2030);
      }
      ojos.forEach((o, i) => {
        linea.add(o, {
          scale: [{ to: 1.24, duration: 170 }, { to: 1, duration: 250 }],
          delay: i * 40, ease: 'outQuad',
        }, 2030);
      });
      cejas.forEach((c, i) => {
        linea.add(c, {
          translateY: [{ to: -7, duration: 160 }, { to: 0, duration: 240 }],
          delay: i * 40, ease: 'outQuad',
        }, 2030);
      });
      if (cabeza) {
        linea.add(cabeza, {
          rotate: [{ to: -4.5, duration: 150 }, { to: 4.5, duration: 190 }, { to: 0, duration: 190 }],
          ease: 'inOutQuad',
        }, 2070);
      }

      chispas.forEach((g, i) => {
        const ch = CHISPAS[i];
        if (!ch) return;
        linea.add(g, {
          translateX: ch.x, translateY: ch.y, rotate: i % 2 ? 160 : -150,
          scale: [1, 0.45], opacity: [1, 0], duration: 780, delay: i * 30,
        }, 2340);
      });

      // Colchón final: que dé tiempo a leer el remate antes de que el motor cierre.
      linea.add(raiz, { opacity: 1, duration: 340 }, 2820);
    } catch {
      // Si anime.js falla, nunca dejamos la celebración colgada ni a medio dibujar.
      tl?.revert();
      finRef.current();
      return;
    }

    return () => { tl?.revert(); };
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
      {/* Chispas del remate (detrás de la cara). */}
      <g transform="translate(0,-12)">
        {!reducido && CHISPAS.map((ch, i) => (
          <g className="cm-chispa" key={i} opacity="0">
            <rect x="-2.1" y="-4" width="4.2" height="8" rx="1.4" fill={ch.color} />
          </g>
        ))}
      </g>

      {/* ── La cara ──────────────────────────────────────────────────── */}
      <g className="cm-cabeza" style={{ transformOrigin: pivote(0, -12) }} opacity={reducido ? 1 : 0}>
        <ellipse cx="0" cy="-12" rx="36" ry="33" fill="var(--amarillo)" stroke="var(--texto)" strokeWidth="2.4" />

        {/* Cejas por las nubes. Arqueadas y en espejo: la asimetría la pone la boca.
            Los extremos están calculados para no salirse del óvalo de la cara. */}
        <path className="cm-ceja" d="M -25 -34 q 8.25 -7 16.5 -3" fill="none" stroke="var(--texto)" strokeWidth="3.4" strokeLinecap="round" opacity={reducido ? 1 : 0} />
        <path className="cm-ceja" d="M 25 -34 q -8.25 -7 -16.5 -3" fill="none" stroke="var(--texto)" strokeWidth="3.4" strokeLinecap="round" opacity={reducido ? 1 : 0} />

        {/* Ojos exageradísimos. Cada uno con su pivote: si no, en SVG el `scale`
            gira en el centro del viewBox y entrarían volando desde la nariz.
            El `scale(.15)` en línea evita el salto entre el montaje y anime.js. */}
        <g className="cm-ojo" style={{ transformOrigin: pivote(-14, -17), transform: reducido ? undefined : 'scale(0.15)' }}>
          <ellipse cx="-14" cy="-17" rx="12" ry="13.5" fill="#ffffff" stroke="var(--texto)" strokeWidth="2" />
          <circle className="cm-pupila" cx="-12.5" cy="-14" r="4.4" fill="#15161c" />
          <circle cx="-17" cy="-20.5" r="1.9" fill="#ffffff" />
        </g>
        <g className="cm-ojo" style={{ transformOrigin: pivote(14, -17), transform: reducido ? undefined : 'scale(0.15)' }}>
          <ellipse cx="14" cy="-17" rx="12" ry="13.5" fill="#ffffff" stroke="var(--texto)" strokeWidth="2" />
          <circle className="cm-pupila" cx="12.5" cy="-14" r="4.4" fill="#15161c" />
          <circle cx="9" cy="-20.5" r="1.9" fill="#ffffff" />
        </g>

        <ellipse className="cm-mejilla" cx="-24" cy="4" rx="6.5" ry="3.4" fill="var(--rojo)" opacity={reducido ? 0.26 : 0} />
        <ellipse className="cm-mejilla" cx="24" cy="4" rx="6.5" ry="3.4" fill="var(--rojo)" opacity={reducido ? 0.26 : 0} />

        {/* Sonrisa de suficiencia: asimétrica a propósito, sube más por la derecha. */}
        <path
          className="cm-boca"
          d="M -18 5 Q -2 20.5 16 6 Q 19.5 3.4 22.5 -1.5"
          fill="none"
          stroke="var(--texto)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* Destello de «aquí no ha pasado nada». Va FUERA del óvalo, flotando:
            encima de la cara chocaría con la ceja derecha. */}
        <g transform="translate(39,-33)">
          <path
            className="cm-glint"
            d="M 0 -6.5 Q 1.3 -1.3 6.5 0 Q 1.3 1.3 0 6.5 Q -1.3 1.3 -6.5 0 Q -1.3 -1.3 0 -6.5 Z"
            fill="#ffffff"
            stroke="var(--texto)"
            strokeWidth="1"
            opacity="0"
          />
        </g>
      </g>

      {/* ── Rótulo: planteamiento y remate ───────────────────────────── */}
      <rect
        className="cm-pastilla"
        x="-52"
        y="28"
        width="104"
        height="21"
        rx="10.5"
        fill="var(--azul)"
        style={{ transformOrigin: pivote(0, 38.5) }}
        opacity={reducido ? 1 : 0}
      />
      <text
        className="cm-frase-a"
        x="0"
        y="38.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="10"
        fontWeight="800"
        fill="#ffffff"
        textLength={anchoRotulo(frases[0])}
        lengthAdjust="spacingAndGlyphs"
        opacity="0"
      >
        {frases[0]}
      </text>
      <text
        className="cm-frase-b"
        x="0"
        y="38.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="10"
        fontWeight="800"
        fill="#ffffff"
        textLength={anchoRotulo(frases[1])}
        lengthAdjust="spacingAndGlyphs"
        opacity={reducido ? 1 : 0}
      >
        {frases[1]}
      </text>
    </svg>
  );
}
