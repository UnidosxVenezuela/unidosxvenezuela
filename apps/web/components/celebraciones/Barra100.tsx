'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Barra al 100 %»: una barra de progreso corre con el contador, al llegar al
 * final se pone verde, da un latido y estalla en partículas.
 *
 * Momentos que cuenta: `item_cumplido` y comodín (`generico`). Es la más
 * universal del catálogo —todo el mundo ha visto una barra llenarse— y por eso
 * es la que sirve de comodín sobrio cuando toca cualquier otro logro.
 *
 * REGLAS DE GEOMETRÍA (ver el contrato en `lib/celebraciones.ts`):
 *  - `viewBox="-60 -60 120 120"`: el origen es el centro y ahí cae el
 *    `transform-origin` por defecto de SVG.
 *  - Cada elemento animado es HIJO DIRECTO del <svg>, centrado en el origen y
 *    colocado con `translate`. Nunca se anidan transformaciones animadas.
 *  - El relleno NO se hace con `scaleX` (crecería desde el centro hacia los dos
 *    lados): se anima el ATRIBUTO `width` del <rect>, que crece desde su borde
 *    izquierdo. anime.js v4 lo reconoce como atributo SVG y lo escribe con
 *    `setAttribute`, así que el contador puede leerlo para ir en sincronía.
 *  - `.b1-barra` y `.b1-pct` sí son grupos con transformación, pero sus hijos
 *    no llevan ninguna: un solo nivel, sin anidamiento conflictivo.
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

/** Largo útil de la barra (de x=-50 a x=50). */
const ANCHO = 100;
/** Dónde vive el porcentaje y dónde el pie. */
const PCT_Y = -30;
const PIE_Y = 30;

/**
 * Partículas del estallido: repartidas A LO LARGO de la barra (no desde un solo
 * punto), mitad hacia arriba y mitad hacia abajo. Determinista.
 */
const PARTICULAS = Array.from({ length: 16 }, (_, i) => {
  const origen = -44 + (i % 8) * 12.6;
  const arriba = i < 8;
  const dist = 15 + (i % 5) * 5;
  return {
    x0: +origen.toFixed(1),
    x: +(origen + ((i % 3) - 1) * 9).toFixed(1),
    y: +((arriba ? -1 : 1) * dist).toFixed(1),
    giro: i % 2 ? 190 : -160,
    redonda: i % 3 === 2,
    color: ['var(--ok-solido)', 'var(--amarillo)', 'var(--azul)'][i % 3],
  };
});

export default function Barra100({ onFin, reducido, size = 160 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: NO se anima nada. El JSX ya está en su fotograma
    // final (barra llena y verde, «100 %», sin partículas ni onda).
    if (reducido || !raiz) return;

    const barra = raiz.querySelector<SVGGElement>('.b1-barra');
    const relleno = raiz.querySelector<SVGRectElement>('.b1-relleno');
    const verde = raiz.querySelector<SVGRectElement>('.b1-verde');
    const num = raiz.querySelector<SVGTextElement>('.b1-num');
    const ok = raiz.querySelector<SVGTextElement>('.b1-ok');
    const pct = raiz.querySelector<SVGGElement>('.b1-pct');
    const pie = raiz.querySelector<SVGTextElement>('.b1-pie');
    const onda = raiz.querySelector<SVGRectElement>('.b1-onda');
    const particulas = Array.from(raiz.querySelectorAll<SVGGElement>('.b1-particula'));

    let tl: ReturnType<typeof createTimeline> | null = null;
    try {
      const linea = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      tl = linea;

      // 1. Entra la barra vacía con el contador a cero.
      if (barra) linea.add(barra, { opacity: [0, 1], scaleY: [0.55, 1], duration: 320, ease: 'outBack' }, 0);
      if (pct) linea.add(pct, { translateY: PCT_Y, opacity: [0, 1], duration: 300 }, 60);

      // 2. Corre hasta el final. El número se lee del propio `width` para que
      //    nunca vaya por delante ni por detrás de la barra.
      if (relleno) {
        linea.add(relleno, {
          width: [0, ANCHO],
          duration: 1200,
          ease: 'inOutQuad',
          onUpdate: () => {
            if (!num) return;
            const w = parseFloat(relleno.getAttribute('width') ?? '0');
            const p = Number.isFinite(w) ? Math.round((w / ANCHO) * 100) : 0;
            num.textContent = `${Math.max(0, Math.min(100, p))} %`;
          },
        }, 260);
      }

      // 3. Cien por cien: se pone verde y el número cambia con ella.
      if (verde) {
        linea.add(verde, {
          opacity: [0, 1],
          duration: 260,
          onBegin: () => { if (num) num.textContent = '100 %'; },
        }, 1460);
      }
      if (num) linea.add(num, { opacity: 0, duration: 220 }, 1460);
      if (ok) linea.add(ok, { opacity: [0, 1], duration: 220 }, 1460);

      // 4. Golpe de gracia: latido de la barra, onda, estallido y el número que
      //    da el salto. Todo en el mismo cuarto de segundo: es UN solo golpe.
      if (barra) {
        linea.add(barra, { scaleX: 1.05, scaleY: 1.16, duration: 130 }, 1460);
        linea.add(barra, { scaleX: 1, scaleY: 1, duration: 420, ease: 'outElastic' }, 1590);
      }
      // Tope de 1,16: la barra ya mide 100 de ancho en un viewBox de 120, así
      // que pasarse deja el trazo del aro cortado contra el borde.
      if (onda) linea.add(onda, { scale: [1, 1.16], opacity: [0.7, 0], duration: 700 }, 1470);
      particulas.forEach((g, i) => {
        const p = PARTICULAS[i];
        if (!p) return;
        linea.add(g, {
          translateX: [p.x0, p.x],
          translateY: [0, p.y],
          rotate: p.giro,
          scale: [0.6, 1],
          opacity: [1, 0],
          duration: 900,
          delay: i * 16,
          ease: 'outCubic',
        }, 1500);
      });
      if (pct) {
        linea.add(pct, { translateY: PCT_Y, scale: 1.32, duration: 190, ease: 'outBack' }, 1520);
        linea.add(pct, { translateY: PCT_Y, scale: 1, duration: 320 }, 1710);
      }
      if (pie) linea.add(pie, { translateY: [PIE_Y + 4, PIE_Y], opacity: [0, 1], duration: 380, ease: 'outBack' }, 1660);

      // Respiro final para que dé tiempo a leer el mensaje del overlay.
      linea.add(raiz, { opacity: 1, duration: 620 });
    } catch {
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
      {/* Onda del remate (transitoria: no existe en el fotograma final). */}
      {!reducido && (
        <rect
          className="b1-onda"
          x="-50" y="-9" width={ANCHO} height="18" rx="9"
          style={{ ...EJE, fill: 'none', stroke: 'var(--ok-solido)', strokeWidth: 2.2, opacity: 0 }}
        />
      )}

      {/* ── La barra ── (grupo con transformación; sus hijos, sin ninguna) */}
      <g className="b1-barra" style={{ ...EJE, opacity: reducido ? 1 : 0 }}>
        <rect
          x="-50" y="-9" width={ANCHO} height="18" rx="9"
          style={{ fill: 'var(--sup3)', stroke: 'var(--borde)', strokeWidth: 1.4 }}
        />
        {[-25, 0, 25].map((x) => (
          <rect key={x} x={x - 0.6} y="-9" width="1.2" height="18" style={{ fill: 'var(--borde-f)', opacity: 0.75 }} />
        ))}
        <rect
          className="b1-relleno"
          x="-50" y="-9" width={reducido ? ANCHO : 0} height="18" rx="9"
          style={{ fill: 'var(--azul)' }}
        />
        <rect
          className="b1-verde"
          x="-50" y="-9" width={ANCHO} height="18" rx="9"
          style={{ fill: 'var(--ok-solido)', opacity: reducido ? 1 : 0 }}
        />
      </g>

      {/* Partículas (transitorias). */}
      {!reducido && PARTICULAS.map((p, i) => (
        <g className="b1-particula" key={i} style={{ ...EJE, opacity: 0 }}>
          {p.redonda
            ? <circle r="2.8" style={{ fill: p.color }} />
            : <rect x="-2.2" y="-4" width="4.4" height="8" rx="1.3" style={{ fill: p.color }} />}
        </g>
      ))}

      {/* El porcentaje: dos textos superpuestos que se relevan al llegar al 100. */}
      <g className="b1-pct" style={{ ...EJE, transform: `translateY(${PCT_Y}px)`, opacity: reducido ? 1 : 0 }}>
        <text
          className="b1-num"
          x="0" y="0" dy="0.34em" textAnchor="middle"
          fontSize="16" fontWeight="800"
          style={{ fill: 'var(--texto)', opacity: reducido ? 0 : 1 }}
        >
          {reducido ? '100 %' : '0 %'}
        </text>
        <text
          className="b1-ok"
          x="0" y="0" dy="0.34em" textAnchor="middle"
          fontSize="16" fontWeight="800"
          style={{ fill: 'var(--ok-solido)', opacity: reducido ? 1 : 0 }}
        >
          100 %
        </text>
      </g>

      {/* `textLength` fija el ancho pase lo que pase con la fuente cargada. */}
      <text
        className="b1-pie"
        x="0" y="0" dy="0.34em" textAnchor="middle"
        textLength={62} lengthAdjust="spacingAndGlyphs"
        fontSize="9" fontWeight="700" letterSpacing="0.4"
        style={{ ...EJE, fill: 'var(--ok-solido)', transform: `translateY(${PIE_Y}px)`, opacity: reducido ? 1 : 0 }}
      >
        meta cubierta
      </text>
    </svg>
  );
}
