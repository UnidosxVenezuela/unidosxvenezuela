'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { animate, createTimeline } from 'animejs';
import type { PropsAnimacionCelebracion } from '@/lib/celebraciones';
import { DefsCelebracion, PALETA as P, vol, SombraSuelo, Rubor, Chispa } from './estilo';

/**
 * «Cara de meme» — una cara con satisfacción absurda y un rótulo que rota.
 *
 * ORIGINAL, dibujada de cero. Nada de calcar caras de meme con derechos: la gracia
 * está en la EXAGERACIÓN (ojos desorbitados con las cejas por las nubes, sonrisa
 * de suficiencia torcida), no en reconocer un personaje ajeno.
 *
 * ACABADO: la cara es una esfera con degradado radial, luz de borde inferior
 * (rebote), brillo especular arriba a la izquierda y sombra proyectada. Los ojos
 * llevan párpado superior, iris con volumen y dos brillos. Sin eso, un círculo
 * amarillo con dos puntos es exactamente lo que parece: un emoji plano.
 *
 * El rótulo se elige al montar de una lista de frases, así que la misma animación
 * no dice siempre lo mismo aunque salga dos veces.
 */

const U = 'meme';

const FRASES = [
  'Imparable, pues.',
  'Así se hace.',
  'Tremenda vaina.',
  'Nadie lo dudó.',
  'Puro talento.',
  'Que conste.',
];

export default function CaraMeme({ onFin, reducido, size = 240 }: PropsAnimacionCelebracion) {
  const raizRef = useRef<SVGSVGElement>(null);
  const finRef = useRef(onFin);
  finRef.current = onFin;
  // Se fija UNA vez al montar: no puede cambiar entre fotogramas.
  const [frase] = useState(() => FRASES[Math.floor(Math.random() * FRASES.length)] ?? FRASES[0]);

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    if (reducido || !raiz) return;
    const uno = <T extends SVGElement>(s: string) => raiz.querySelector<T>(s);
    const todos = <T extends SVGElement>(s: string) => Array.from(raiz.querySelectorAll<T>(s));
    const vivos: { revert: () => void }[] = [];

    try {
      const tl = createTimeline({ defaults: { ease: 'outQuad' }, onComplete: () => finRef.current() });
      vivos.push(tl);

      const cara = uno<SVGGElement>('.cm-cara');
      if (cara) {
        tl.add(cara, { scale: [0.2, 1], rotate: [-24, 0], opacity: [0, 1], duration: 620, ease: 'outBack' }, 0);
        // Contoneo de suficiencia.
        tl.add(cara, { rotate: [{ to: 6, duration: 260 }, { to: -5, duration: 300 }, { to: 0, duration: 260 }], ease: 'inOutQuad' }, 1500);
      }
      // Los ojos se abren de golpe (el gag).
      const ojos = uno<SVGGElement>('.cm-ojos');
      if (ojos) {
        tl.add(ojos, { scaleY: [0.15, 1], duration: 200, ease: 'outBack' }, 520);
        tl.add(ojos, { scale: [1, 1.16], duration: 150, ease: 'outQuad' }, 900);
        tl.add(ojos, { scale: 1, duration: 320, ease: 'outBounce' }, 1050);
      }
      // Cejas por las nubes.
      const cejas = uno<SVGGElement>('.cm-cejas');
      if (cejas) tl.add(cejas, { translateY: [3, -2.4], opacity: [0, 1], duration: 300, ease: 'outBack' }, 780);
      // Sonrisa torcida que se estira.
      const boca = uno<SVGPathElement>('.cm-boca');
      if (boca) tl.add(boca, { scaleX: [0.3, 1], opacity: [0, 1], duration: 380, ease: 'outBack' }, 860);
      // Rótulo.
      const rotulo = uno<SVGGElement>('.cm-rotulo');
      if (rotulo) {
        tl.add(rotulo, { translateY: [12, 0], opacity: [0, 1], scale: [0.85, 1], duration: 460, ease: 'outBack' }, 1180);
      }
      todos<SVGGElement>('.cm-chispa').forEach((g, i) => {
        const ang = (i / 8) * Math.PI * 2 + 0.3;
        tl.add(g, {
          translateX: +(Math.cos(ang) * 34).toFixed(1), translateY: +(Math.sin(ang) * 30).toFixed(1),
          scale: [0.3, 1], opacity: [1, 0], rotate: i % 2 ? 140 : -140,
          duration: 900, delay: i * 26, ease: 'outCubic',
        }, 1300);
      });
      tl.add(raiz, { opacity: 1, duration: 500 }, 2500);
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
      <DefsCelebracion u={U} tonos={['amarillo', 'azul', 'rojo', 'pelo']} />
      <defs>
        {/* La cara: radial descentrado + rebote cálido abajo. */}
        <radialGradient id={`piel-${U}`} cx="36%" cy="26%" r="80%">
          <stop offset="0%" stopColor="#FFE47A" />
          <stop offset="45%" stopColor={P.amarillo.base} />
          <stop offset="100%" stopColor="#C98A08" />
        </radialGradient>
      </defs>

      <SombraSuelo u={U} cx={0} cy={34} rx={20} ry={3.6} opacidad={0.22} />

      {!reducido && Array.from({ length: 8 }, (_, i) => (
        <g className="cm-chispa" key={i} opacity="0">
          <Chispa r={i % 2 ? 3.6 : 2.8} color={[P.amarillo.luz, P.azul.luz, P.rojo.luz][i % 3]} />
        </g>
      ))}

      <g className="cm-cara" style={{ transformOrigin: '60px 60px' }}
        transform={reducido ? undefined : 'scale(0.2)'} opacity={reducido ? 1 : 0}>
        {/* Esfera */}
        <circle cx="0" cy="-2" r="27" fill={`url(#piel-${U})`} />
        {/* Luz de borde inferior: el rebote del suelo. Lo que la despega del fondo. */}
        <path d="M -22 10 A 27 27 0 0 0 22 10" fill="none" stroke="#FFF3B8" strokeWidth="2.4" opacity="0.55" strokeLinecap="round" />
        {/* Brillo especular */}
        <ellipse cx="-11" cy="-15" rx="7.6" ry="5.2" fill="#fff" opacity="0.34" transform="rotate(-28 -11 -15)" />

        <Rubor x={-16} y={4} u={U} rx={4.6} ry={2.8} />
        <Rubor x={16} y={4} u={U} rx={4.6} ry={2.8} />

        {/* Cejas por las nubes */}
        <g className="cm-cejas" opacity={reducido ? 1 : 0} transform={reducido ? 'translate(0,-2.4)' : undefined}>
          <path d="M -17 -17.4 q 5.6 -4.6 11.4 -1.4" fill="none" stroke={P.pelo.sombra} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M 5.6 -18.8 q 5.8 -3.2 11.4 1.4" fill="none" stroke={P.pelo.sombra} strokeWidth="2.6" strokeLinecap="round" />
        </g>

        {/* Ojos desorbitados: párpado, iris con volumen y dos brillos */}
        <g className="cm-ojos" style={{ transformOrigin: '60px 55px' }} transform={reducido ? undefined : 'scale(1,0.15)'}>
          {[-10.6, 10.6].map((x, i) => (
            <g key={i} transform={`translate(${x},-5)`}>
              <ellipse rx="8.2" ry="9.4" fill="#fff" />
              <ellipse rx="8.2" ry="9.4" fill="none" stroke={P.pelo.sombra} strokeWidth="1.1" opacity="0.35" />
              <g transform="translate(0,1.6)">
                <circle r="4.6" fill={P.pelo.base} />
                <circle r="4.6" fill={vol('azul', U)} opacity="0.55" />
                <circle r="2.5" fill="#12100E" />
                <ellipse cy="3" rx="2.8" ry="1.3" fill={P.azul.luz} opacity="0.4" />
              </g>
              <ellipse cx="-2.6" cy="-3.6" rx="2.2" ry="2.6" fill="#fff" opacity="0.95" />
              <circle cx="2.6" cy="3.4" r="0.9" fill="#fff" opacity="0.8" />
              {/* Párpado superior: da la mirada, no solo el ojo. */}
              <path d="M -8.2 -5.4 q 8.2 -7.6 16.4 0" fill="none" stroke={P.pelo.sombra} strokeWidth="1.3" opacity="0.45" strokeLinecap="round" />
            </g>
          ))}
        </g>

        {/* Sonrisa torcida de suficiencia */}
        <path className="cm-boca" d="M -12 9.6 Q -2 20.4 13.6 10.4 Q 1 15.6 -12 9.6 Z"
          fill="#3A2410" opacity={reducido ? 1 : 0} style={{ transformOrigin: '60px 74px' }}
          transform={reducido ? undefined : 'scale(0.3,1)'} />
        <path d="M -8 12.6 Q -1 17 9 12.8" fill="#E86A78" opacity="0.75" />
      </g>

      {/* Rótulo */}
      <g className="cm-rotulo" opacity={reducido ? 1 : 0}>
        <rect x="-42" y="30" width="84" height="15.6" rx="7.8" fill={P.azul.sombra} opacity="0.35" transform="translate(0,1.4)" />
        <rect x="-42" y="30" width="84" height="15.6" rx="7.8" fill={vol('azul', U)} />
        <path d="M -37 33.4 H 37" stroke="#fff" strokeWidth="1.3" opacity="0.4" strokeLinecap="round" />
        <text x="0" y="38.4" textAnchor="middle" dominantBaseline="central" fontSize="8.4" fontWeight="800" fill="#fff">{frase}</text>
      </g>
    </svg>
  );
}
