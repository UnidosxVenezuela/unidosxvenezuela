'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, lin, SombraSuelo, Chispa } from './estilo';

/**
 * «Caja entregada» — la caja de ayuda baja, toca el suelo, se abren las solapas y
 * sale luz y confeti.
 *
 * Es el ÚNICO momento del flujo que de verdad cambia la vida de alguien, así que
 * es de los remates más grandes. Lleva la bandera en el costado: lo que se entrega
 * lo entrega esta gente.
 *
 * ACABADO: cartón con degradado y arista lateral más oscura (da el volumen del
 * prisma), cinta de embalaje con brillo, resplandor difuminado al abrirse, y
 * sombra de suelo que se ACHICA al caer — es lo que vende el peso.
 */

const U = 'caja';

const CONF = Array.from({ length: 12 }, (_, i) => {
  const ang = -Math.PI / 2 + (i / 11 - 0.5) * 2.1;
  return {
    x: +(Math.cos(ang) * (24 + (i % 3) * 7)).toFixed(1),
    y: +(Math.sin(ang) * (26 + (i % 4) * 6)).toFixed(1),
    color: [P.amarillo.base, P.azul.base, P.rojo.base, P.verde.luz][i % 4],
    r: i % 3 === 0 ? 3.2 : 2.4,
  };
});

export default function CajaEntregada({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    if (reducido || !raiz) return;
    const uno = <T extends SVGElement>(s: string) => raiz.querySelector<T>(s);
    const todos = <T extends SVGElement>(s: string) => Array.from(raiz.querySelectorAll<T>(s));
    const vivos: { revert: () => void }[] = [];

    try {
      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      const caja = uno<SVGGElement>('.cj-caja');
      const sombra = uno<SVGEllipseElement>('.cj-sombra');
      if (caja) {
        tl.add(caja, { translateY: [-52, 0], opacity: [0, 1], duration: 620, ease: 'inQuad' }, 0);
        // Aplaste al aterrizar: el peso se ve en la deformación, no en la caída.
        tl.add(caja, { scaleX: 1.13, scaleY: 0.86, duration: 90 }, 620);
        tl.add(caja, { scaleX: 1, scaleY: 1, duration: 380, ease: 'outBounce' }, 710);
      }
      if (sombra) {
        // La sombra crece a la vez que la caja se acerca: es lo que da la altura.
        tl.add(sombra, { rx: [8, 22], opacity: [0.1, 0.28], duration: 620, ease: 'inQuad' }, 0);
      }
      // Solapas
      const izq = uno<SVGGElement>('.cj-solapa-izq');
      const der = uno<SVGGElement>('.cj-solapa-der');
      if (izq) tl.add(izq, { rotate: [0, -118], duration: 420, ease: 'outBack' }, 900);
      if (der) tl.add(der, { rotate: [0, 118], duration: 420, ease: 'outBack' }, 940);
      // Luz que sale
      const luz = uno<SVGGElement>('.cj-luz');
      if (luz) {
        tl.add(luz, { opacity: [0, 0.85], scale: [0.4, 1.25], duration: 420, ease: 'outQuad' }, 1080);
        tl.add(luz, { opacity: 0.35, scale: 1, duration: 700 }, 1520);
      }
      // Corazón que sube
      const cora = uno<SVGGElement>('.cj-corazon');
      if (cora) {
        tl.add(cora, { opacity: [0, 1], translateY: [4, -18], scale: [0.4, 1], duration: 620, ease: 'outBack' }, 1120);
      }
      todos<SVGGElement>('.cj-conf').forEach((g, i) => {
        const c = CONF[i];
        if (!c) return;
        tl.add(g, {
          translateX: c.x, translateY: c.y, rotate: i % 2 ? 200 : -180,
          opacity: [1, 0], scale: [1.1, 0.4], duration: 1000, delay: i * 22, ease: 'outCubic',
        }, 1120);
      });
      tl.add(raiz, { opacity: 1, duration: 600 }, 2500);
    } catch {
      vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } });
      finRef.current();
      return;
    }
    return () => { vivos.forEach((a) => { try { a.revert(); } catch { /* nada */ } }); };
  }, [reducido]);

  return (
    <svg
      ref={raizRef} width={size} height={size} viewBox="-60 -60 120 120"
      preserveAspectRatio="xMidYMid meet"
      className={'cel-svg' + (reducido ? ' cel-svg-quieto' : '')}
      style={{ maxWidth: '100%', height: 'auto' }} aria-hidden="true" focusable="false"
    >
      <DefsCelebracion u={U} tonos={['madera', 'amarillo', 'azul', 'rojo', 'crema']} />
      <defs>
        <radialGradient id={`luz-${U}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF6C8" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#FFD75E" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FFD75E" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d="M -50 33 H 50" stroke="var(--borde-f)" strokeWidth="2.6" strokeLinecap="round" opacity="0.7" />
      <ellipse className="cj-sombra" cx="0" cy="33" rx={reducido ? 22 : 8} ry="4" fill="#0B1220"
        opacity={reducido ? 0.28 : 0.1} filter={`url(#sombra-${U})`} />

      {/* Resplandor y confeti van DETRÁS de la caja */}
      <g className="cj-luz" opacity={reducido ? 0.35 : 0} style={{ transformOrigin: '60px 54px' }}>
        <circle cx="0" cy="-6" r="30" fill={`url(#luz-${U})`} />
      </g>
      <g transform="translate(0,-8)">
        {!reducido && CONF.map((c, i) => (
          <g className="cj-conf" key={i} opacity="0"><Chispa r={c.r} color={c.color} /></g>
        ))}
      </g>

      <g className="cj-caja" style={{ transformOrigin: '60px 93px' }} opacity={reducido ? 1 : 0}>
        {/* Solapas abiertas (por detrás del cuerpo) */}
        <g className="cj-solapa-izq" style={{ transformOrigin: '42px 68px' }}
          transform={reducido ? 'rotate(-118 -18 8)' : undefined}>
          <path d="M -18 8 L -18 2 L 0 2 L 0 8 Z" fill={P.madera.sombra} />
          <path d="M -18 8 L -18 2 L 0 2 L 0 8 Z" fill={lin('madera', U)} opacity="0.85" />
        </g>
        <g className="cj-solapa-der" style={{ transformOrigin: '60px 68px' }}
          transform={reducido ? 'rotate(118 0 8)' : undefined}>
          <path d="M 0 8 L 0 2 L 18 2 L 18 8 Z" fill={P.madera.sombra} />
          <path d="M 0 8 L 0 2 L 18 2 L 18 8 Z" fill={lin('madera', U)} opacity="0.85" />
        </g>

        {/* Cuerpo: frente + costado (el costado más oscuro da el prisma) */}
        <path d="M -18 8 H 12 V 32 H -18 Z" fill={vol('madera', U)} />
        <path d="M 12 8 L 19 3 V 27 L 12 32 Z" fill={P.madera.sombra} />
        <path d="M -18 8 L -11 3 H 19 L 12 8 Z" fill={P.madera.luz} />
        {/* Cinta de embalaje */}
        <rect x="-4" y="8" width="6.6" height="24" fill={P.crema.sombra} opacity="0.75" />
        <rect x="-4" y="8" width="2.4" height="24" fill={P.crema.brillo} opacity="0.5" />
        {/* Bandera en el costado */}
        <g>
          <rect x="-14" y="16" width="17" height="3.4" fill="#F2B417" />
          <rect x="-14" y="19.4" width="17" height="3.4" fill="#1F5FC0" />
          <rect x="-14" y="22.8" width="17" height="3.4" fill="#D62B3C" />
          <rect x="-14" y="16" width="17" height="10.2" fill="none" stroke={P.madera.sombra} strokeWidth="0.7" opacity="0.6" />
        </g>
        {/* Luz de borde superior izquierdo */}
        <path d="M -17 9.4 V 30" stroke="#fff" strokeWidth="1.6" opacity="0.35" strokeLinecap="round" />
      </g>

      {/* Corazón que sale de la caja */}
      <g className="cj-corazon" opacity={reducido ? 1 : 0} transform={reducido ? 'translate(0,-18)' : undefined}
        style={{ transformOrigin: '60px 62px' }}>
        <path d="M 0 6 C -9 -1 -8 -9 -3.4 -9 C -1.2 -9 0 -7.2 0 -6 C 0 -7.2 1.2 -9 3.4 -9 C 8 -9 9 -1 0 6 Z"
          fill={vol('rojo', U)} />
        <ellipse cx="-2.8" cy="-5.4" rx="1.9" ry="1.3" fill="#fff" opacity="0.6" transform="rotate(-28 -2.8 -5.4)" />
      </g>
    </svg>
  );
}
