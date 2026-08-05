'use client';
import { useLayoutEffect, useRef } from 'react';
import { createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, lin, SombraSuelo } from './estilo';

/**
 * «Sello aprobado» — el sello cae con fuerza sobre el documento, rebota, y deja
 * la marca VERIFICADO con un poco de polvo de tinta.
 *
 * Es la satisfacción del trámite cerrado: seco, contundente, sin fuegos
 * artificiales. Encaja con Verificación, que es un área de rigor.
 *
 * ACABADO: el documento tiene esquina doblada y sombra propia; el mango del sello
 * es madera con veta y volumen; la marca de tinta va ligeramente girada y con los
 * bordes irregulares (una marca perfecta no parece tinta).
 */

const U = 'sello';

export default function SelloAprobado({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
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

      const doc = uno<SVGGElement>('.se-doc');
      if (doc) tl.add(doc, { opacity: [0, 1], translateY: [8, 0], duration: 380, ease: 'outBack' }, 0);

      // El sello baja con fuerza y rebota dos veces.
      const sello = uno<SVGGElement>('.se-sello');
      if (sello) {
        tl.add(sello, { opacity: [0, 1], translateY: [-46, -30], duration: 260 }, 320);
        tl.add(sello, { translateY: -2, duration: 130, ease: 'inQuad' }, 640);      // golpe
        tl.add(sello, { translateY: -16, duration: 210, ease: 'outQuad' }, 780);
        tl.add(sello, { translateY: -4, duration: 160, ease: 'inQuad' }, 1000);     // rebote
        tl.add(sello, { translateY: -34, duration: 420, ease: 'outCubic' }, 1180);
      }
      // Sacudida del documento al recibir el golpe.
      if (doc) {
        tl.add(doc, { translateY: [0, 2.2], duration: 90, ease: 'outQuad' }, 760);
        tl.add(doc, { translateY: 0, duration: 260, ease: 'outBounce' }, 850);
      }
      // La marca aparece en el golpe.
      const marca = uno<SVGGElement>('.se-marca');
      if (marca) {
        tl.add(marca, { opacity: [0, 1], scale: [1.25, 1], duration: 180, ease: 'outQuad' }, 770);
      }
      // Polvo de tinta.
      todos<SVGCircleElement>('.se-polvo').forEach((c, i) => {
        const ang = (i / 8) * Math.PI * 2;
        tl.add(c, {
          translateX: +(Math.cos(ang) * 17).toFixed(1), translateY: +(Math.sin(ang) * 9 - 3).toFixed(1),
          opacity: [0.75, 0], scale: [1, 0.3], duration: 620, delay: i * 18, ease: 'outQuad',
        }, 780);
      });
      tl.add(raiz, { opacity: 1, duration: 700 }, 2100);
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
      <DefsCelebracion u={U} tonos={['madera', 'rojo', 'metal', 'blanco', 'azul']} />

      <SombraSuelo u={U} cx={0} cy={40} rx={26} ry={4} opacidad={0.18} />

      {/* ── Documento ────────────────────────────────────────────────── */}
      <g className="se-doc" opacity={reducido ? 1 : 0}>
        <rect x="-26" y="-28" width="52" height="66" rx="3" fill={P.metal.sombra} opacity="0.3" transform="translate(1.4,2)" />
        <path d="M -26 -28 H 14 L 26 -16 V 38 H -26 Z" fill={vol('blanco', U)} />
        {/* Esquina doblada: sin esto es un rectángulo, no un papel. */}
        <path d="M 14 -28 L 26 -16 H 14 Z" fill={P.blanco.sombra} />
        <path d="M 14 -28 L 26 -16" stroke={P.metal.base} strokeWidth="0.9" opacity="0.6" />
        {/* Renglones */}
        {[-20, -14, -8, -2].map((y, i) => (
          <rect key={i} x="-19" y={y} width={i === 3 ? 22 : 32} height="2.6" rx="1.3" fill={P.azul.luz} opacity="0.35" />
        ))}
        {[22, 28].map((y, i) => (
          <rect key={i} x="-19" y={y} width={i ? 20 : 30} height="2.4" rx="1.2" fill={P.metal.base} opacity="0.3" />
        ))}
      </g>

      {/* ── Marca de tinta ───────────────────────────────────────────── */}
      <g className="se-marca" opacity={reducido ? 1 : 0} transform="rotate(-9 0 8)" style={{ transformOrigin: '60px 68px' }}>
        <rect x="-23" y="0" width="46" height="17" rx="2.4" fill="none" stroke={P.rojo.base} strokeWidth="2.4" opacity="0.9" />
        <rect x="-20.4" y="2.6" width="40.8" height="11.8" rx="1.4" fill="none" stroke={P.rojo.base} strokeWidth="0.9" opacity="0.7" />
        <text x="0" y="8.8" textAnchor="middle" dominantBaseline="central" fontSize="8.6" fontWeight="900"
          fill={P.rojo.base} letterSpacing="0.4" opacity="0.92">VERIFICADO</text>
      </g>
      {!reducido && Array.from({ length: 8 }, (_, i) => (
        <circle className="se-polvo" key={i} cx="0" cy="8" r={i % 2 ? 1.1 : 0.8} fill={P.rojo.base} opacity="0" />
      ))}

      {/* ── El sello ─────────────────────────────────────────────────── */}
      <g className="se-sello" opacity={reducido ? 0 : 0} transform="translate(0,-46)">
        {/* Mango de madera */}
        <rect x="-7" y="-30" width="14" height="13" rx="6" fill={vol('madera', U)} />
        <path d="M -3.6 -28 V -19" stroke={P.madera.brillo} strokeWidth="1.4" opacity="0.5" strokeLinecap="round" />
        <rect x="-3.4" y="-18" width="6.8" height="9" rx="2" fill={lin('madera', U)} />
        {/* Cuerpo metálico */}
        <rect x="-13" y="-9.5" width="26" height="9" rx="2.6" fill={lin('metal', U)} />
        <path d="M -10 -7.6 H 10" stroke="#fff" strokeWidth="1.4" opacity="0.55" strokeLinecap="round" />
        {/* Almohadilla entintada */}
        <rect x="-15" y="-1" width="30" height="5.4" rx="1.6" fill={P.rojo.sombra} />
        <rect x="-15" y="-1" width="30" height="2.6" rx="1.3" fill={P.rojo.base} />
      </g>
    </svg>
  );
}
