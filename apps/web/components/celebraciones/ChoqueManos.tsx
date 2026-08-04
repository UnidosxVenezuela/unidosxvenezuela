'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Choque de manos» — dos manos llegan desde abajo por su propio eje, chocan en
 * el centro y sueltan onda, rayas de impacto y chispas. Remata con un «¡ESO!»
 * de tebeo y una estrella en el punto del choque.
 *
 * POR QUÉ ESTA: es la única del catálogo que dice, sin texto, que esto no lo
 * hace nadie solo. Son DOS manos de DOS personas distintas: dos tonos de piel y
 * dos mangas del tricolor. Nadie choca los cinco consigo mismo.
 *
 * NOTAS DE MONTAJE
 *  - Cada mano va en un `<g>` de COLOCACIÓN con atributo `transform`
 *    (translate + rotate) y DENTRO otro `<g>` que es el que anima anime.js.
 *    Motivo: el atributo `transform` de SVG y la propiedad CSS `transform` son
 *    LA MISMA cosa, así que si anime.js animara el grupo ya colocado le
 *    borraría la colocación de un plumazo.
 *  - La entrada es un `translateY` DENTRO del grupo ya rotado: en ese marco
 *    «abajo» apunta hacia el antebrazo, así que las manos entran deslizándose
 *    por su eje natural. Sale gratis y se lee como dos brazos que se estiran.
 *  - Todo lo que escala (ondas, rayas, chispas, estrella) cuelga de un `<g>`
 *    colocado en el punto de impacto y dibuja alrededor de SU origen local: con
 *    `viewBox="-60 -60 120 120"` el `transform-origin` por defecto cae ahí, así
 *    que escalan desde el choque sin tocar `transform-origin`.
 *  - La mano derecha es la misma pieza con `scale(-1,1)`: un solo dibujo.
 */

/** Acentos deliberados de la ilustración (el resto va con tokens del tema). */
const PIEL_A = '#e9b183';
const PIEL_B = '#a3673d';

/** Punto donde se cruzan las manos: centro de todos los efectos. */
const IMPACTO = 'translate(0,-12)';

/** Chispas del choque. Deterministas: nada de azar a nivel de módulo. */
const CHISPAS = Array.from({ length: 10 }, (_, i) => {
  const ang = ((-180 + i * 36) * Math.PI) / 180;
  // Distancias cortas a propósito: desde (0,-12) la de arriba llega a y = -42 y
  // no se sale del viewBox (el <svg> recorta, y una chispa cortada canta mucho).
  const dist = 22 + (i % 3) * 4;
  return {
    x: +(Math.cos(ang) * dist).toFixed(1),
    y: +(Math.sin(ang) * dist).toFixed(1),
    giro: i % 2 ? 165 : -140,
    redonda: i % 3 === 2,
    color: ['var(--amarillo)', 'var(--rojo)', 'var(--amarillo-osc)'][i % 3],
  };
});

/** Rayas de impacto de tebeo, en grados. */
const RAYAS = [-150, -110, -70, -30, 20, 160];

/** Una mano: dedos detrás, palma encima, manga al final. Se dibuja mirando arriba. */
function Mano({ piel, manga }: { piel: string; manga: string }) {
  return (
    <g stroke="var(--texto)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
      {/* Los dedos van ANTES que la palma: así la palma les tapa la base y no
          hace falta dibujar la unión. */}
      <g fill={piel}>
        <rect x="-10.8" y="-24" width="5.8" height="26" rx="2.9" />
        <rect x="-4.6" y="-26" width="5.8" height="28" rx="2.9" />
        <rect x="1.6" y="-24.5" width="5.8" height="26.5" rx="2.9" />
        <rect x="7.6" y="-19.5" width="5.2" height="22" rx="2.6" />
        {/* Pulgar: mismo rectángulo redondeado, colocado y girado aparte. */}
        <g transform="translate(-11.8,8) rotate(-30)">
          <rect x="-3.3" y="-9.5" width="6.6" height="18" rx="3.3" />
        </g>
        <rect x="-12" y="-7" width="24" height="28" rx="7.5" />
      </g>
      <rect x="-12.6" y="16" width="25.2" height="11.5" rx="3.6" fill={manga} />
      {/* Nudillos: tres marcas suaves para que la palma no sea una pastilla. */}
      <g strokeWidth="1.1" opacity="0.32" fill="none">
        <path d="M -6.4 -1.6 v 3.6" />
        <path d="M 0 -2.6 v 3.6" />
        <path d="M 6.4 -1.6 v 3.6" />
      </g>
    </g>
  );
}

export default function ChoqueManos({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: no se anima NADA. El SVG ya está en su fotograma
    // final (manos juntas, estrella y rótulo visibles, efectos apagados).
    if (reducido || !raiz) return;

    const uno = <T extends SVGElement>(sel: string) => raiz.querySelector<T>(sel);
    const todos = <T extends SVGElement>(sel: string) => Array.from(raiz.querySelectorAll<T>(sel));

    const manos = todos<SVGGElement>('.ch-mano');
    const ondas = todos<SVGCircleElement>('.ch-onda');
    const rayas = todos<SVGPathElement>('.ch-raya');
    const chispas = todos<SVGGElement>('.ch-chispa');
    const estrella = uno<SVGGElement>('.ch-estrella');
    const rotulo = uno<SVGGElement>('.ch-rotulo');

    /** Si anime.js falla, el remate (estrella + rótulo) se pinta igual. */
    const rescate = () => {
      [estrella, rotulo].forEach((el) => { if (el) el.style.opacity = '1'; });
    };

    let tl: ReturnType<typeof createTimeline> | null = null;
    try {
      const linea = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      tl = linea;

      // 1) Las manos entran deslizándose por su propio eje.
      manos.forEach((m, i) => {
        linea.add(m, { translateY: [44, 0], opacity: [0, 1], duration: 380, ease: 'outQuad' }, i * 25);
      });

      // 2) EL CHOQUE: retroceso corto y vuelta con rebote.
      manos.forEach((m) => {
        linea.add(m, {
          translateY: [{ to: 7, duration: 110, ease: 'outQuad' }, { to: 0, duration: 280, ease: 'outBack' }],
        }, 400);
      });

      // 3) Onda expansiva (dos anillos) desde el punto de choque.
      ondas.forEach((o, i) => {
        linea.add(o, {
          scale: [0.25, i ? 3.6 : 2.6],
          opacity: [{ to: i ? 0.45 : 0.85, duration: 90 }, { to: 0, duration: i ? 690 : 530 }],
          duration: i ? 780 : 620,
          ease: 'outQuad',
        }, 410 + i * 120);
      });

      // 4) Rayas de tebeo: salen hacia fuera y se apagan enseguida.
      rayas.forEach((r, i) => {
        linea.add(r, {
          scale: [0.3, 1.2],
          opacity: [{ to: 0.95, duration: 110 }, { to: 0, duration: 330 }],
          duration: 440,
          delay: i * 16,
          ease: 'outQuad',
        }, 420);
      });

      // 5) Chispas: cada una a su sitio, girando y apagándose.
      chispas.forEach((g, i) => {
        const ch = CHISPAS[i];
        if (!ch) return;
        linea.add(g, {
          translateX: ch.x,
          translateY: ch.y,
          rotate: ch.giro,
          scale: [1, 0.4],
          opacity: [{ to: 1, duration: 80 }, { to: 0, duration: 700 }],
          duration: 780,
          delay: i * 18,
          ease: 'outCubic',
        }, 420);
      });

      // 6) El grito de tebeo, justo después del golpe.
      if (rotulo) {
        linea.add(rotulo, {
          opacity: [0, 1], scale: [0.25, 1], rotate: [-26, -8], duration: 420, ease: 'outBack',
        }, 580);
      }

      // 7) REMATE: las manos se separan un pelo, sale la estrella y el rótulo
      //    da un último golpe. Una celebración sin punto final se siente rota.
      manos.forEach((m) => {
        linea.add(m, {
          translateY: [{ to: 4, duration: 280 }, { to: 0, duration: 320 }],
          ease: 'inOutQuad',
        }, 1420);
      });
      if (estrella) {
        linea.add(estrella, { opacity: [0, 1], scale: [0, 1], rotate: [-45, 0], duration: 460, ease: 'outBack' }, 1460);
      }
      if (rotulo) {
        linea.add(rotulo, {
          scale: [{ to: 1.16, duration: 170 }, { to: 1, duration: 230 }], rotate: -8, ease: 'outBack',
        }, 1920);
      }
      if (estrella) {
        linea.add(estrella, {
          scale: [{ to: 1.2, duration: 180 }, { to: 1, duration: 240 }], opacity: 1, ease: 'inOutQuad',
        }, 1940);
      }

      // Colchón final: que dé tiempo a leer el mensaje del overlay.
      linea.add(raiz, { opacity: 1, duration: 700 }, 2320);
    } catch {
      // Nunca dejamos la celebración colgada ni el dibujo a medias.
      rescate();
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
      {/* ── Las dos manos ──────────────────────────────────────────────── */}
      <g transform="translate(-15,13) rotate(20)">
        <g className="ch-mano">
          <Mano piel={PIEL_A} manga="var(--azul)" />
        </g>
      </g>
      <g transform="translate(15,13) rotate(-20)">
        <g className="ch-mano">
          {/* La misma mano, del revés: una sola pieza para las dos. */}
          <g transform="scale(-1,1)">
            <Mano piel={PIEL_B} manga="var(--rojo)" />
          </g>
        </g>
      </g>

      {/* ── Efectos del choque (todo alrededor del punto de impacto) ───── */}
      <g transform={IMPACTO}>
        <circle className="ch-onda" r="12" fill="none" stroke="var(--amarillo)" strokeWidth="3.2" opacity="0" />
        <circle className="ch-onda" r="12" fill="none" stroke="var(--rojo)" strokeWidth="2.2" opacity="0" />

        {RAYAS.map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <path
              className="ch-raya"
              d="M 0 -17 L 0 -26"
              fill="none"
              stroke="var(--amarillo)"
              strokeWidth="3"
              strokeLinecap="round"
              opacity="0"
            />
          </g>
        ))}

        {CHISPAS.map((ch, i) => (
          <g className="ch-chispa" key={i} opacity="0">
            {ch.redonda
              ? <circle r="3.2" fill={ch.color} />
              : <rect x="-2.4" y="-4.6" width="4.8" height="9.2" rx="1.5" fill={ch.color} />}
          </g>
        ))}

        {/* Estrella del remate, justo donde se cruzan las manos. */}
        <g className="ch-estrella" opacity={reducido ? 1 : 0}>
          <path
            d="M 0 -15 Q 2.6 -2.6 15 0 Q 2.6 2.6 0 15 Q -2.6 2.6 -15 0 Q -2.6 -2.6 0 -15 Z"
            fill="var(--amarillo)"
            stroke="var(--amarillo-osc)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </g>
      </g>

      {/* ── El grito ───────────────────────────────────────────────────── */}
      <g transform="translate(30,-34)">
        <g className="ch-rotulo" opacity={reducido ? 1 : 0} transform={reducido ? 'rotate(-8)' : undefined}>
          <text
            x="0"
            y="4.6"
            textAnchor="middle"
            fontSize="15"
            fontWeight="900"
            letterSpacing="0.5"
            fill="var(--amarillo)"
            stroke="var(--texto)"
            strokeWidth="3"
            strokeLinejoin="round"
            style={{ paintOrder: 'stroke' }}
          >
            ¡ESO!
          </text>
        </g>
      </g>
    </svg>
  );
}
