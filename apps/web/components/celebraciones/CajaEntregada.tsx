'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Caja que llega»: una caja de ayuda baja, toca el suelo, se abre y suelta
 * confeti; de dentro sube un corazón que late una vez.
 *
 * Momentos que cuenta: `entrega_completada` e `item_cumplido`. Es EL momento
 * de esta plataforma —el único que de verdad le cambia el día a una familia—,
 * así que la animación busca dignidad, no chiste: la caja pesa (cae acelerando
 * y el suelo lo acusa), se abre despacio, y lo que sale es lo que importa.
 *
 * REGLAS DE GEOMETRÍA (ver el contrato en `lib/celebraciones.ts`):
 *  - `viewBox="-60 -60 120 120"`: el origen es el centro y ahí cae el
 *    `transform-origin` por defecto de SVG.
 *  - Cada elemento animado es HIJO DIRECTO del <svg> y su dibujo está centrado
 *    en el origen; se coloca con `translate`. Nunca se anidan transformaciones
 *    animadas: un padre movido desplaza el centro de giro de sus hijos.
 *  - Las TAPAS son la excepción interesante: su dibujo tiene la BISAGRA en el
 *    origen (no su centro), así el `rotate` gira sobre la bisagra —como una
 *    tapa de verdad— y el `translate` posterior la lleva a la esquina de la caja.
 *  - Todo lo animado nace con `opacity: 0` en el JSX: si anime.js tarda un
 *    fotograma en fijar el estado inicial, no se ve ningún salto.
 */

/* Acentos deliberados: el cartón no es un token porque no cambia con el tema
   (una caja de ayuda es del color que es, y este tono lee bien en claro y en
   oscuro). Todo lo demás sí usa tokens. */
const CARTON = '#c8894a';
const CARTON_OSC = '#9c6733';
const CARTON_CLA = '#ddab72';
/* La sombra de contacto tampoco es un token: `var(--texto)` es casi blanco en
   tema oscuro y la sombra se convertiría en un RESPLANDOR bajo la caja, justo lo
   contrario del peso que buscamos. Con un casi-negro fijo se ve en tema claro y
   se desvanece en el oscuro — que es lo que hace una sombra sobre suelo oscuro.
   El aterrizaje sigue leyéndose por la línea de suelo y por el achatado. */
const SOMBRA = '#0b1020';

/**
 * El `viewBox` está centrado en el origen, así que el `transform-origin` por
 * defecto (el centro del view-box) ES el punto (0,0): toda transformación queda
 * como una matriz pura sobre el origen y el `transform-origin` deja de importar.
 * De eso depende TODA la geometría de este archivo, y a su vez depende de que
 * `transform-box` sea `view-box` — es el valor inicial, pero se declara
 * explícito para no jugárselo a la interpretación del navegador.
 */
const EJE = { transformBox: 'view-box' } as const;

const SUELO_Y = 41;
/** Centro de la caja apoyada (la caja mide 34 de alto → toca el suelo en 39). */
const CAJA_Y = 22;
/** Altura de las bisagras = borde superior de la caja. */
const BISAGRA_Y = CAJA_Y - 17;
/** Cuánto cae desde fuera de cuadro. */
const CAIDA = 95;
/** Apertura de las tapas (grados). Sale con `outBack`, así que pasa un poco. */
const ABIERTA = 118;
/** Dónde se queda el corazón. */
const CORAZON_Y = -22;

const TAPA_I_QUIETA = `translate(-27px, ${BISAGRA_Y}px) rotate(-${ABIERTA}deg)`;
const TAPA_D_QUIETA = `translate(27px, ${BISAGRA_Y}px) rotate(${ABIERTA}deg)`;

/**
 * Confeti en abanico hacia arriba (no en círculo: sale DE la caja, y una caja
 * no escupe hacia abajo). Determinista: nada de azar a nivel de módulo.
 */
const CONFETI = Array.from({ length: 14 }, (_, i) => {
  const ang = -Math.PI / 2 + (i / 13 - 0.5) * 2.5;
  const dist = 30 + (i % 4) * 6;
  return {
    x: +(Math.cos(ang) * dist).toFixed(1),
    y: +(3 + Math.sin(ang) * dist * 0.95).toFixed(1),
    giro: i % 2 ? 210 : -180,
    redondo: i % 4 === 3,
    color: ['var(--amarillo)', 'var(--azul)', 'var(--rojo)', 'var(--ok-solido)'][i % 4],
  };
});

/** Corazón dibujado a mano con dos bezier simétricas, centrado en el origen. */
const CORAZON = 'M 0 8 C -3.6 4 -10.4 0.8 -10.4 -4 C -10.4 -8.4 -6.6 -10.9 -3.3 -9.7'
  + ' C -1.4 -9 -0.4 -7.6 0 -6.3 C 0.4 -7.6 1.4 -9 3.3 -9.7'
  + ' C 6.6 -10.9 10.4 -8.4 10.4 -4 C 10.4 0.8 3.6 4 0 8 Z';

export default function CajaEntregada({ onFin, reducido, size = 160 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: NO se anima nada. El JSX ya está en su fotograma
    // final (caja apoyada y abierta, corazón arriba, sin confeti ni destellos).
    if (reducido || !raiz) return;

    const sombra = raiz.querySelector<SVGEllipseElement>('.ce-sombra');
    const caja = raiz.querySelector<SVGGElement>('.ce-caja');
    const tapaI = raiz.querySelector<SVGGElement>('.ce-tapa-i');
    const tapaD = raiz.querySelector<SVGGElement>('.ce-tapa-d');
    const brillo = raiz.querySelector<SVGEllipseElement>('.ce-brillo');
    const corazon = raiz.querySelector<SVGPathElement>('.ce-corazon');
    const aro = raiz.querySelector<SVGCircleElement>('.ce-aro');
    const confeti = Array.from(raiz.querySelectorAll<SVGGElement>('.ce-confeti'));

    let tl: ReturnType<typeof createTimeline> | null = null;
    try {
      const linea = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      tl = linea;

      // 1. La caja BAJA acelerando (`inQuad`) y la sombra se cierra a la vez:
      //    es lo que hace que se lea como peso y no como un globo.
      if (sombra) linea.add(sombra, { translateY: SUELO_Y, scaleX: [0.35, 0.62], opacity: [0, 0.09], duration: 520 }, 0);
      if (caja) linea.add(caja, { translateY: [CAJA_Y - CAIDA, CAJA_Y], opacity: [0, 1], duration: 540, ease: 'inQuad' }, 0);
      if (tapaI) {
        linea.add(tapaI, {
          translateX: -27, translateY: [BISAGRA_Y - CAIDA, BISAGRA_Y], rotate: 0,
          opacity: [0, 1], duration: 540, ease: 'inQuad',
        }, 0);
      }
      if (tapaD) {
        linea.add(tapaD, {
          translateX: 27, translateY: [BISAGRA_Y - CAIDA, BISAGRA_Y], rotate: 0,
          opacity: [0, 1], duration: 540, ease: 'inQuad',
        }, 0);
      }

      // 2. Toca el suelo: la caja se achata y se recupera. El `translateY` sube
      //    2,4 durante el achatado para que la BASE no se despegue del suelo
      //    (el `scale` actúa desde el centro del dibujo, no desde su base).
      if (caja) {
        linea.add(caja, { scaleY: 0.86, scaleX: 1.09, translateY: CAJA_Y + 2.4, duration: 80 }, 540);
        linea.add(caja, { scaleY: 1, scaleX: 1, translateY: CAJA_Y, duration: 380, ease: 'outBack' }, 620);
      }
      if (sombra) {
        linea.add(sombra, { translateY: SUELO_Y, scaleX: 1.2, opacity: 0.17, duration: 110 }, 540);
        linea.add(sombra, { translateY: SUELO_Y, scaleX: 1, opacity: 0.12, duration: 380 }, 650);
      }

      // 3. Se abre. `outBack` da el pasadito de las tapas de cartón.
      if (tapaI) linea.add(tapaI, { translateX: -27, translateY: BISAGRA_Y, rotate: -ABIERTA, duration: 480, ease: 'outBack' }, 690);
      if (tapaD) linea.add(tapaD, { translateX: 27, translateY: BISAGRA_Y, rotate: ABIERTA, duration: 480, ease: 'outBack' }, 690);

      // 4. Lo que hay dentro se enciende.
      if (brillo) {
        linea.add(brillo, { translateY: BISAGRA_Y, scale: [0.35, 1.3], opacity: [0, 0.75], duration: 240 }, 800);
        linea.add(brillo, { translateY: BISAGRA_Y, scale: 1.7, opacity: 0, duration: 620 }, 1040);
      }

      // 5. Confeti: sale de la boca de la caja, gira y se apaga.
      confeti.forEach((g, i) => {
        const c = CONFETI[i];
        if (!c) return;
        linea.add(g, {
          translateX: [0, c.x],
          translateY: [3, c.y],
          rotate: c.giro,
          scale: [0.5, 1],
          opacity: [1, 0],
          duration: 900,
          delay: i * 24,
          ease: 'outCubic',
        }, 860);
      });

      // 6. Golpe de gracia: sube el corazón y late una vez. Esto es la entrega.
      if (corazon) {
        linea.add(corazon, { translateY: [4, CORAZON_Y], scale: [0.15, 1], opacity: [0, 1], duration: 560, ease: 'outBack' }, 980);
        linea.add(corazon, { translateY: CORAZON_Y, scale: 1.16, duration: 170 }, 1560);
        linea.add(corazon, { translateY: CORAZON_Y, scale: 1, duration: 300 }, 1730);
      }
      if (aro) linea.add(aro, { translateY: CORAZON_Y, scale: [0.45, 2.5], opacity: [0.5, 0], duration: 780 }, 1580);

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
      {/* Suelo: estático, sin transformaciones. */}
      <path
        d={`M -44 ${SUELO_Y} H 44`}
        style={{ fill: 'none', stroke: 'var(--borde-f)', strokeWidth: 2.4, opacity: 0.75 }}
        strokeLinecap="round"
      />
      <ellipse
        className="ce-sombra"
        rx="30" ry="5.5"
        style={{
          ...EJE,
          fill: SOMBRA,
          transform: `translateY(${SUELO_Y}px)`,
          opacity: reducido ? 0.12 : 0,
        }}
      />

      {/* Aro y destello: transitorios, no existen en el fotograma final. */}
      {!reducido && (
        <circle
          className="ce-aro" r="13"
          style={{ ...EJE, fill: 'none', stroke: 'var(--rojo)', strokeWidth: 2.4, transform: `translateY(${CORAZON_Y}px)`, opacity: 0 }}
        />
      )}

      {/* ── La caja ── */}
      <g className="ce-caja" style={{ ...EJE, transform: `translateY(${CAJA_Y}px)`, opacity: reducido ? 1 : 0 }}>
        <rect
          x="-27" y="-17" width="54" height="34" rx="3"
          style={{ fill: CARTON, stroke: CARTON_OSC, strokeWidth: 1.6 }}
        />
        <rect x="-27" y="-7" width="54" height="2.2" style={{ fill: CARTON_OSC, opacity: 0.4 }} />
        {/* Tricolor: esta caja es NUESTRA, se reconoce de un vistazo. */}
        <rect x="-27" y="1" width="18" height="8" style={{ fill: 'var(--amarillo)' }} />
        <rect x="-9" y="1" width="18" height="8" style={{ fill: 'var(--azul)' }} />
        <rect x="9" y="1" width="18" height="8" style={{ fill: 'var(--rojo)' }} />
      </g>

      {/* Destello del interior (transitorio). */}
      {!reducido && (
        <ellipse
          className="ce-brillo" rx="21" ry="6"
          style={{ ...EJE, fill: 'var(--amarillo)', transform: `translateY(${BISAGRA_Y}px)`, opacity: 0 }}
        />
      )}

      {/* ── Las tapas: el dibujo tiene la BISAGRA en el origen (0,0) ──
          Así `rotate` gira sobre la bisagra y el `translate` posterior la lleva
          a su esquina de la caja. Cerrada = 0°, abierta = ±118°. */}
      <g className="ce-tapa-i" style={{ ...EJE, transform: TAPA_I_QUIETA, opacity: reducido ? 1 : 0 }}>
        <rect x="0" y="-6.5" width="27" height="6.5" rx="1.5" style={{ fill: CARTON_CLA, stroke: CARTON_OSC, strokeWidth: 1.4 }} />
      </g>
      <g className="ce-tapa-d" style={{ ...EJE, transform: TAPA_D_QUIETA, opacity: reducido ? 1 : 0 }}>
        <rect x="-27" y="-6.5" width="27" height="6.5" rx="1.5" style={{ fill: CARTON_CLA, stroke: CARTON_OSC, strokeWidth: 1.4 }} />
      </g>

      {/* Confeti (transitorio). */}
      {!reducido && CONFETI.map((c, i) => (
        <g className="ce-confeti" key={i} style={{ ...EJE, opacity: 0 }}>
          {c.redondo
            ? <circle r="3" style={{ fill: c.color }} />
            : <rect x="-2.4" y="-4.4" width="4.8" height="8.8" rx="1.4" style={{ fill: c.color }} />}
        </g>
      ))}

      {/* Lo que iba dentro. */}
      <path
        className="ce-corazon"
        d={CORAZON}
        style={{ ...EJE, fill: 'var(--rojo)', transform: `translateY(${CORAZON_Y}px)`, opacity: reducido ? 1 : 0 }}
      />
    </svg>
  );
}
