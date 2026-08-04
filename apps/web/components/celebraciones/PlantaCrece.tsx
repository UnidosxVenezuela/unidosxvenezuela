'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline, svg } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Planta que crece» — la tierra se abre, el tallo se dibuja hacia arriba,
 * salen dos hojas, la flor se abre pétalo a pétalo y, de remate, aparece un
 * segundo brote al lado: lo que se planta sigue.
 *
 * POR QUÉ ESTA: es la celebración discreta del catálogo. Reconstruir no es una
 * fiesta con confeti; es esto. Encaja con el contexto sin celebrar la tragedia,
 * y sirve para el turno de madrugada en el que una traca sonaría fatal.
 *
 * NOTAS DE MONTAJE
 *  - EL TALLO se dibuja con `svg.createDrawable` (`draw: '0 0' → '0 1'`), que
 *    juega con `stroke-dasharray`. El path empieza en la tierra, así que crece
 *    hacia arriba solo. Con movimiento reducido no se aplica el drawable y el
 *    trazo se ve entero, que es justo el fotograma final.
 *  - HOJAS, PÉTALOS Y BROTE se escalan desde 0 y cada uno está dibujado a partir
 *    de SU punto de anclaje (el `<g>` de colocación lleva el `transform`, el de
 *    dentro es el que anima): con `viewBox="-60 -60 120 120"` el
 *    `transform-origin` por defecto cae en el (0,0) local, o sea en el anclaje.
 *    Por eso brotan del tallo y no del centro del lienzo.
 *  - EL VAIVÉN gira la planta entera desde la BASE, y esa sí necesita
 *    `transform-origin` explícito: para eso está `pivote()`.
 *  - Si anime.js fallara, la planta ya está dibujada entera en el SVG: lo único
 *    que empieza oculto son los efectos (terrones, polen, onda). Nunca se queda
 *    media planta en pantalla.
 */

/** Acentos deliberados de la ilustración (el resto va con tokens del tema). */
const TIERRA = '#8a6240';
const TIERRA_OSC = '#6b4a2c';

/**
 * `viewBox="-60 -60 120 120"` + `transform-box: view-box` (el valor inicial):
 * el punto (x,y) del dibujo se escribe como (60+x, 60+y) px en `transform-origin`.
 */
const pivote = (x: number, y: number) => `${60 + x}px ${60 + y}px`;

/** Terrones que saltan al abrirse la tierra. */
const TERRONES = [
  { x: -9, y: -7 }, { x: -4, y: -11 }, { x: 4, y: -12 }, { x: 9, y: -6 }, { x: 0, y: -14 },
];

/** Polen que sube cuando la flor se abre. */
const POLEN = [
  { x: -20, y: -26, d: -16, t: 1780 },
  { x: 18, y: -30, d: -19, t: 1860 },
  { x: -12, y: -38, d: -14, t: 1960 },
  { x: 22, y: -18, d: -17, t: 2040 },
  { x: -25, y: -14, d: -13, t: 2120 },
];

/** Una hoja dibujada desde su anclaje, apuntando a la derecha. */
function Hoja({ color }: { color: string }) {
  return (
    <g>
      <path d="M 0 0 C 5 -7.5 14 -8.5 18.5 -3 C 13.5 3 5 4 0 0 Z" fill={color} />
      <path d="M 1.5 -0.6 C 7 -2.6 12 -3.6 16.5 -3.2" fill="none" stroke={TIERRA_OSC} strokeWidth="0.9" opacity="0.35" />
    </g>
  );
}

export default function PlantaCrece({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: el SVG ya está en su fotograma final (planta crecida,
    // flor abierta, segundo brote). No se anima NADA.
    if (reducido || !raiz) return;

    const uno = <T extends SVGElement>(sel: string) => raiz.querySelector<T>(sel);
    const todos = <T extends SVGElement>(sel: string) => Array.from(raiz.querySelectorAll<T>(sel));

    const tierra = uno<SVGGElement>('.pl-tierra');
    const tallo = uno<SVGPathElement>('.pl-tallo');
    const hojas = todos<SVGGElement>('.pl-hoja');
    const petalos = todos<SVGGElement>('.pl-petalo');
    const centro = uno<SVGGElement>('.pl-centro');
    const flor = uno<SVGGElement>('.pl-flor');
    const planta = uno<SVGGElement>('.pl-planta');
    const terrones = todos<SVGCircleElement>('.pl-terron');
    const polen = todos<SVGCircleElement>('.pl-polen');
    const onda = uno<SVGCircleElement>('.pl-onda');
    const brote = uno<SVGGElement>('.pl-brote');

    let tl: ReturnType<typeof createTimeline> | null = null;
    try {
      const linea = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      tl = linea;

      if (tierra) linea.add(tierra, { translateY: [8, 0], opacity: [0, 1], duration: 320 }, 0);

      // La tierra se abre y saltan cuatro terrones.
      terrones.forEach((t, i) => {
        const p = TERRONES[i];
        if (!p) return;
        linea.add(t, {
          translateX: p.x,
          translateY: p.y,
          opacity: [{ to: 0.9, duration: 90 }, { to: 0, duration: 420 }],
          scale: [1, 0.4],
          duration: 510,
          delay: i * 26,
          ease: 'outQuad',
        }, 240);
      });

      // El tallo se dibuja de la tierra hacia arriba.
      if (tallo) linea.add(svg.createDrawable(tallo), { draw: ['0 0', '0 1'], duration: 950, ease: 'outQuad' }, 300);

      // Las hojas brotan del tallo, cada una a su altura.
      hojas.forEach((h, i) => {
        linea.add(h, { scale: [0, 1], opacity: [0, 1], duration: 420, ease: 'outBack' }, 760 + i * 230);
      });

      // La flor se abre pétalo a pétalo.
      petalos.forEach((p, i) => {
        linea.add(p, { scale: [0, 1], opacity: [0, 1], duration: 460, delay: i * 60, ease: 'outBack' }, 1320);
      });
      if (centro) linea.add(centro, { scale: [0, 1], duration: 420, ease: 'outBack' }, 1560);
      if (onda) {
        linea.add(onda, { scale: [0.3, 2.6], opacity: [{ to: 0.45, duration: 130 }, { to: 0, duration: 620 }], duration: 750 }, 1700);
      }

      // El polen sube y se apaga.
      polen.forEach((c, i) => {
        const p = POLEN[i];
        if (!p) return;
        linea.add(c, {
          translateY: p.d,
          translateX: i % 2 ? 4 : -4,
          opacity: [{ to: 0.85, duration: 220 }, { to: 0, duration: 700 }],
          duration: 920,
          ease: 'outQuad',
        }, p.t);
      });

      // Un vaivén suave desde la base, como si pasara aire.
      if (planta) {
        linea.add(planta, {
          rotate: [{ to: 2.6, duration: 420 }, { to: -1.8, duration: 460 }, { to: 0, duration: 380 }],
          ease: 'inOutQuad',
        }, 1820);
      }

      // REMATE: sale un segundo brote al lado. Lo que se planta, sigue.
      if (brote) linea.add(brote, { scale: [0, 1], opacity: [0, 1], duration: 520, ease: 'outBack' }, 2260);
      if (flor) {
        linea.add(flor, { scale: [{ to: 1.09, duration: 200 }, { to: 1, duration: 280 }], ease: 'inOutQuad' }, 2560);
      }

      // Colchón final: que dé tiempo a leer el mensaje del overlay.
      linea.add(raiz, { opacity: 1, duration: 520 }, 2820);
    } catch {
      // La planta ya está dibujada entera: no hace falta rescatar nada más.
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
      {/* ── La tierra ──────────────────────────────────────────────────── */}
      <g className="pl-tierra">
        <path d="M -46 26 Q 0 4 46 26 Q 0 40 -46 26 Z" fill={TIERRA} />
        <path d="M -46 26 Q 0 4 46 26" fill="none" stroke={TIERRA_OSC} strokeWidth="2" strokeLinecap="round" />
        <g fill={TIERRA_OSC} opacity="0.5">
          <ellipse cx="-24" cy="22" rx="4" ry="2.4" />
          <ellipse cx="15" cy="24" rx="3.2" ry="2" />
          <ellipse cx="34" cy="26" rx="2.6" ry="1.6" />
        </g>
      </g>

      {/* Terrones del momento en que rompe la superficie. */}
      <g transform="translate(0,15)">
        {TERRONES.map((t, i) => (
          <circle className="pl-terron" key={i} r={i % 2 ? 1.8 : 2.4} fill={TIERRA_OSC} opacity="0" />
        ))}
      </g>

      {/* ── La planta (gira desde la base) ─────────────────────────────── */}
      <g className="pl-planta" style={{ transformOrigin: pivote(0, 17) }}>
        <path
          className="pl-tallo"
          d="M 0 17 C -1.5 7 2 -4 0 -17"
          fill="none"
          stroke="var(--ok-solido)"
          strokeWidth="3.6"
          strokeLinecap="round"
        />

        <g transform="translate(-0.5,7) rotate(205)">
          <g className="pl-hoja"><Hoja color="var(--ok)" /></g>
        </g>
        <g transform="translate(0.8,-4) rotate(-25)">
          <g className="pl-hoja"><Hoja color="var(--ok-solido)" /></g>
        </g>

        {/* La flor. */}
        <g transform="translate(0,-19)">
          <circle className="pl-onda" r="10" fill="none" stroke="var(--amarillo)" strokeWidth="2.4" opacity="0" />
          <g className="pl-flor">
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <g key={a} transform={`rotate(${a})`}>
                <g className="pl-petalo">
                  <ellipse cy="-9" rx="5.2" ry="8.6" fill="var(--amarillo)" stroke="var(--amarillo-osc)" strokeWidth="1.1" />
                </g>
              </g>
            ))}
            <g className="pl-centro">
              <circle r="5.6" fill="var(--rojo)" />
              <circle cx="-1.8" cy="-1.4" r="1" fill="var(--amarillo)" opacity="0.8" />
              <circle cx="1.9" cy="0.9" r="0.9" fill="var(--amarillo)" opacity="0.8" />
            </g>
          </g>
        </g>
      </g>

      {/* ── El segundo brote: el remate ────────────────────────────────── */}
      <g transform="translate(26,18)">
        <g className="pl-brote">
          <path d="M 0 2 C 0.6 -2 -0.6 -6 0 -10" fill="none" stroke="var(--ok-solido)" strokeWidth="2.6" strokeLinecap="round" />
          <g transform="translate(0,-7) rotate(-32) scale(0.5)"><Hoja color="var(--ok)" /></g>
          <g transform="translate(-0.4,-3) rotate(212) scale(0.42)"><Hoja color="var(--ok-solido)" /></g>
        </g>
      </g>

      {/* Polen que sube al abrirse la flor. */}
      {POLEN.map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`}>
          <circle className="pl-polen" r={i % 2 ? 1.5 : 2} fill="var(--amarillo)" opacity="0" />
        </g>
      ))}
    </svg>
  );
}
