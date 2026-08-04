'use client';
import { useId, useLayoutEffect, useRef } from 'react';
import { animate, createTimeline, stagger } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Café al 100 %» — al cerrar la acción, la taza se rellena, sube el vapor y el
 * medidor de energía llega a 100 con un chispazo. La cara pasa de fundida a
 * despierta justo cuando el café toca el borde.
 *
 * NOTAS DE MONTAJE
 *   - El CAFÉ es un rectángulo (con su capa de crema encima) que sube dentro de
 *     un `clipPath` con la forma interior de la taza. Subir un rectángulo es
 *     mucho más barato y estable que animar un `path`.
 *   - La BARRA crece animando el ATRIBUTO `width`, no un `translateX`: el
 *     degradado rojo→amarillo→verde va en `userSpaceOnUse`, así que si moviéramos
 *     la barra el degradado se movería con ella y entraría por el verde. Con
 *     `width` el degradado se queda quieto y se descubre de rojo a verde.
 *   - Los IDs de `clipPath`/`linearGradient` salen de `useId()`: el panel de
 *     ajustes puede pintar varias vistas previas en la misma página y dos IDs
 *     iguales se pisan (gana el primero del documento).
 *   - Dos caras cruzadas (`.cf-cara-cansada` / `.cf-cara-lista`) en vez de un
 *     rig de facciones: más barato y se lee mejor a tamaño pequeño.
 */

/** Acentos deliberados de la ilustración (el resto va con tokens del tema). */
const PIEL = '#e9b183';
const PELO = '#3f3020';
const CAFE = '#5f3a20';
const CREMA = '#b07b46';

/**
 * `viewBox="-60 -60 120 120"` + `transform-box: view-box` (el valor inicial):
 * el punto (x,y) del dibujo se escribe como (60+x, 60+y) px en `transform-origin`.
 */
const pivote = (x: number, y: number) => `${60 + x}px ${60 + y}px`;

/** Rayos del chispazo del 100 %. Determinista: nada de azar a nivel de módulo. */
const RAYOS = [0, 45, 90, 135, 180, 225, 270, 315];

export default function CafeAl100({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  // IDs únicos por instancia (varias vistas previas conviviendo en el panel).
  const uid = useId().replace(/:/g, '');
  const idTaza = `cf-taza-${uid}`;
  const idBarra = `cf-barra-${uid}`;
  const idGrad = `cf-grad-${uid}`;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: el SVG ya está en su fotograma final (taza llena,
    // barra al 100 %, cara despierta). No se anima NADA.
    if (reducido || !raiz) return;

    const uno = <T extends SVGElement>(sel: string) => raiz.querySelector<T>(sel);
    const todos = <T extends SVGElement>(sel: string) => Array.from(raiz.querySelectorAll<T>(sel));

    const escena = uno<SVGGElement>('.cf-escena');
    const liquido = uno<SVGGElement>('.cf-liquido');
    const barra = uno<SVGRectElement>('.cf-barra');
    const pct = uno<SVGTextElement>('.cf-pct');
    const taza = uno<SVGGElement>('.cf-taza');
    const persona = uno<SVGGElement>('.cf-persona');
    const caraCansada = uno<SVGGElement>('.cf-cara-cansada');
    const caraLista = uno<SVGGElement>('.cf-cara-lista');
    const vapor = todos<SVGPathElement>('.cf-vapor');
    const rayos = todos<SVGPathElement>('.cf-rayo');

    const vivos: { revert: () => void }[] = [];
    // Contador del medidor: anime.js también anima objetos JS, no solo el DOM.
    const contador = { valor: 0 };
    const escribirPct = (v: number) => { if (pct) pct.textContent = `${v} %`; };

    try {
      if (vapor.length) {
        vivos.push(animate(vapor, {
          translateY: [{ to: -11, duration: 1000 }],
          opacity: [{ to: 0.55, duration: 340 }, { to: 0, duration: 660 }],
          delay: stagger(230, { start: 850 }),
          loop: 2,
          ease: 'outQuad',
        }));
      }

      const tl = createTimeline({
        defaults: { ease: 'outQuad' },
        onComplete: () => { escribirPct(100); finRef.current(); },
      });
      vivos.push(tl);

      if (escena) tl.add(escena, { opacity: [0, 1], duration: 240 }, 0);

      // El café sube y el medidor lo acompaña.
      if (liquido) tl.add(liquido, { translateY: [30, 0], duration: 1180, ease: 'outQuad' }, 260);
      // `width` como atributo SVG: ver la nota de cabecera sobre el degradado.
      if (barra) tl.add(barra, { width: [0, 92], duration: 1500, ease: 'inOutQuad' }, 260);
      tl.add(contador, {
        valor: 100,
        duration: 1500,
        ease: 'inOutQuad',
        modifier: (v: number) => Math.round(v),
        onUpdate: () => escribirPct(contador.valor),
      }, 260);

      // Se despierta justo cuando la taza se llena.
      if (caraCansada) tl.add(caraCansada, { opacity: [1, 0], duration: 160 }, 1440);
      if (caraLista) tl.add(caraLista, { opacity: [0, 1], duration: 220 }, 1460);
      if (persona) {
        tl.add(persona, {
          translateY: [{ to: -4, duration: 150 }, { to: 0, duration: 240 }],
          ease: 'outQuad',
        }, 1440);
      }
      // Brindis corto con la taza.
      if (taza) {
        tl.add(taza, {
          rotate: [{ to: -10, duration: 230 }, { to: 0, duration: 300 }],
          ease: 'inOutQuad',
        }, 1500);
      }

      // Chispazo del 100 %.
      rayos.forEach((r, i) => {
        tl.add(r, {
          // Alcance máximo: 11 × 1,1 + 3,5 ≈ 15,6 desde (41, 35.5) → x ≤ 56,6.
          // Con más recorrido los rayos de la derecha se salían del viewBox.
          translateY: [0, -3.5],
          scale: [0.6, 1.1],
          opacity: [{ to: 0.95, duration: 170 }, { to: 0, duration: 430 }],
          delay: i * 22,
          ease: 'outCubic',
        }, 1770);
      });
      if (pct) {
        tl.add(pct, {
          scale: [{ to: 1.4, duration: 180 }, { to: 1, duration: 260 }],
          ease: 'outBack',
        }, 1780);
      }
      if (barra) {
        tl.add(barra, {
          opacity: [{ to: 0.45, duration: 130 }, { to: 1, duration: 170 }, { to: 0.45, duration: 130 }, { to: 1, duration: 170 }],
          ease: 'inOutQuad',
        }, 1800);
      }

      // Colchón final: que dé tiempo a leer el 100 % antes de que el motor cierre.
      tl.add(raiz, { opacity: 1, duration: 620 }, 2500);
    } catch {
      // Si anime.js falla, nunca dejamos la celebración colgada ni a medio dibujar.
      escribirPct(100);
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
        {/* Interior de la taza: recorta el café mientras sube. */}
        <clipPath id={idTaza}>
          <path d="M 2.4 -9.6 L 29.6 -9.6 L 26.9 13.6 Q 26.5 16.1 24 16.1 L 8 16.1 Q 5.5 16.1 5.1 13.6 Z" />
        </clipPath>
        <clipPath id={idBarra}>
          <rect x="-46" y="30" width="92" height="11" rx="5.5" />
        </clipPath>
        <linearGradient id={idGrad} gradientUnits="userSpaceOnUse" x1="-46" y1="0" x2="46" y2="0">
          <stop offset="0" stopColor="var(--rojo)" />
          <stop offset="0.55" stopColor="var(--amarillo)" />
          <stop offset="1" stopColor="var(--ok-solido)" />
        </linearGradient>
      </defs>

      <g className="cf-escena" opacity={reducido ? 1 : 0}>

        {/* ── Vapor (se pinta detrás de la taza) ───────────────────────── */}
        <path className="cf-vapor" d="M 10 -14 q 4.5 -5 0 -9.5 q -4.5 -4.5 0 -9" fill="none" stroke="var(--texto2)" strokeWidth="2.1" strokeLinecap="round" opacity={reducido ? 0.5 : 0} />
        <path className="cf-vapor" d="M 17 -16 q 4.5 -5 0 -9.5 q -4.5 -4.5 0 -9" fill="none" stroke="var(--texto2)" strokeWidth="2.1" strokeLinecap="round" opacity={reducido ? 0.5 : 0} />
        <path className="cf-vapor" d="M 24 -14 q 4.5 -5 0 -9.5 q -4.5 -4.5 0 -9" fill="none" stroke="var(--texto2)" strokeWidth="2.1" strokeLinecap="round" opacity={reducido ? 0.5 : 0} />

        {/* ── El personaje ─────────────────────────────────────────────── */}
        <g className="cf-persona">
          <path d="M -35.5 -11 h 7 v 13 h -7 Z" fill={PIEL} />
          <path d="M -50 17 Q -49 3 -32 1.5 Q -15 3 -14 17 Z" fill="var(--azul)" stroke="var(--texto)" strokeWidth="1.5" />
          {/* Brazo que sostiene la taza. */}
          <path d="M -17 7 L -1 9.5" fill="none" stroke={PIEL} strokeWidth="4.2" strokeLinecap="round" />
          <circle cx="-32" cy="-20" r="12.5" fill={PIEL} stroke="var(--texto)" strokeWidth="1.6" />
          <path d="M -44.4 -22.6 Q -41 -34.4 -32 -32.6 Q -22.4 -31 -20.6 -22 Q -26 -28.2 -33.6 -27.2 Q -41 -26.2 -44.4 -22.6 Z" fill={PELO} />

          {/* Cara A: fundida. */}
          <g className="cf-cara-cansada" opacity={reducido ? 0 : 1}>
            <path d="M -38.4 -22.4 q 2.3 2.1 4.6 0" fill="none" stroke="var(--texto)" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M -30 -22.4 q 2.3 2.1 4.6 0" fill="none" stroke="var(--texto)" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M -38.2 -18.6 q 2.2 1.3 4.2 0" fill="none" stroke="var(--texto)" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
            <path d="M -29.8 -18.6 q 2.2 1.3 4.2 0" fill="none" stroke="var(--texto)" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
            <path d="M -35.4 -13.6 q 1.7 1.7 3.4 0 q 1.7 -1.7 3.4 0" fill="none" stroke="var(--texto)" strokeWidth="1.4" strokeLinecap="round" />
          </g>

          {/* Cara B: despierta. */}
          <g className="cf-cara-lista" opacity={reducido ? 1 : 0}>
            <path d="M -39.6 -27.2 q 2.7 -2.1 5.2 -0.6" fill="none" stroke="var(--texto)" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M -30.4 -27.8 q 2.7 -1.5 5.2 0.6" fill="none" stroke="var(--texto)" strokeWidth="1.5" strokeLinecap="round" />
            <ellipse cx="-36.2" cy="-21.6" rx="3.5" ry="4.1" fill="#ffffff" stroke="var(--texto)" strokeWidth="1.1" />
            <ellipse cx="-27.6" cy="-21.6" rx="3.5" ry="4.1" fill="#ffffff" stroke="var(--texto)" strokeWidth="1.1" />
            <circle cx="-35.6" cy="-21" r="1.9" fill="#15161c" />
            <circle cx="-27" cy="-21" r="1.9" fill="#15161c" />
            <circle cx="-36.6" cy="-22.4" r="0.8" fill="#ffffff" />
            <circle cx="-28" cy="-22.4" r="0.8" fill="#ffffff" />
            <path d="M -36 -14 q 4 4.6 8 0" fill="none" stroke="var(--texto)" strokeWidth="1.7" strokeLinecap="round" />
          </g>
        </g>

        {/* ── La taza ──────────────────────────────────────────────────── */}
        <g className="cf-taza" style={{ transformOrigin: pivote(16, 18) }}>
          <path d="M 32 -5 Q 44 -3 43 4.5 Q 42 11 31 11.5" fill="none" stroke="var(--texto)" strokeWidth="2.6" strokeLinecap="round" />
          <path
            d="M 0 -12 L 32 -12 L 29 14 Q 28.4 18.5 24 18.5 L 8 18.5 Q 3.6 18.5 3 14 Z"
            fill="var(--sup1)"
            stroke="var(--texto)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <g clipPath={`url(#${idTaza})`}>
            <g className="cf-liquido" transform={reducido ? undefined : 'translate(0,30)'}>
              <rect x="0" y="-9" width="34" height="30" fill={CAFE} />
              <ellipse cx="16" cy="-9" rx="14" ry="2.6" fill={CREMA} />
            </g>
          </g>
          {/* Mano por delante: se ve que la agarra. */}
          <circle cx="1.5" cy="9.5" r="3.4" fill={PIEL} stroke="var(--texto)" strokeWidth="1" />
        </g>

        {/* ── Medidor de energía ───────────────────────────────────────── */}
        <text x="-46" y="25" fontSize="7.5" fontWeight="700" fill="var(--texto2)" letterSpacing="0.6">ENERGÍA</text>
        <text
          className="cf-pct"
          x="46"
          y="25"
          textAnchor="end"
          fontSize="11"
          fontWeight="800"
          fill="var(--texto)"
          style={{ transformOrigin: pivote(46, 22) }}
        >
          {reducido ? '100 %' : '0 %'}
        </text>
        <rect x="-46" y="30" width="92" height="11" rx="5.5" fill="var(--sup2)" stroke="var(--borde-f)" strokeWidth="1.2" />
        <g clipPath={`url(#${idBarra})`}>
          <rect className="cf-barra" x="-46" y="30" width={reducido ? 92 : 0} height="11" fill={`url(#${idGrad})`} />
        </g>

        {/* Chispazo al llegar al 100 %. */}
        <g transform="translate(41,35.5)">
          {RAYOS.map((g) => (
            <g key={g} transform={`rotate(${g})`}>
              <path
                className="cf-rayo"
                d="M 0 -7 L 0 -11"
                fill="none"
                stroke="var(--amarillo)"
                strokeWidth="2.4"
                strokeLinecap="round"
                opacity={reducido ? 0.6 : 0}
              />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
