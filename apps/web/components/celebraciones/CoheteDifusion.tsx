'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline, svg } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Cohete»: enciende, se agacha, despega dejando estela, y al llegar arriba
 * suelta ondas de difusión y chispas tricolor.
 *
 * Momento que cuenta: `caso_publicado`. Publicar una solicitud es sacarla del
 * cajón y ponerla donde alguien puede verla; por eso el remate no es el
 * despegue sino las ONDAS que salen del cohete: la señal llegando lejos.
 *
 * REGLAS DE GEOMETRÍA (ver el contrato en `lib/celebraciones.ts`):
 *  - `viewBox="-60 -60 120 120"`: el origen es el centro y ahí cae el
 *    `transform-origin` por defecto de SVG.
 *  - Cada elemento animado es HIJO DIRECTO del <svg>, con el dibujo centrado en
 *    el origen y colocado con `translate`. Nunca se anidan transformaciones
 *    animadas (un padre movido desplaza el centro de giro de sus hijos).
 *  - Por eso la LLAMA no va dentro del cohete: es hermana suya y sigue su
 *    `translateY` con un desfase fijo. Su dibujo arranca en y=0 y cae hacia
 *    abajo, así el `scaleY` la estira sin despegarla del cohete.
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

/** Alturas del cohete a lo largo del vuelo (coordenadas del viewBox). */
const PAD = 34;       // apoyado en la plataforma
const AGACHE = 37;    // se agacha antes de saltar
const MEDIO = -2;     // a media subida (acelerando)
const APICE = -30;    // donde se queda
/** La llama cuelga del cohete a esta distancia fija. */
const LLAMA = 13;

/** Humo del despegue: determinista, esparcido a ras de la plataforma. */
const HUMO = Array.from({ length: 7 }, (_, i) => {
  const lado = i % 2 ? 1 : -1;
  const paso = Math.floor(i / 2) + 1;
  return {
    x: +(lado * (9 + paso * 8)).toFixed(1),
    y: +(44 - paso * 3).toFixed(1),
    r: 4 + (i % 3) * 1.6,
  };
});

/** Chispas tricolor del remate: salen del ápice en todas direcciones. */
const CHISPAS = Array.from({ length: 9 }, (_, i) => {
  const ang = (i / 9) * Math.PI * 2 + 0.3;
  const dist = 20 + (i % 3) * 6;
  return {
    x: +(Math.cos(ang) * dist).toFixed(1),
    y: +(APICE + Math.sin(ang) * dist).toFixed(1),
    color: ['var(--amarillo)', 'var(--azul)', 'var(--rojo)'][i % 3],
  };
});

/** Estrellitas de fondo: estáticas, solo dan cielo. */
const ESTRELLAS = [
  { x: -42, y: -34, r: 1.7 }, { x: 38, y: -44, r: 1.3 },
  { x: -30, y: -50, r: 1.2 }, { x: 45, y: -14, r: 1.6 },
  { x: -48, y: -6, r: 1.2 },
];

export default function CoheteDifusion({ onFin, reducido, size = 160 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: NO se anima nada. El JSX ya está en su fotograma
    // final (cohete arriba, estela entera, sin llama ni humo ni ondas).
    if (reducido || !raiz) return;

    const cohete = raiz.querySelector<SVGGElement>('.co-cohete');
    const llama = raiz.querySelector<SVGGElement>('.co-llama');
    const estela = raiz.querySelector<SVGPathElement>('.co-estela');
    const humo = Array.from(raiz.querySelectorAll<SVGCircleElement>('.co-humo'));
    const ondas = Array.from(raiz.querySelectorAll<SVGCircleElement>('.co-onda'));
    const chispas = Array.from(raiz.querySelectorAll<SVGCircleElement>('.co-chispa'));

    let tl: ReturnType<typeof createTimeline> | null = null;
    try {
      const linea = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      tl = linea;

      // 1. Aparece en la plataforma y se agacha: la pausa antes del salto es lo
      //    que hace que el despegue se sienta como despegue.
      if (cohete) {
        linea.add(cohete, { translateY: [PAD + 12, PAD], opacity: [0, 1], duration: 340, ease: 'outBack' }, 0);
        linea.add(cohete, { translateY: AGACHE, duration: 190, ease: 'inQuad' }, 340);
      }
      // 2. Enciende.
      if (llama) linea.add(llama, { translateY: AGACHE + LLAMA, scaleY: [0, 1], opacity: [0, 1], duration: 200 }, 340);

      // 3. Despegue: acelera (`inQuad`) y frena arriba (`outQuad`).
      if (cohete) {
        linea.add(cohete, { translateY: [AGACHE, MEDIO], duration: 560, ease: 'inQuad' }, 530);
        linea.add(cohete, { translateY: APICE, duration: 520, ease: 'outQuad' }, 1090);
      }
      if (llama) {
        linea.add(llama, { translateY: [AGACHE + LLAMA, MEDIO + LLAMA], scaleY: 1.6, duration: 560, ease: 'inQuad' }, 530);
        linea.add(llama, { translateY: APICE + LLAMA, scaleY: 1.15, duration: 520, ease: 'outQuad' }, 1090);
        linea.add(llama, { translateY: APICE + LLAMA, scaleY: 0.5, opacity: 0.3, duration: 480 }, 1610);
      }
      // La estela se dibuja al ritmo de la subida.
      if (estela) {
        linea.add(svg.createDrawable(estela), { draw: ['0 0', '0 1'], duration: 980, ease: 'outQuad' }, 530);
        linea.add(estela, { opacity: 0.16, duration: 600 }, 2280);
      }

      // 4. Humo en la plataforma.
      humo.forEach((c, i) => {
        const h = HUMO[i];
        if (!h) return;
        linea.add(c, {
          translateX: [0, h.x],
          translateY: [44, h.y],
          scale: [0.35, 1.5],
          opacity: [0.4, 0],
          duration: 900,
          delay: i * 30,
          ease: 'outCubic',
        }, 530);
      });

      // 5. Golpe de gracia: el cohete se planta y suelta las ondas de difusión.
      if (cohete) {
        linea.add(cohete, { translateY: APICE, scale: 1.09, duration: 150 }, 1630);
        linea.add(cohete, { translateY: APICE, scale: 1, duration: 280 }, 1780);
      }
      // Tope de 3,0: con r=9 el aro llega a 27 y, centrado en el ápice (-30),
      // queda a 3 del borde del viewBox. Más y se vería CORTADO por arriba.
      ondas.forEach((c, i) => {
        linea.add(c, {
          translateY: APICE,
          scale: [0.5, 3],
          opacity: [0.6, 0],
          duration: 880,
          delay: i * 160,
        }, 1640);
      });
      chispas.forEach((c, i) => {
        const ch = CHISPAS[i];
        if (!ch) return;
        linea.add(c, {
          translateX: [0, ch.x],
          translateY: [APICE, ch.y],
          scale: [1, 0.4],
          opacity: [1, 0],
          duration: 760,
          delay: i * 28,
          ease: 'outCubic',
        }, 1700);
      });

      // Respiro final para que dé tiempo a leer el mensaje del overlay.
      linea.add(raiz, { opacity: 1, duration: 400 });
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
      {/* Cielo y plataforma: estáticos, sin transformaciones. */}
      {ESTRELLAS.map((e, i) => (
        <circle key={i} cx={e.x} cy={e.y} r={e.r} style={{ fill: 'var(--texto2)', opacity: 0.35 }} />
      ))}
      <path
        d="M -22 49 H 22"
        style={{ fill: 'none', stroke: 'var(--borde-f)', strokeWidth: 2.6 }}
        strokeLinecap="round"
      />

      {/* Estela: sin animar se ve entera (es el fotograma final); con animación,
          `svg.createDrawable` la esconde antes del primer pintado y la traza. */}
      <path
        className="co-estela"
        d="M 0 46 C -3.5 34 3.5 22 0 10 C -3.5 -2 3 -12 0 -22"
        style={{ fill: 'none', stroke: 'var(--azul)', strokeWidth: 3.4, opacity: 0.32 }}
        strokeLinecap="round"
      />

      {/* Humo, ondas y chispas: transitorios, no existen en el fotograma final. */}
      {!reducido && HUMO.map((h, i) => (
        <circle key={i} className="co-humo" r={h.r} style={{ ...EJE, fill: 'var(--texto2)', opacity: 0 }} />
      ))}
      {!reducido && [0, 1, 2].map((i) => (
        <circle
          key={i} className="co-onda" r="9"
          style={{ ...EJE, fill: 'none', stroke: 'var(--azul)', strokeWidth: 2.4, transform: `translateY(${APICE}px)`, opacity: 0 }}
        />
      ))}

      {/* Llama: hermana del cohete (no hija), dibujada de y=0 hacia abajo para
          que `scaleY` la estire sin despegarla de la base. */}
      {!reducido && (
        <g className="co-llama" style={{ ...EJE, transform: `translateY(${PAD + LLAMA}px)`, opacity: 0 }}>
          <path d="M 0 17 C -5.5 10 -6.5 5 -6.5 0 L 6.5 0 C 6.5 5 5.5 10 0 17 Z" style={{ fill: 'var(--amarillo)' }} />
          <path d="M 0 11 C -2.8 7 -3.2 3.5 -3.2 0 L 3.2 0 C 3.2 3.5 2.8 7 0 11 Z" style={{ fill: 'var(--rojo)' }} />
        </g>
      )}

      {/* ── El cohete ── */}
      <g className="co-cohete" style={{ ...EJE, transform: `translateY(${reducido ? APICE : PAD + 12}px)`, opacity: reducido ? 1 : 0 }}>
        <path d="M -9 3 L -16.5 13 L -9 12 Z" style={{ fill: 'var(--azul)' }} strokeLinejoin="round" />
        <path d="M 9 3 L 16.5 13 L 9 12 Z" style={{ fill: 'var(--azul)' }} strokeLinejoin="round" />
        <path
          d="M 0 -20 C 6.5 -12.5 9 -3.5 9 4.5 V 12 H -9 V 4.5 C -9 -3.5 -6.5 -12.5 0 -20 Z"
          style={{ fill: 'var(--sup1)', stroke: 'var(--borde-f)', strokeWidth: 1.6 }}
          strokeLinejoin="round"
        />
        <path
          d="M 0 -20 C 3.6 -16 5.8 -10.8 6.8 -5.5 H -6.8 C -5.8 -10.8 -3.6 -16 0 -20 Z"
          style={{ fill: 'var(--rojo)' }}
          strokeLinejoin="round"
        />
        <circle cx="0" cy="0" r="4.4" style={{ fill: 'var(--azul)' }} />
        <circle cx="0" cy="0" r="4.4" style={{ fill: 'none', stroke: 'var(--borde-f)', strokeWidth: 1.2 }} />
        <rect x="-9" y="6" width="18" height="3.2" style={{ fill: 'var(--amarillo)' }} />
        <rect x="-6" y="12" width="12" height="2.4" rx="1" style={{ fill: 'var(--azul-osc)' }} />
      </g>

      {!reducido && CHISPAS.map((ch, i) => (
        <circle key={i} className="co-chispa" r="2.6" style={{ ...EJE, fill: ch.color, opacity: 0 }} />
      ))}
    </svg>
  );
}
