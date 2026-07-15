/**
 * Medalla SVG de una insignia (sin dependencias; apta para Server Components).
 * Estilo E — hitos únicos: alas radiantes, aro dorado biselado y cristal facetado
 *            con el emoji del logro al centro.
 * Estilo D — escaleras: escudo heráldico cuyo metal sube con el nivel
 *            (bronce → plata → oro); el oro además lleva alas, puntas y gemas.
 * Los gradientes llevan ids únicos por instancia (uid) para poder repetir
 * muchas medallas en la misma página sin que los defs colisionen.
 */

export type NivelInsignia = 'bronce' | 'plata' | 'oro';

const METAL: Record<NivelInsignia, { claro: string; medio: string; oscuro: string; borde: string }> = {
  bronce: { claro: '#f0c894', medio: '#b9772e', oscuro: '#8a4f16', borde: '#6e3d0f' },
  plata:  { claro: '#f4f7fb', medio: '#d7dee8', oscuro: '#8d99a8', borde: '#6d7885' },
  oro:    { claro: '#ffeaa6', medio: '#f2b31c', oscuro: '#8a5c10', borde: '#7a4e0c' },
};

// Trazos base (mismo arte que el mockup aprobado)
const ALA_E = 'M42,60 C30,38 12,30 2,36 C10,42 16,48 20,54 C8,48 -2,52 0,62 C8,63 16,65 22,69 C10,68 2,74 6,84 C14,84 24,80 30,76 C24,84 24,92 30,96 C38,90 44,78 48,68 Z';
const ALA_D = 'M36,54 C20,44 8,48 6,58 C14,58 20,60 24,64 C12,62 4,68 4,76 C12,74 20,76 26,80 C16,80 10,86 12,92 C22,90 32,84 38,74 Z';
const ESCUDO = 'M38,26 H82 V66 C82,80 72,90 60,98 C48,90 38,80 38,66 Z';
const ESTRELLA8 = 'M0,-17 L3.4,-3.4 L17,0 L3.4,3.4 L0,17 L-3.4,3.4 L-17,0 L-3.4,-3.4 Z';
const ROMBO = 'M0,-6.5 L5,0 L0,6.5 L-5,0 Z';
const CHISPA = 'M0,-6 L1.6,-1.6 L6,0 L1.6,1.6 L0,6 L-1.6,1.6 L-6,0 L-1.6,-1.6 Z';

type Props = {
  /** Slug único (id de la insignia); da ids estables a los gradientes. */
  uid: string;
  estilo: 'E' | 'D';
  nivel?: NivelInsignia | null;
  /** Emoji del logro (centro del cristal en E; en la barra superior en D). */
  icono?: string | null;
  /** Cifra de la escalera ("10", "50h"): va sobre la estrella del escudo. */
  texto?: string | null;
  size?: number;
  title?: string;
  /** Vitrina: aún no ganada (se pinta en gris). */
  apagada?: boolean;
};

export default function MedallaInsignia({ uid, estilo, nivel, icono, texto, size = 44, title, apagada = false }: Props) {
  const p = 'mi' + uid.replace(/[^a-zA-Z0-9]/g, '');
  const estiloSvg = apagada ? { filter: 'grayscale(1)', opacity: 0.35 } : undefined;

  if (estilo === 'D') {
    const m = METAL[(nivel ?? 'bronce') as NivelInsignia];
    const plataOMas = nivel === 'plata' || nivel === 'oro';
    const oro = nivel === 'oro';
    const fs = texto ? (texto.length > 3 ? 7 : texto.length > 2 ? 8.5 : 10.5) : 0;
    return (
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={title} style={estiloSvg} focusable="false">
        {title ? <title>{title}</title> : null}
        <defs>
          <linearGradient id={`${p}m`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={m.claro} /><stop offset=".5" stopColor={m.medio} /><stop offset="1" stopColor={m.oscuro} />
          </linearGradient>
          <radialGradient id={`${p}v`} cx=".45" cy=".35" r=".85">
            <stop offset="0" stopColor="#c14e66" /><stop offset="1" stopColor="#6e1e33" />
          </radialGradient>
          <radialGradient id={`${p}r`} cx=".4" cy=".3" r=".9">
            <stop offset="0" stopColor="#ffb3c8" /><stop offset="1" stopColor="#c2185b" />
          </radialGradient>
        </defs>
        <ellipse cx="60" cy="109" rx="30" ry="4.5" fill="#1f2937" opacity=".13" />
        {oro && (
          <>
            <path d={ALA_D} fill={`url(#${p}m)`} stroke={m.borde} strokeWidth="1.6" />
            <path d={ALA_D} fill={`url(#${p}m)`} stroke={m.borde} strokeWidth="1.6" transform="translate(120 0) scale(-1 1)" />
          </>
        )}
        {/* Barra superior metálica */}
        <rect x="34" y="13" width="52" height="11" rx="2" fill={`url(#${p}m)`} stroke={m.borde} strokeWidth="1.8" />
        {/* Marco biselado + campo + filete interior */}
        <path d={ESCUDO} fill={`url(#${p}m)`} stroke={m.borde} strokeWidth="2.5" transform="translate(60 62) scale(1.16) translate(-60 -62)" />
        <path d={ESCUDO} fill={`url(#${p}v)`} stroke="#5a1626" strokeWidth="1.5" />
        {plataOMas && <path d={ESCUDO} fill="none" stroke={m.claro} strokeWidth="2" opacity=".9" transform="translate(60 63) scale(.84) translate(-60 -63)" />}
        <ellipse cx="50" cy="38" rx="12" ry="5" fill="#fff" opacity=".28" transform="rotate(-18 50 38)" />
        {/* Emblema de la serie, sobre la estrella */}
        {icono ? <text x="60" y="42" fontSize="11" textAnchor="middle" aria-hidden>{icono}</text> : null}
        {oro && <path d="M38,88 L28,99 L43,96 Z M82,88 L92,99 L77,96 Z" fill={`url(#${p}m)`} stroke={m.borde} strokeWidth="1.6" />}
        {/* Estrella de ocho puntas con la cifra del logro */}
        <g transform="translate(60 62)">
          <path d={ESTRELLA8} fill={`url(#${p}m)`} stroke={m.borde} strokeWidth="1.4" />
          {plataOMas ? (
            <path d={ESTRELLA8} fill={m.claro} transform="rotate(45) scale(.58)" />
          ) : (
            <circle r="7.6" fill={m.claro} />
          )}
          {texto ? (
            <text y="3.6" fontSize={fs} fontWeight={800} fill="#59331b" textAnchor="middle" aria-hidden>{texto}</text>
          ) : null}
        </g>
        {/* Gemas rubí según el nivel */}
        {plataOMas && <path d={ROMBO} fill={`url(#${p}r)`} stroke="#6e1e33" transform="translate(60 88)" />}
        {oro && (
          <>
            <path d={ROMBO} fill={`url(#${p}r)`} stroke="#6e1e33" transform="translate(33.5 58)" />
            <path d={ROMBO} fill={`url(#${p}r)`} stroke="#6e1e33" transform="translate(86.5 58)" />
            <path d={CHISPA} fill="#fff" opacity=".95" transform="translate(26 30)" />
            <path d={CHISPA} fill="#ffe9a3" transform="translate(95 92) scale(.85)" />
          </>
        )}
      </svg>
    );
  }

  // Estilo E — hito único: alas + aro biselado + cristal facetado
  const oroE = METAL.oro;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={title} style={estiloSvg} focusable="false">
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`${p}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={oroE.claro} /><stop offset=".55" stopColor={oroE.medio} /><stop offset="1" stopColor="#b57a10" />
        </linearGradient>
        <radialGradient id={`${p}c`} cx=".4" cy=".3" r=".9">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".55" stopColor="#d7ebfa" /><stop offset="1" stopColor="#8db4d8" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="107" rx="30" ry="4.5" fill="#1f2937" opacity=".13" />
      {/* Alas de cinco plumas con nervaduras */}
      <path d={ALA_E} fill={`url(#${p}a)`} stroke={oroE.oscuro} strokeWidth="1.6" />
      <path d={ALA_E} fill={`url(#${p}a)`} stroke={oroE.oscuro} strokeWidth="1.6" transform="translate(120 0) scale(-1 1)" />
      <path d="M9,39 C17,45 22,50 26,56 M6,61 C14,62 20,64 25,68 M11,81 C17,80 23,78 28,75" fill="none" stroke={oroE.oscuro} strokeWidth="1" opacity=".5" />
      <path d="M111,39 C103,45 98,50 94,56 M114,61 C106,62 100,64 95,68 M109,81 C103,80 97,78 92,75" fill="none" stroke={oroE.oscuro} strokeWidth="1" opacity=".5" />
      {/* Aro dorado biselado: doble anillo + remaches */}
      <circle cx="60" cy="60" r="26" fill={`url(#${p}a)`} stroke={oroE.oscuro} strokeWidth="2.4" />
      <circle cx="60" cy="60" r="22.6" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".45" />
      <circle cx="77" cy="43" r="1.4" fill={oroE.oscuro} opacity=".8" /><circle cx="43" cy="43" r="1.4" fill={oroE.oscuro} opacity=".8" />
      <circle cx="43" cy="77" r="1.4" fill={oroE.oscuro} opacity=".8" /><circle cx="77" cy="77" r="1.4" fill={oroE.oscuro} opacity=".8" />
      {/* Cristal facetado (octógono + aristas) con el emblema */}
      <circle cx="60" cy="60" r="19" fill={`url(#${p}c)`} stroke="#7ea3c6" strokeWidth="1.2" />
      <path d="M60,41 L73.4,46.6 L79,60 L73.4,73.4 L60,79 L46.6,73.4 L41,60 L46.6,46.6 Z" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".8" />
      <path d="M60,41 L60,79 M41,60 L79,60 M46.6,46.6 L73.4,73.4 M46.6,73.4 L73.4,46.6" stroke="#fff" strokeWidth=".9" opacity=".4" />
      <ellipse cx="53" cy="51" rx="6.5" ry="3.4" fill="#fff" opacity=".75" transform="rotate(-24 53 51)" />
      {icono ? <text x="60" y="66.5" fontSize="17" textAnchor="middle" aria-hidden>{icono}</text> : null}
      {/* Destellos */}
      <path d={CHISPA} fill="#fff" opacity=".95" transform="translate(27 26) scale(1.2)" />
      <path d={CHISPA} fill="#ffe9a3" transform="translate(93 30)" />
      <path d={CHISPA} fill="#fff" opacity=".85" transform="translate(88 93) scale(.8)" />
    </svg>
  );
}
