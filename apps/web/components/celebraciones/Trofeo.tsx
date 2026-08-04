'use client';
import { useId, useLayoutEffect, useRef } from 'react';
import { animate, createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Trofeo» — sube desde abajo con rebote, gira detrás una rueda de rayos de luz,
 * le cruza un brillo, saltan destellos y al final aparece grabado «GRACIAS» en
 * la placa. Para los hitos.
 *
 * POR QUÉ «GRACIAS» Y NO «CAMPEÓN»: aquí no se compite con nadie. El trofeo es
 * el reconocimiento de un equipo que está cansado, no un marcador.
 *
 * NOTAS DE MONTAJE
 *  - La RUEDA DE RAYOS es un grupo que gira en bucle lento alrededor de su
 *    origen local; los rayos son más largos que el lienzo a propósito, el `<svg>`
 *    los recorta y así la luz llega a los bordes sin dibujar el borde.
 *  - EL BRILLO es un rectángulo blanco inclinado que se desplaza recortado por
 *    la silueta de la copa (`clipPath`). El rectángulo va dentro de un `<g>` con
 *    la inclinación: si la inclinación fuera atributo del propio rectángulo,
 *    anime.js la borraría al animarle el desplazamiento (atributo `transform` y
 *    propiedad CSS `transform` son la misma cosa).
 *  - Los ids de `linearGradient` y `clipPath` salen de `useId()`: el panel puede
 *    pintar varias vistas previas a la vez y dos ids iguales se pisan.
 *  - Los tonos dorados son un acento deliberado de la ilustración (un trofeo es
 *    dorado en los dos temas); el resto va con tokens.
 */

const ORO_OSC = '#c98f10';
const GRABADO = '#6b4a05';

/** Silueta de la copa (sirve de dibujo y de recorte para el brillo). */
const COPA = 'M -16.5 -30 L 16.5 -30 L 13 -8 Q 12 -1 0 -1 Q -12 -1 -13 -8 Z';

/** Rueda de luz: 12 rayos largos que el lienzo recorta. */
const RAYOS = Array.from({ length: 12 }, (_, i) => i * 30);

/** Destellos: dónde y cuándo. Deterministas, nada de azar a nivel de módulo. */
const DESTELLOS = [
  { x: -31, y: -37, r: 7, t: 900 },
  { x: 27, y: -41, r: 8, t: 1080 },
  { x: 35, y: -15, r: 6, t: 1300 },
  { x: -35, y: -12, r: 6.5, t: 1500 },
  { x: 2, y: -47, r: 5.5, t: 1700 },
];

export default function Trofeo({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  const uid = useId().replace(/:/g, '');
  const idOro = `tr-oro-${uid}`;
  const idCopa = `tr-copa-${uid}`;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: el SVG ya está en su fotograma final (trofeo arriba,
    // «GRACIAS» grabado, destellos puestos). No se anima NADA.
    if (reducido || !raiz) return;

    const uno = <T extends SVGElement>(sel: string) => raiz.querySelector<T>(sel);
    const todos = <T extends SVGElement>(sel: string) => Array.from(raiz.querySelectorAll<T>(sel));

    const rueda = uno<SVGGElement>('.tr-rueda');
    const halo = uno<SVGCircleElement>('.tr-halo');
    const trofeo = uno<SVGGElement>('.tr-trofeo');
    const brillo = uno<SVGRectElement>('.tr-brillo');
    const posa = uno<SVGEllipseElement>('.tr-posa');
    const chispas = todos<SVGGElement>('.tr-chispa');
    const gracias = uno<SVGTextElement>('.tr-gracias');

    /** Si anime.js falla, el trofeo se queda arriba y con su placa grabada. */
    const rescate = () => {
      if (gracias) gracias.style.opacity = '1';
      chispas.forEach((c) => { c.style.opacity = '0.9'; });
    };

    const vivos: { revert: () => void }[] = [];
    try {
      // La rueda de luz gira sola, despacio y sin parar: es el fondo de la escena.
      if (rueda) {
        vivos.push(animate(rueda, { rotate: 360, duration: 15000, ease: 'linear', loop: true }));
      }

      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      if (rueda) tl.add(rueda, { opacity: [0, 1], duration: 460 }, 0);
      if (halo) tl.add(halo, { opacity: [0, 0.14], scale: [0.4, 1], duration: 520 }, 0);

      // El trofeo sube. `outBack` da el asentamiento sin animarlo aparte.
      if (trofeo) tl.add(trofeo, { translateY: [56, 0], opacity: [0, 1], duration: 620, ease: 'outBack' }, 140);
      if (posa) {
        tl.add(posa, { scale: [0.3, 1.5], opacity: [{ to: 0.5, duration: 120 }, { to: 0, duration: 460 }], duration: 580 }, 600);
      }

      // Brillo que cruza la copa.
      if (brillo) {
        tl.add(brillo, { translateX: [0, 62], opacity: [{ to: 0.5, duration: 160 }, { to: 0, duration: 420 }], duration: 620, ease: 'inOutQuad' }, 780);
      }

      // Destellos alrededor: cada uno abre y cierra.
      chispas.forEach((c, i) => {
        const d = DESTELLOS[i];
        if (!d) return;
        tl.add(c, {
          scale: [{ to: 1, duration: 260 }, { to: 0.2, duration: 380 }],
          opacity: [{ to: 1, duration: 200 }, { to: 0, duration: 440 }],
          rotate: [-30, 20],
          duration: 640,
          ease: 'outQuad',
        }, d.t);
      });

      // REMATE: se graba «GRACIAS» y el trofeo da un golpe de pecho.
      if (gracias) tl.add(gracias, { opacity: [0, 1], scale: [0.55, 1], duration: 460, ease: 'outBack' }, 1900);
      if (trofeo) {
        tl.add(trofeo, {
          scale: [{ to: 1.07, duration: 200 }, { to: 1, duration: 300 }], translateY: 0, ease: 'outQuad',
        }, 2060);
      }
      if (halo) {
        tl.add(halo, { opacity: [{ to: 0.3, duration: 200 }, { to: 0.14, duration: 420 }], duration: 620, ease: 'inOutQuad' }, 2060);
      }
      if (gracias) {
        tl.add(gracias, { scale: [{ to: 1.1, duration: 180 }, { to: 1, duration: 240 }], opacity: 1, ease: 'inOutQuad' }, 2380);
      }

      // Colchón final: que dé tiempo a leer el mensaje del overlay.
      tl.add(raiz, { opacity: 1, duration: 520 }, 2620);
    } catch {
      rescate();
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
      <defs>
        <linearGradient id={idOro} gradientUnits="userSpaceOnUse" x1="0" y1="-36" x2="0" y2="26">
          <stop offset="0" stopColor="#ffd95e" />
          <stop offset="0.55" stopColor="#f0b429" />
          <stop offset="1" stopColor="#d99a12" />
        </linearGradient>
        <clipPath id={idCopa}>
          <path d={COPA} />
        </clipPath>
      </defs>

      {/* ── Luz de fondo: rueda de rayos + halo ────────────────────────── */}
      <g transform="translate(0,-10)">
        <g className="tr-rueda" opacity={reducido ? 1 : 0}>
          {RAYOS.map((a) => (
            <path key={a} d="M -4.5 0 L -2 -78 L 2 -78 L 4.5 0 Z" fill="var(--amarillo)" opacity="0.16" transform={`rotate(${a})`} />
          ))}
        </g>
        <circle className="tr-halo" r="34" fill="var(--amarillo)" opacity={reducido ? 0.14 : 0} />
      </g>

      {/* Onda de la base al posarse. Va dentro de un `<g>` colocado para que
          escale DESDE ella misma: si escalara desde el centro del lienzo, se
          iría hacia abajo mientras crece. */}
      <g transform="translate(0,28)">
        <ellipse className="tr-posa" rx="24" ry="4" fill="none" stroke="var(--amarillo)" strokeWidth="2.4" opacity="0" />
      </g>

      {/* ── El trofeo ──────────────────────────────────────────────────── */}
      <g className="tr-trofeo">
        <g stroke={ORO_OSC} strokeWidth="1.6" strokeLinejoin="round">
          {/* Asas: van detrás de la copa. */}
          <path d="M -17 -27 q -13.5 1 -13 9.5 q 0.5 8.5 11.5 9" fill="none" stroke={`url(#${idOro})`} strokeWidth="5" strokeLinecap="round" />
          <path d="M 17 -27 q 13.5 1 13 9.5 q -0.5 8.5 -11.5 9" fill="none" stroke={`url(#${idOro})`} strokeWidth="5" strokeLinecap="round" />

          <path d={COPA} fill={`url(#${idOro})`} />
          <rect x="-19.5" y="-36.5" width="39" height="7" rx="3.5" fill={`url(#${idOro})`} />
          <rect x="-4.2" y="-2" width="8.4" height="9" rx="1.6" fill={`url(#${idOro})`} />
          <rect x="-13" y="6" width="26" height="6.5" rx="2" fill={`url(#${idOro})`} />
          <rect x="-22" y="12" width="44" height="13" rx="2.5" fill={`url(#${idOro})`} />
        </g>

        {/* Estrella grabada en la copa. */}
        <path
          d="M 0 -25.5 L 2.4 -18.6 L 9.6 -18.6 L 3.8 -14.2 L 6 -7.4 L 0 -11.6 L -6 -7.4 L -3.8 -14.2 L -9.6 -18.6 L -2.4 -18.6 Z"
          fill={ORO_OSC}
          opacity="0.55"
        />

        {/* Brillo que cruza, recortado por la silueta de la copa. */}
        <g clipPath={`url(#${idCopa})`}>
          <g transform="rotate(18)">
            <rect className="tr-brillo" x="-46" y="-44" width="10" height="62" fill="#ffffff" opacity="0" />
          </g>
        </g>

        {/* El grabado de la placa. Colocado en su propio `<g>` para que el
            «pop» del final crezca en su sitio y no se deslice hacia abajo. */}
        <g transform="translate(0,21.4)">
          <text
            className="tr-gracias"
            textAnchor="middle"
            fontSize="7.4"
            fontWeight="800"
            letterSpacing="1.3"
            fill={GRABADO}
            opacity={reducido ? 1 : 0}
          >
            GRACIAS
          </text>
        </g>
      </g>

      {/* ── Destellos ──────────────────────────────────────────────────── */}
      {DESTELLOS.map((d, i) => (
        <g key={i} transform={`translate(${d.x},${d.y})`}>
          <g className="tr-chispa" opacity={reducido ? 0.9 : 0}>
            <path
              d={`M 0 ${-d.r} Q ${d.r * 0.18} ${-d.r * 0.18} ${d.r} 0 Q ${d.r * 0.18} ${d.r * 0.18} 0 ${d.r} `
                + `Q ${-d.r * 0.18} ${d.r * 0.18} ${-d.r} 0 Q ${-d.r * 0.18} ${-d.r * 0.18} 0 ${-d.r} Z`}
              fill="var(--amarillo)"
            />
          </g>
        </g>
      ))}
    </svg>
  );
}
