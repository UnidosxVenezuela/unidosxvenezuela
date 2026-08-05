'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate, createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, lin, Chispa } from './estilo';

/**
 * «Cohete» — despega dejando estela cuando algo sale a difusión.
 *
 * ACABADO: el fuselaje lleva degradado vertical y una franja de sombra en el
 * costado derecho (lo hace cilíndrico, no plano); la ventanilla es cristal con
 * doble brillo; la llama tiene tres capas (externa naranja, media amarilla, núcleo
 * blanco) que es lo que hace que parezca fuego y no un triángulo.
 */

const U = 'cohete';

export default function CoheteDifusion({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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

      const llama = uno<SVGGElement>('.co-llama');
      if (llama) {
        vivos.push(animate(llama, { scaleY: [0.8, 1.25], scaleX: [1.08, 0.92], duration: 90, loop: 22, alternate: true, ease: 'inOutQuad' }));
      }
      const cohete = uno<SVGGElement>('.co-cohete');
      if (cohete) {
        // Temblor de encendido antes de soltar.
        tl.add(cohete, { translateX: [{ to: -1.2, duration: 55 }, { to: 1.2, duration: 55 }], loop: 6, ease: 'inOutQuad' }, 120);
        tl.add(cohete, { translateY: [0, 5], duration: 220, ease: 'inQuad' }, 760);   // se agacha
        // Sube y se QUEDA arriba, pequeño. Si se va del todo, el último fotograma
        // queda en blanco y la celebración se siente rota: siempre tiene que
        // haber un remate que permanezca.
        tl.add(cohete, { translateY: -40, scale: [1, 0.62], duration: 1000, ease: 'outCubic' }, 1000);
      }
      // Estela que queda marcando el recorrido.
      const estela = uno<SVGPathElement>('.co-estela');
      if (estela) tl.add(estela, { opacity: [0, 0.5], scaleY: [0.2, 1], duration: 800, ease: 'outQuad' }, 1100);
      // Rótulo del remate.
      const rot = uno<SVGGElement>('.co-rotulo');
      if (rot) tl.add(rot, { opacity: [0, 1], translateY: [10, 0], duration: 460, ease: 'outBack' }, 1600);
      if (llama) tl.add(llama, { opacity: [0, 1], scaleY: [0.2, 1], duration: 240 }, 640);

      const humo = todos<SVGCircleElement>('.co-humo');
      humo.forEach((c, i) => {
        tl.add(c, {
          opacity: [0.5, 0], scale: [0.4, 2.4], translateY: [0, 8], translateX: (i % 2 ? 1 : -1) * (6 + i * 2),
          duration: 900, delay: i * 60, ease: 'outQuad',
        }, 980);
      });
      todos<SVGGElement>('.co-estrella').forEach((g, i) => {
        tl.add(g, { opacity: [0, 0.9, 0], scale: [0.4, 1.2], duration: 700, delay: i * 90 }, 1150);
      });
      tl.add(raiz, { opacity: 1, duration: 500 }, 2300);
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
      <DefsCelebracion u={U} tonos={['rojo', 'azul', 'metal', 'blanco', 'amarillo', 'naranja']} />

      {/* Estrellas de fondo */}
      {!reducido && [[-32, -34], [30, -26], [-24, -12], [36, -44], [18, -50]].map(([x, y], i) => (
        <g className="co-estrella" key={i} opacity="0" transform={`translate(${x},${y})`}>
          <Chispa r={i % 2 ? 3.2 : 2.2} color={P.amarillo.luz} />
        </g>
      ))}

      {/* Humo del despegue */}
      {!reducido && Array.from({ length: 6 }, (_, i) => (
        <circle className="co-humo" key={i} cx={i % 2 ? 4 : -4} cy="34" r="4.6" fill={P.metal.luz} opacity="0" />
      ))}
      <path d="M -46 38 H 46" stroke="var(--borde-f)" strokeWidth="2.6" strokeLinecap="round" opacity="0.7" />

      {/* Estela del recorrido: queda dibujada tras el despegue */}
      <path className="co-estela" d="M 0 34 V -8" stroke={P.amarillo.luz} strokeWidth="3.4"
        strokeLinecap="round" opacity={reducido ? 0.5 : 0} strokeDasharray="5 6"
        style={{ transformOrigin: '60px 94px' }} />

      <g className="co-cohete" transform={reducido ? 'translate(0,-40) scale(0.62)' : undefined}
        style={{ transformOrigin: '60px 60px' }}>
        {/* Llama: tres capas */}
        <g className="co-llama" opacity={reducido ? 1 : 0} style={{ transformOrigin: '60px 84px' }}>
          <path d="M -7.4 24 Q 0 46 7.4 24 Q 0 30 -7.4 24 Z" fill={P.naranja.base} opacity="0.9" />
          <path d="M -5 24 Q 0 39 5 24 Q 0 28.4 -5 24 Z" fill={P.amarillo.base} />
          <path d="M -2.6 24 Q 0 32.6 2.6 24 Q 0 26.4 -2.6 24 Z" fill="#FFF6D0" />
        </g>
        {/* Aletas */}
        <path d="M -6.4 12 L -14 25 L -6.4 23 Z" fill={vol('rojo', U)} />
        <path d="M 6.4 12 L 14 25 L 6.4 23 Z" fill={P.rojo.sombra} />
        {/* Fuselaje */}
        <path d="M 0 -26 Q 9.4 -10 9.4 12 Q 9.4 22 0 24 Q -9.4 22 -9.4 12 Q -9.4 -10 0 -26 Z" fill={lin('blanco', U)} />
        {/* Franja de sombra lateral: lo hace cilíndrico */}
        <path d="M 4.4 -19 Q 9.4 -8 9.4 12 Q 9.4 21 3.6 23.4 Q 6.6 14 6.4 4 Q 6.2 -8 4.4 -19 Z" fill={P.blanco.sombra} opacity="0.85" />
        <path d="M -5.2 -14 Q -7.4 -2 -7 14" fill="none" stroke="#fff" strokeWidth="2.2" opacity="0.75" strokeLinecap="round" />
        {/* Morro */}
        <path d="M 0 -26 Q 6.6 -18 8 -10 Q 0 -13 -8 -10 Q -6.6 -18 0 -26 Z" fill={vol('rojo', U)} />
        {/* Ventanilla */}
        <circle cx="0" cy="0" r="5.6" fill={P.metal.sombra} />
        <circle cx="0" cy="0" r="4.4" fill={vol('azul', U)} />
        <ellipse cx="-1.5" cy="-1.6" rx="1.8" ry="1.2" fill="#fff" opacity="0.8" transform="rotate(-30 -1.5 -1.6)" />
        <circle cx="1.8" cy="1.6" r="0.7" fill="#fff" opacity="0.6" />
        {/* Banda inferior */}
        <path d="M -8.8 15 Q 0 17.4 8.8 15 L 8.4 19 Q 0 21.4 -8.4 19 Z" fill={vol('rojo', U)} />
      </g>

      {/* Remate que permanece */}
      <g className="co-rotulo" opacity={reducido ? 1 : 0}>
        <rect x="-38" y="20" width="76" height="15.4" rx="7.7" fill={P.azul.sombra} opacity="0.32" transform="translate(0,1.4)" />
        <rect x="-38" y="20" width="76" height="15.4" rx="7.7" fill={vol('azul', U)} />
        <path d="M -33 23.4 H 33" stroke="#fff" strokeWidth="1.2" opacity="0.4" strokeLinecap="round" />
        <text x="0" y="28.2" textAnchor="middle" dominantBaseline="central" fontSize="8.2" fontWeight="800"
          fill="#fff">Ya está en difusión</text>
      </g>
    </svg>
  );
}
