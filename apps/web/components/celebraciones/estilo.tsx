'use client';
import type { ReactNode } from 'react';

/**
 * ============================================================================
 * SISTEMA DE SOMBREADO de las celebraciones — el «acabado» compartido.
 * ============================================================================
 *
 * POR QUÉ EXISTE. La primera tanda de animaciones se dibujó con rellenos lisos y
 * trazos finos uniformes, y al lado de los vídeos 3D del proyecto se veía a
 * clip-art. La diferencia no era el medio (SVG da de sobra), era el acabado. Este
 * módulo concentra las cinco cosas que separan una ilustración con cuerpo de un
 * dibujo plano, para que cada animación las herede sin repetirlas:
 *
 *   1. VOLUMEN     — degradado radial con la luz arriba a la izquierda, nunca un
 *                    relleno liso. Toda forma redonda lleva su `vol()`.
 *   2. LUZ DE BORDE— un arco claro en el canto opuesto a la luz. Es lo que
 *                    despega la figura del fondo sin recortarla con un trazo.
 *   3. BRILLO      — elipses especulares blancas a baja opacidad en lo lustroso.
 *                    En los ojos, DOS (una grande y una diminuta): es el truco que
 *                    los hace parecer húmedos y vivos.
 *   4. SOMBRA      — elipse difuminada bajo la figura. Sin ella todo flota.
 *   5. CONTORNO    — una silueta más oscura y ligeramente mayor por detrás, en vez
 *                    de un `stroke` de grosor constante. El contorno del dibujo a
 *                    mano varía de grosor; el `stroke` uniforme, no.
 *
 * PALETA. Cada color tiene cuatro tonos (sombra / base / luz / brillo). Usar un
 * solo tono es exactamente lo que aplana una ilustración. Los acentos son
 * deliberados y NO salen de los tokens del tema: un personaje no puede cambiar de
 * color con el tema oscuro o deja de ser el mismo personaje. Lo que sí usa tokens
 * es el ESCENARIO (suelo, textos, fondos), que debe adaptarse.
 *
 * RENDIMIENTO. Los `id` de los `<defs>` van con sufijo por instancia para que dos
 * animaciones en la misma página no se pisen los gradientes. `filter` con
 * `feGaussianBlur` es barato aquí porque las superficies son pequeñas (≤300 px) y
 * se usan pocas veces por escena.
 */

/* ══════════════════════════ Paleta ══════════════════════════ */

export type Tono = { sombra: string; base: string; luz: string; brillo: string };

/** Cuatro tonos por color. `brillo` es el punto especular, casi blanco teñido. */
export const PALETA = {
  azul:     { sombra: '#12305F', base: '#1F5FC0', luz: '#4E93E8', brillo: '#B8D8FF' },
  amarillo: { sombra: '#B87A06', base: '#F2B417', luz: '#FFD75E', brillo: '#FFF1C2' },
  rojo:     { sombra: '#8C1220', base: '#D62B3C', luz: '#F0616F', brillo: '#FFC2C8' },
  verde:    { sombra: '#14603A', base: '#22A05F', luz: '#57D08D', brillo: '#C4F2D9' },
  naranja:  { sombra: '#9E4409', base: '#E87818', luz: '#FFA64D', brillo: '#FFDCB0' },
  morado:   { sombra: '#43206B', base: '#7B45C4', luz: '#A97DE8', brillo: '#DFCCFF' },
  piel:     { sombra: '#B87A4C', base: '#E8A876', luz: '#F7C89C', brillo: '#FFE6CE' },
  pelo:     { sombra: '#241A12', base: '#4A3524', luz: '#6E5138', brillo: '#9A7A5A' },
  madera:   { sombra: '#6B4420', base: '#A6733A', luz: '#C99A5F', brillo: '#E8C79A' },
  metal:    { sombra: '#5E6A7A', base: '#93A2B4', luz: '#C3CEDB', brillo: '#EEF3F9' },
  crema:    { sombra: '#C9B48E', base: '#EFE0C0', luz: '#F9F1DC', brillo: '#FFFCF4' },
  blanco:   { sombra: '#B9C4D4', base: '#E4EAF2', luz: '#F5F8FC', brillo: '#FFFFFF' },
} satisfies Record<string, Tono>;

export type NombreTono = keyof typeof PALETA;

/* ══════════════════════════ Defs compartidos ══════════════════════════ */

/**
 * Bloque `<defs>` con todo el instrumental. Va UNA vez por SVG.
 * `u` es el sufijo único de la instancia (evita choques de id entre animaciones).
 */
export function DefsCelebracion({ u, tonos = [] }: { u: string; tonos?: NombreTono[] }) {
  return (
    <defs>
      {/* Sombra proyectada: sin esto la figura flota. */}
      <filter id={`sombra-${u}`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
      {/* Rubor de mejillas y difuminados suaves. */}
      <filter id={`suave-${u}`} x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="1.7" />
      </filter>
      {/* Resplandor cálido para remates (destellos, auras). */}
      <filter id={`aura-${u}`} x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>

      {/* Un radial por tono pedido: luz arriba-izquierda, sombra abajo-derecha. */}
      {tonos.map((t) => (
        <radialGradient key={t} id={`vol-${t}-${u}`} cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor={PALETA[t].luz} />
          <stop offset="52%" stopColor={PALETA[t].base} />
          <stop offset="100%" stopColor={PALETA[t].sombra} />
        </radialGradient>
      ))}
      {/* Variante plana-vertical, para superficies alargadas (barras, palos). */}
      {tonos.map((t) => (
        <linearGradient key={t + 'l'} id={`lin-${t}-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PALETA[t].luz} />
          <stop offset="55%" stopColor={PALETA[t].base} />
          <stop offset="100%" stopColor={PALETA[t].sombra} />
        </linearGradient>
      ))}

      {/* Brillo especular reutilizable: blanco que se desvanece. */}
      <radialGradient id={`brillo-${u}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** Relleno de volumen (radial) para una forma redonda. */
export const vol = (t: NombreTono, u: string) => `url(#vol-${t}-${u})`;
/** Relleno de volumen (lineal) para una forma alargada. */
export const lin = (t: NombreTono, u: string) => `url(#lin-${t}-${u})`;

/* ══════════════════════════ Piezas reutilizables ══════════════════════════ */

/** Sombra proyectada en el suelo. `y` es la línea de suelo. */
export function SombraSuelo({ u, cx = 0, cy = 32, rx = 22, ry = 4.5, opacidad = 0.26 }: {
  u: string; cx?: number; cy?: number; rx?: number; ry?: number; opacidad?: number;
}) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#0B1220" opacity={opacidad} filter={`url(#sombra-${u})`} />;
}

/**
 * OJO CON VIDA. La diferencia entre un ojo muerto y uno vivo son los DOS brillos
 * y el reflejo inferior: el grande arriba a la izquierda (la fuente de luz) y uno
 * diminuto abajo a la derecha (el rebote). Es el detalle que más se nota.
 */
export function Ojo({ x, y, r = 5, iris = 'azul', mirada = 0, u }: {
  x: number; y: number; r?: number; iris?: NombreTono; mirada?: number; u: string;
}) {
  const p = PALETA[iris];
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse rx={r * 0.92} ry={r} fill="#fff" />
      <ellipse rx={r * 0.92} ry={r} fill="none" stroke={PALETA.pelo.sombra} strokeWidth={r * 0.16} opacity="0.5" />
      <g transform={`translate(${mirada * r * 0.22},${r * 0.06})`}>
        <ellipse rx={r * 0.62} ry={r * 0.7} fill={p.base} />
        <ellipse rx={r * 0.62} ry={r * 0.7} fill={`url(#vol-${iris}-${u})`} opacity="0.9" />
        <ellipse cy={r * 0.16} rx={r * 0.38} ry={r * 0.44} fill={PALETA.pelo.sombra} />
        {/* Rebote inferior: el iris se aclara por debajo. */}
        <ellipse cy={r * 0.42} rx={r * 0.4} ry={r * 0.2} fill={p.luz} opacity="0.55" />
      </g>
      {/* Brillo grande + chispa diminuta. */}
      <ellipse cx={-r * 0.3} cy={-r * 0.36} rx={r * 0.28} ry={r * 0.34} fill="#fff" opacity="0.95" />
      <circle cx={r * 0.3} cy={r * 0.32} r={r * 0.12} fill="#fff" opacity="0.8" />
    </g>
  );
}

/** Rubor difuminado de mejilla. */
export function Rubor({ x, y, u, rx = 3.4, ry = 2.2, color = PALETA.rojo.luz }: {
  x: number; y: number; u: string; rx?: number; ry?: number; color?: string;
}) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={color} opacity="0.45" filter={`url(#suave-${u})`} />;
}

/**
 * Contorno suave: una silueta más oscura y algo mayor DETRÁS de la forma. Da el
 * borde variable del dibujo a mano, que un `stroke` de grosor fijo no da.
 * Se usa envolviendo el contenido: <Contorno d={...}>…</Contorno> no aplica —
 * es más simple duplicar el path con `transform="scale(1.04)"` y color oscuro.
 */
export function Contorno({ children, color = '#101A2B', grosor = 1.6, opacidad = 0.9 }: {
  children: ReactNode; color?: string; grosor?: number; opacidad?: number;
}) {
  return (
    <g>
      <g stroke={color} strokeWidth={grosor} strokeLinejoin="round" strokeLinecap="round" opacity={opacidad} fill="none">
        {children}
      </g>
      {children}
    </g>
  );
}

/** Luz de borde: arco claro en el canto opuesto a la fuente de luz. */
export function LuzBorde({ d, color = '#FFFFFF', ancho = 1.5, opacidad = 0.5 }: {
  d: string; color?: string; ancho?: number; opacidad?: number;
}) {
  return <path d={d} fill="none" stroke={color} strokeWidth={ancho} strokeLinecap="round" opacity={opacidad} />;
}

/** Chispa de cuatro puntas (destello). Más elegante que una estrella de cinco. */
export function Chispa({ x = 0, y = 0, r = 5, color = PALETA.amarillo.luz, opacidad = 1 }: {
  x?: number; y?: number; r?: number; color?: string; opacidad?: number;
}) {
  const d = `M 0 ${-r} Q ${r * 0.17} ${-r * 0.17} ${r} 0 Q ${r * 0.17} ${r * 0.17} 0 ${r} Q ${-r * 0.17} ${r * 0.17} ${-r} 0 Q ${-r * 0.17} ${-r * 0.17} 0 ${-r} Z`;
  return (
    <g transform={`translate(${x},${y})`} opacity={opacidad}>
      <path d={d} fill={color} />
      <circle r={r * 0.2} fill="#fff" opacity="0.9" />
    </g>
  );
}

/** Genera un sufijo estable a partir del nombre de la animación. */
export const sufijo = (nombre: string) => nombre.toLowerCase().replace(/[^a-z0-9]/g, '');
