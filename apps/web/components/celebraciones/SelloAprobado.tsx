'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Sello de aprobado»: un sello de caucho cae con fuerza sobre un documento,
 * el papel acusa el golpe, el sello rebota, vuelve a tocar flojito y se retira
 * dejando la marca «VERIFICADO» con su polvo de tinta.
 *
 * Momento que cuenta: `solicitud_verificada`. La forma sola ya dice el evento
 * (papel + sello + marca), el rótulo solo lo confirma. Es el trámite cumplido:
 * satisfactorio y sobrio, sin fiesta — verificar es responsabilidad, no jolgorio.
 *
 * REGLAS DE GEOMETRÍA (ver el contrato en `lib/celebraciones.ts`):
 *  - `viewBox="-60 -60 120 120"` → el origen es el centro y el `transform-origin`
 *    por defecto de SVG cae justo ahí: `scale`/`rotate` giran alrededor del centro.
 *  - Cada elemento animado es HIJO DIRECTO del <svg> y su dibujo está centrado en
 *    el origen; se coloca en su sitio con `translate`. anime.js compone
 *    `translate … rotate … scale`, así que el `scale` actúa sobre el dibujo en su
 *    propio centro y DESPUÉS se traslada. Nunca se anidan transformaciones
 *    animadas (un padre movido desplaza el origen de giro de sus hijos).
 *  - Todo lo animado nace con `opacity: 0` en el JSX: si anime.js tarda un
 *    fotograma en fijar el estado inicial, no se ve ningún salto.
 */

/**
 * El `viewBox` está centrado en el origen, así que el `transform-origin` por
 * defecto (el centro del view-box) ES el punto (0,0): toda transformación queda
 * como una matriz pura sobre el origen y el `transform-origin` deja de importar.
 * De eso depende TODA la geometría de este archivo, y a su vez depende de que
 * `transform-box` sea `view-box` — es el valor inicial, pero se declara
 * explícito para no jugárselo a la interpretación del navegador.
 */
const EJE = { transformBox: 'view-box' } as const;

/** Dónde golpea el sello el papel (y dónde nace la marca). */
const IMPACTO_Y = 8;
/** Inclinación de la marca: un sello a mano nunca cae recto. */
const GIRO_MARCA = -9;
/** Transform en reposo de la marca = su fotograma final. */
const MARCA_QUIETA = `translateY(${IMPACTO_Y}px) rotate(${GIRO_MARCA}deg)`;

/**
 * Polvo de tinta que salta en el golpe. Determinista (nada de azar a nivel de
 * módulo) y aplastado en vertical: se esparce A RAS del papel, no en burbuja.
 */
const POLVO = Array.from({ length: 11 }, (_, i) => {
  const ang = (i / 11) * Math.PI * 2 + (i % 2 ? 0.42 : 0);
  const dist = 24 + (i % 3) * 8;
  return {
    x: +(Math.cos(ang) * dist).toFixed(1),
    y: +(IMPACTO_Y + Math.sin(ang) * dist * 0.5).toFixed(1),
    r: i % 3 === 0 ? 2.5 : i % 3 === 1 ? 1.7 : 2.1,
    op: i % 2 ? 0.8 : 0.5,
  };
});

export default function SelloAprobado({ onFin, reducido, size = 160 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: NO se anima nada. El JSX ya está pintado en su
    // fotograma final (documento sellado, sin sello ni polvo: ya se retiró).
    if (reducido || !raiz) return;

    const doc = raiz.querySelector<SVGGElement>('.sa-doc');
    const sello = raiz.querySelector<SVGGElement>('.sa-sello');
    const marca = raiz.querySelector<SVGGElement>('.sa-marca');
    const onda = raiz.querySelector<SVGRectElement>('.sa-onda');
    const polvo = Array.from(raiz.querySelectorAll<SVGCircleElement>('.sa-polvo'));

    let tl: ReturnType<typeof createTimeline> | null = null;
    try {
      const linea = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      tl = linea;

      // 1. El documento entra sobre la mesa.
      if (doc) linea.add(doc, { opacity: [0, 1], scale: [0.9, 1], translateY: [9, 0], duration: 340, ease: 'outBack' }, 0);

      // 2. El sello cae ACELERANDO (`inQuad`): es lo que le da el peso.
      if (sello) {
        linea.add(sello, { opacity: [0, 1], duration: 110 }, 190);
        linea.add(sello, { translateY: [-74, IMPACTO_Y], duration: 380, ease: 'inQuad' }, 190);
        // 3. Golpe: el caucho se aplasta contra el papel y se recupera.
        linea.add(sello, { scaleY: [1, 0.86], scaleX: [1, 1.05], duration: 70 }, 570);
        linea.add(sello, { scaleY: 1, scaleX: 1, duration: 260, ease: 'outBack' }, 640);
        // 4. Rebota, vuelve a tocar flojito y se retira dejando ver la marca.
        linea.add(sello, { translateY: -18, duration: 230 }, 650);
        linea.add(sello, { translateY: IMPACTO_Y - 3, duration: 170, ease: 'inQuad' }, 880);
        linea.add(sello, { translateY: -80, opacity: 0, duration: 430, ease: 'inCubic' }, 1090);
      }

      // El papel acusa el impacto (y solo entonces, no antes).
      if (doc) {
        linea.add(doc, { scale: 1.035, duration: 70 }, 570);
        linea.add(doc, { scale: 1, duration: 340, ease: 'outBack' }, 640);
      }

      // 5. La marca queda impresa en el instante del golpe, no después.
      //    `translateY`/`rotate` se repiten en cada entrada (ya están en el JSX):
      //    así el transform completo nunca depende de lo que anime.js infiera.
      if (marca) {
        linea.add(marca, {
          opacity: [0, 1], scale: [1.3, 1],
          translateY: IMPACTO_Y, rotate: GIRO_MARCA,
          duration: 250, ease: 'outBack',
        }, 570);
        // Golpe de gracia: la tinta asienta con un latido corto.
        linea.add(marca, { scale: 1.07, translateY: IMPACTO_Y, rotate: GIRO_MARCA, duration: 150 }, 1560);
        linea.add(marca, { scale: 1, translateY: IMPACTO_Y, rotate: GIRO_MARCA, duration: 260 }, 1710);
      }
      if (onda) {
        linea.add(onda, {
          translateY: IMPACTO_Y, rotate: GIRO_MARCA,
          scale: [1, 1.4], opacity: [0.55, 0], duration: 680,
        }, 1560);
      }

      // 6. Polvo de tinta: sale del punto de impacto y se apaga.
      polvo.forEach((c, i) => {
        const p = POLVO[i];
        if (!p) return;
        linea.add(c, {
          translateX: [0, p.x],
          translateY: [IMPACTO_Y, p.y],
          scale: [0.4, 1],
          opacity: [p.op, 0],
          duration: 780,
          delay: i * 22,
          ease: 'outCubic',
        }, 560);
      });

      // Respiro final para que dé tiempo a leer el mensaje del overlay.
      linea.add(raiz, { opacity: 1, duration: 700 });
    } catch {
      // Si anime.js falla no dejamos el dibujo a medias ni la celebración colgada.
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
      {/* ── El documento (con su esquina doblada) ── */}
      <g className="sa-doc" style={{ ...EJE, opacity: reducido ? 1 : 0 }}>
        <path
          d="M -34 -44 H 20 L 34 -30 V 44 H -34 Z"
          style={{ fill: 'var(--sup1)', stroke: 'var(--borde-f)', strokeWidth: 1.6 }}
          strokeLinejoin="round"
        />
        <path
          d="M 20 -44 L 34 -30 H 20 Z"
          style={{ fill: 'var(--sup2)', stroke: 'var(--borde-f)', strokeWidth: 1.6 }}
          strokeLinejoin="round"
        />
        <rect x="-24" y="-34" width="32" height="5" rx="2.5" style={{ fill: 'var(--azul)', opacity: 0.55 }} />
        <rect x="-24" y="-24" width="47" height="3.4" rx="1.7" style={{ fill: 'var(--borde-f)' }} />
        <rect x="-24" y="-17.5" width="39" height="3.4" rx="1.7" style={{ fill: 'var(--borde-f)' }} />
        <rect x="-24" y="27" width="44" height="3.4" rx="1.7" style={{ fill: 'var(--borde-f)' }} />
        <rect x="-24" y="33.5" width="27" height="3.4" rx="1.7" style={{ fill: 'var(--borde-f)' }} />
      </g>

      {/* ── El polvo de tinta (transitorio: no existe en el fotograma final) ── */}
      {!reducido && POLVO.map((p, i) => (
        <circle key={i} className="sa-polvo" r={p.r} style={{ ...EJE, fill: 'var(--rojo)', opacity: 0 }} />
      ))}

      {/* ── La marca: lo único que de verdad queda ── */}
      <g className="sa-marca" style={{ ...EJE, transform: MARCA_QUIETA, opacity: reducido ? 1 : 0 }}>
        <rect
          x="-29" y="-10.5" width="58" height="21" rx="4"
          style={{ fill: 'none', stroke: 'var(--rojo)', strokeWidth: 2.6 }}
        />
        {/* `textLength` fija el ancho pase lo que pase con la fuente cargada. */}
        <text
          x="0" y="0" dy="0.35em"
          textAnchor="middle"
          textLength={46}
          lengthAdjust="spacingAndGlyphs"
          fontSize="10"
          fontWeight="800"
          letterSpacing="0.4"
          style={{ fill: 'var(--rojo)' }}
        >
          VERIFICADO
        </text>
      </g>

      {/* Halo de la marca al asentar (transitorio). */}
      {!reducido && (
        <rect
          className="sa-onda"
          x="-29" y="-10.5" width="58" height="21" rx="5"
          style={{ ...EJE, fill: 'none', stroke: 'var(--rojo)', strokeWidth: 2, transform: MARCA_QUIETA, opacity: 0 }}
        />
      )}

      {/* ── El sello (se retira al final: no existe en el fotograma final) ── */}
      {!reducido && (
        <g className="sa-sello" style={{ ...EJE, opacity: 0 }}>
          <ellipse cx="0" cy="-34" rx="13" ry="7.5" style={{ fill: 'var(--azul-osc)' }} />
          <rect x="-5" y="-34" width="10" height="15" style={{ fill: 'var(--azul-osc)' }} />
          <path d="M -24 -19 L 24 -19 L 28 -7 L -28 -7 Z" style={{ fill: 'var(--azul)' }} strokeLinejoin="round" />
          <rect x="-28" y="-7" width="56" height="7" rx="2.5" style={{ fill: 'var(--rojo)' }} />
        </g>
      )}
    </svg>
  );
}
