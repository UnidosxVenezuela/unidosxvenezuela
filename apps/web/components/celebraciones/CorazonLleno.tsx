'use client';
import { useId, useLayoutEffect, useRef } from 'react';
import { animate, createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';

/**
 * «Corazón que se llena» — un corazón hueco que late, se va llenando y al
 * rebosar suelta gotas y dos ondas con su misma forma.
 *
 * POR QUÉ ESTA: cerrar una entrega es el único momento del flujo que es de
 * verdad emotivo. No hace falta rótulo ni fuegos artificiales: se llena, late y
 * rebosa. Es la más callada del catálogo, y esa es la idea.
 *
 * NOTAS DE MONTAJE
 *  - El RELLENO es un rectángulo con la parte de arriba ondulada que sube
 *    dentro de un `clipPath` con la forma del corazón. Subir un rectángulo es
 *    mucho más barato y estable que animar el `d` de un path.
 *  - La ONDA del líquido es el mismo path desplazándose en bucle: su patrón
 *    mide 44 (dos jorobas), así que un `translateX` de 0 → -44 en bucle empalma
 *    sin costura. Por eso el path es más ancho que el corazón: para que no se
 *    vea el borde al desplazarse.
 *  - Las ONDAS que salen al rebosar son COPIAS del mismo contorno escaladas: no
 *    pesan nada más y se leen como un latido que se propaga, no como un anillo
 *    genérico.
 *  - El latido escala un grupo que NO lleva la traslación de encuadre (esa va en
 *    el padre): si el mismo `<g>` llevara atributo `transform` y anime.js le
 *    animara `scale`, le borraría la colocación (son la misma propiedad).
 *  - Los ids de `clipPath` salen de `useId()`: el panel puede pintar varias
 *    vistas previas en la misma página y dos ids iguales se pisan.
 */

/** Corazón centrado en el origen tras el encuadre (`translate(0,2)`). */
const CORAZON =
  'M 0 30 C -20 12 -36 0 -36 -14 C -36 -27 -25 -34 -15 -34 C -7 -34 -1.5 -29 0 -25 '
  + 'C 1.5 -29 7 -34 15 -34 C 25 -34 36 -27 36 -14 C 36 0 20 12 0 30 Z';

/** Superficie del líquido: 8 jorobas de 22 (patrón de 44) + el cuerpo hacia abajo. */
const OLA =
  'M -88 0 q 11 -5 22 0 q 11 5 22 0 q 11 -5 22 0 q 11 5 22 0 '
  + 'q 11 -5 22 0 q 11 5 22 0 q 11 -5 22 0 q 11 5 22 0 L 88 74 L -88 74 Z';

/** Altura final del líquido: la superficie queda arriba del todo (rebosando). */
const LLENO = -30;
/** Altura inicial: por debajo del corazón, fuera del recorte. */
const VACIO = 68;

/** Gotas que saltan al rebosar: dónde nacen y hacia dónde salen despedidas. */
const GOTAS = [
  { x: -17, y: -27, dx: -9, dy: -15, r: 3.4 },
  { x: 0, y: -31, dx: 1, dy: -18, r: 2.8 },
  { x: 17, y: -27, dx: 9, dy: -15, r: 3.4 },
];

export default function CorazonLleno({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  const uid = useId().replace(/:/g, '');
  const idCorazon = `cr-forma-${uid}`;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    // Movimiento reducido: el SVG ya está en su fotograma final (corazón lleno,
    // ondas y gotas apagadas). No se anima NADA.
    if (reducido || !raiz) return;

    const uno = <T extends SVGElement>(sel: string) => raiz.querySelector<T>(sel);
    const todos = <T extends SVGElement>(sel: string) => Array.from(raiz.querySelectorAll<T>(sel));

    const corazon = uno<SVGGElement>('.cr-corazon');
    const liquido = uno<SVGGElement>('.cr-liquido');
    const ola = uno<SVGGElement>('.cr-ola');
    const ondas = todos<SVGPathElement>('.cr-onda');
    const gotas = todos<SVGCircleElement>('.cr-gota');
    const brillo = uno<SVGPathElement>('.cr-brillo');

    /** Latido: golpe fuerte y golpe flojo, como uno de verdad. */
    const latido = (fuerte: number, flojo: number) => ([
      { to: fuerte, duration: 120 },
      { to: 1, duration: 160 },
      { to: flojo, duration: 100 },
      { to: 1, duration: 200 },
    ]);

    /** Si anime.js falla, el corazón se queda LLENO, nunca a medias. */
    const rescate = () => {
      if (liquido) liquido.setAttribute('transform', `translate(0,${LLENO})`);
    };

    const vivos: { revert: () => void }[] = [];
    try {
      // El vaivén del agua va aparte del guion: es un bucle continuo.
      if (ola) {
        vivos.push(animate(ola, { translateX: [0, -44], duration: 2000, ease: 'linear', loop: true }));
      }

      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      if (corazon) tl.add(corazon, { scale: [0.55, 1], opacity: [0, 1], duration: 320, ease: 'outBack' }, 0);

      // Se llena. Despacio: es lo que hay que mirar.
      if (liquido) tl.add(liquido, { translateY: [VACIO, LLENO], duration: 1500, ease: 'inOutQuad' }, 300);

      // Dos latidos mientras se llena.
      if (corazon) {
        tl.add(corazon, { scale: latido(1.07, 1.035) }, 620);
        tl.add(corazon, { scale: latido(1.08, 1.04) }, 1200);
      }

      // REBOSA: latido grande, ondas y gotas. Es el punto final de la escena.
      if (corazon) {
        tl.add(corazon, {
          scale: [{ to: 1.17, duration: 190, ease: 'outBack' }, { to: 1, duration: 300, ease: 'outQuad' }],
        }, 1800);
      }
      ondas.forEach((o, i) => {
        tl.add(o, {
          scale: [1, 1.55],
          opacity: [{ to: 0.5, duration: 110 }, { to: 0, duration: 690 }],
          duration: 800,
          ease: 'outQuad',
        }, 1830 + i * 220);
      });
      gotas.forEach((g, i) => {
        const d = GOTAS[i];
        if (!d) return;
        tl.add(g, {
          translateX: d.dx,
          translateY: d.dy,
          scale: [0.4, 1],
          opacity: [{ to: 0.95, duration: 140 }, { to: 0, duration: 520 }],
          duration: 660,
          delay: i * 70,
          ease: 'outQuad',
        }, 1850);
      });

      // Un destello del brillo y un último latido suave: se queda lleno y quieto.
      if (brillo) {
        tl.add(brillo, {
          opacity: [{ to: 0.9, duration: 200 }, { to: 0.5, duration: 320 }],
          duration: 520,
          ease: 'inOutQuad',
        }, 2200);
      }
      if (corazon) {
        tl.add(corazon, {
          scale: [{ to: 1.05, duration: 220 }, { to: 1, duration: 300 }], ease: 'inOutQuad',
        }, 2380);
      }

      // Colchón final: que dé tiempo a leer el mensaje del overlay.
      tl.add(raiz, { opacity: 1, duration: 500 }, 2700);
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
        {/* El recorte sigue al corazón cuando late: se aplica en su mismo marco. */}
        <clipPath id={idCorazon}>
          <path d={CORAZON} />
        </clipPath>
      </defs>

      {/* Encuadre: el corazón dibujado va de -34 a 30, así queda centrado. */}
      <g transform="translate(0,2)">
        {/* Ondas del rebose: el mismo contorno, más grande y apagándose. */}
        <path className="cr-onda" d={CORAZON} fill="none" stroke="var(--rojo)" strokeWidth="2.6" opacity="0" />
        <path className="cr-onda" d={CORAZON} fill="none" stroke="var(--rojo)" strokeWidth="2" opacity="0" />

        <g className="cr-corazon">
          {/* Hueco. */}
          <path d={CORAZON} fill="var(--sup2)" />
          {/* Relleno recortado con la forma del corazón. */}
          <g clipPath={`url(#${idCorazon})`}>
            <g className="cr-liquido" transform={`translate(0,${reducido ? LLENO : VACIO})`}>
              <g className="cr-ola">
                <path d={OLA} fill="var(--rojo)" />
              </g>
            </g>
          </g>
          {/* El contorno va DESPUÉS del relleno para que el trazo quede limpio. */}
          <path d={CORAZON} fill="none" stroke="var(--rojo)" strokeWidth="3.4" strokeLinejoin="round" />
          {/* Brillo del lóbulo izquierdo: le da volumen y sirve de remate. */}
          <path
            className="cr-brillo"
            d="M -21 -25 q -6.5 5.5 -5.5 13.5"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>

        {/* Gotas que saltan al rebosar. */}
        {GOTAS.map((d, i) => (
          <g key={i} transform={`translate(${d.x},${d.y})`}>
            <circle className="cr-gota" r={d.r} fill="var(--rojo)" opacity="0" />
          </g>
        ))}
      </g>
    </svg>
  );
}
