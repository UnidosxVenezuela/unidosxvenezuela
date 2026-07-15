/**
 * Medalla SVG de una insignia (sin dependencias; apta para Server Components).
 *
 * Estilo E — HITOS únicos: alas radiantes de plumas separadas, aureola de rayos,
 *   aro dorado biselado con gema superior y cristal facetado con el emoji al centro.
 *
 * Estilo D — ESCALERAS con nivel, y cada nivel se distingue de un vistazo por su
 *   silueta y ornamentación (no solo por el color del metal):
 *     · BRONCE — escudo sobrio: marco simple, dos hojas de laurel al pie y 1 estrella.
 *     · PLATA  — escudo con doble marco, media corona de laurel a los lados, cinta con
 *                la cifra y 3 estrellas.
 *     · ORO    — escudo ornado: ráfaga de rayos detrás, laurel completo, alas, corona
 *                con gemas, cinta ahorquillada, 5 estrellas y destellos.
 *
 * Los gradientes llevan ids únicos por instancia (uid) para repetir muchas medallas
 * en la misma página sin que los defs colisionen.
 */

export type NivelInsignia = 'bronce' | 'plata' | 'oro';

type Metal = { hi: string; mid: string; lo: string; edge: string; ray: string; gema: string; gemaLo: string };
const METAL: Record<NivelInsignia, Metal> = {
  bronce: { hi: '#f4d1a1', mid: '#c07d33', lo: '#7c4712', edge: '#5a3208', ray: '#c98a42', gema: '#ffd79a', gemaLo: '#c9791f' },
  plata:  { hi: '#ffffff', mid: '#ccd6e2', lo: '#8996a8', edge: '#5f6b7a', ray: '#c6cfdc', gema: '#c9e6ff', gemaLo: '#3f77cf' },
  oro:    { hi: '#fff2ba', mid: '#f2b31c', lo: '#a9741a', edge: '#7a4e0c', ray: '#ffd23a', gema: '#ffb3c8', gemaLo: '#c2185b' },
};
// Campo (fondo del escudo) por nivel: tierra para bronce, azul acero para plata, vino para oro.
const CAMPO_FIN: Record<NivelInsignia, { hi: string; lo: string; borde: string }> = {
  bronce: { hi: '#9a6631', lo: '#5c3714', borde: '#43270d' },
  plata:  { hi: '#46566f', lo: '#26314b', borde: '#1b2338' },
  oro:    { hi: '#a23a54', lo: '#5a172e', borde: '#43101f' },
};

// ── Geometría base ──
const ESCUDO = 'M38,28 H82 V66 C82,80 72,90 60,98 C48,90 38,80 38,66 Z';
const ALA_E = 'M42,60 C30,38 12,30 2,36 C10,42 16,48 20,54 C8,48 -2,52 0,62 C8,63 16,65 22,69 C10,68 2,74 6,84 C14,84 24,80 30,76 C24,84 24,92 30,96 C38,90 44,78 48,68 Z';
const ALA_D = 'M40,50 C22,40 8,44 5,55 C14,54 21,56 26,60 C12,58 3,64 3,73 C13,71 22,73 28,77 C17,78 10,84 12,90 C24,88 35,80 42,68 Z';
const ESTRELLA5 = 'M0,-9 L2.6,-2.8 L9,-2.8 L3.9,1.6 L5.9,8.5 L0,4.3 L-5.9,8.5 L-3.9,1.6 L-9,-2.8 L-2.6,-2.8 Z';
const ROMBO = 'M0,-6.5 L4.6,0 L0,6.5 L-4.6,0 Z';
const CHISPA = 'M0,-7 L1.7,-1.9 L7,0 L1.7,1.9 L0,7 L-1.7,1.9 L-7,0 L-1.7,-1.9 Z';
const HOJA = 'M0,0 C4,-3.4 9,-3 12,0 C9,3 4,3.4 0,0 Z';
const CORONA = 'M45,26 L48,15 L54,21 L60,11 L66,21 L72,15 L75,26 Z';

/** Ráfaga de N rayos triangulares entre dos radios, centrada en (cx,cy). */
function rayos(cx: number, cy: number, rInt: number, rExt: number, n: number, sesgo = 0.46): string {
  let d = '';
  const paso = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = i * paso - Math.PI / 2;
    const a0 = a - paso * sesgo, a1 = a + paso * sesgo;
    const tx = cx + Math.cos(a) * rExt, ty = cy + Math.sin(a) * rExt;
    const x0 = cx + Math.cos(a0) * rInt, y0 = cy + Math.sin(a0) * rInt;
    const x1 = cx + Math.cos(a1) * rInt, y1 = cy + Math.sin(a1) * rInt;
    d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}Z`;
  }
  return d;
}

/** Hojas de laurel a lo largo de un arco (lado izquierdo; se espeja para el derecho). */
function laurel(r: number, desde: number, hasta: number, n: number, cx = 60, cy = 66) {
  const out: { x: number; y: number; rot: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const g = desde + (hasta - desde) * (i / n);
    const a = (g * Math.PI) / 180;
    out.push({ x: +(cx + Math.cos(a) * r).toFixed(1), y: +(cy + Math.sin(a) * r).toFixed(1), rot: +(g + 96).toFixed(1) });
  }
  return out;
}
const RAYOS_ORO = rayos(60, 60, 24, 55, 24);
const RAYOS_ORO2 = rayos(60, 60, 22, 44, 24, 0.28);
const RAYOS_PLATA = rayos(60, 60, 26, 43, 20, 0.3);
const LAUREL_EXT = laurel(35, 118, 214, 8);
const LAUREL_INT = laurel(28.5, 122, 206, 6);

type Props = {
  uid: string;
  estilo: 'E' | 'D';
  nivel?: NivelInsignia | null;
  icono?: string | null;
  /** Cifra de la escalera ("10", "50h"): va en la cinta (plata/oro) o placa (bronce). */
  texto?: string | null;
  size?: number;
  title?: string;
  apagada?: boolean;
};

export default function MedallaInsignia({ uid, estilo, nivel, icono, texto, size = 44, title, apagada = false }: Props) {
  const p = 'mi' + uid.replace(/[^a-zA-Z0-9]/g, '');
  const estiloSvg = apagada ? { filter: 'grayscale(1)', opacity: 0.35 } : undefined;

  if (estilo === 'D') {
    const nv = (nivel ?? 'bronce') as NivelInsignia;
    const m = METAL[nv];
    const c = CAMPO_FIN[nv];
    const esPlata = nv === 'plata', esOro = nv === 'oro';
    const conLaurel = esPlata || esOro;
    const conCinta = esPlata || esOro;
    const estrellas = esOro ? 5 : esPlata ? 3 : 1;
    const fs = texto ? (texto.length > 3 ? 7 : texto.length > 2 ? 8.5 : 10) : 0;

    // Estrellas dentro del escudo (fila superior curva); más nivel → más estrellas.
    const anchoEstrellas = esOro ? 30 : 22;
    const escalaEstrella = estrellas === 1 ? 0.9 : esOro ? 0.54 : 0.62;
    const estrellasArr = Array.from({ length: estrellas }, (_, i) => {
      const t = estrellas === 1 ? 0.5 : i / (estrellas - 1);
      const x = 60 - anchoEstrellas / 2 + t * anchoEstrellas;
      const y = 43.5 - Math.sin(t * Math.PI) * 3;
      return { x, y };
    });

    return (
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={title} style={estiloSvg} focusable="false">
        {title ? <title>{title}</title> : null}
        <defs>
          <linearGradient id={`${p}m`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={m.hi} /><stop offset=".28" stopColor={m.mid} />
            <stop offset=".55" stopColor={m.hi} stopOpacity=".65" /><stop offset="1" stopColor={m.lo} />
          </linearGradient>
          <linearGradient id={`${p}c`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.hi} /><stop offset="1" stopColor={c.lo} />
          </linearGradient>
          <radialGradient id={`${p}g`} cx=".4" cy=".3" r=".9">
            <stop offset="0" stopColor={m.gema} /><stop offset="1" stopColor={m.gemaLo} />
          </radialGradient>
          <radialGradient id={`${p}ry`} cx=".5" cy=".5" r=".5">
            <stop offset=".5" stopColor={m.ray} stopOpacity="0" /><stop offset="1" stopColor={m.ray} stopOpacity=".9" />
          </radialGradient>
          <linearGradient id={`${p}lau`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5f8f43" /><stop offset="1" stopColor="#356024" />
          </linearGradient>
        </defs>

        <ellipse cx="60" cy="110" rx="31" ry="4.5" fill="#1f2937" opacity=".14" />

        {/* Ráfaga de rayos detrás (oro fuerte, plata sutil) */}
        {esOro && <>
          <path d={RAYOS_ORO} fill={`url(#${p}ry)`} opacity=".95" />
          <path d={RAYOS_ORO2} fill={m.hi} opacity=".55" />
        </>}
        {esPlata && <path d={RAYOS_PLATA} fill={`url(#${p}ry)`} opacity=".6" />}

        {/* Corona sobre el escudo (solo oro) */}
        {esOro && <g transform="translate(0 -2.5)">
          <path d={CORONA} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="60" cy="11" r="2.4" fill={`url(#${p}g)`} stroke={m.edge} strokeWidth=".7" />
          <circle cx="48" cy="15" r="1.6" fill={`url(#${p}g)`} /><circle cx="72" cy="15" r="1.6" fill={`url(#${p}g)`} />
        </g>}

        {/* Alas (solo oro) */}
        {esOro && <>
          <path d={ALA_D} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.5" />
          <path d={ALA_D} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.5" transform="translate(120 0) scale(-1 1)" />
        </>}

        {/* Laurel a los lados (plata media guirnalda, oro completa) */}
        {conLaurel && [LAUREL_EXT, ...(esOro ? [LAUREL_INT] : [])].map((set, si) => (
          <g key={si}>
            {set.map((h, i) => <path key={'l' + i} d={HOJA} fill={`url(#${p}lau)`} stroke="#2c4c1c" strokeWidth=".5"
              transform={`translate(${h.x} ${h.y}) rotate(${h.rot}) scale(.62)`} />)}
            {set.map((h, i) => <path key={'r' + i} d={HOJA} fill={`url(#${p}lau)`} stroke="#2c4c1c" strokeWidth=".5"
              transform={`translate(${(120 - h.x).toFixed(1)} ${h.y}) rotate(${(180 - h.rot).toFixed(1)}) scale(.62)`} />)}
          </g>
        ))}

        {/* Escudo: marco exterior + (plata/oro) doble marco + campo + filete */}
        <path d={ESCUDO} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="2.4" transform="translate(60 63) scale(1.2) translate(-60 -63)" />
        {esPlata || esOro
          ? <path d={ESCUDO} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.4" transform="translate(60 63) scale(1.08) translate(-60 -63)" />
          : null}
        <path d={ESCUDO} fill={`url(#${p}c)`} stroke={c.borde} strokeWidth="1.4" />
        {(esPlata || esOro) && <path d={ESCUDO} fill="none" stroke={m.hi} strokeWidth="1.4" opacity=".85" transform="translate(60 63.5) scale(.9) translate(-60 -63.5)" />}

        {/* Estrellas del nivel */}
        {estrellasArr.map((s, i) => (
          <path key={i} d={ESTRELLA5} fill={m.hi} stroke={m.edge} strokeWidth=".5"
            transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) scale(${escalaEstrella})`} />
        ))}

        {/* Medallón central con el emoji de la serie */}
        <circle cx="60" cy="62" r="15" fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.6" />
        <circle cx="60" cy="62" r="11.6" fill="#fbf4e6" stroke={m.lo} strokeWidth=".8" />
        <ellipse cx="55" cy="57" rx="5" ry="2.6" fill="#fff" opacity=".7" transform="rotate(-22 55 57)" />
        {icono ? <text x="60" y="67" fontSize="13" textAnchor="middle" aria-hidden>{icono}</text> : null}

        {/* Gemas laterales (oro) */}
        {esOro && <>
          <path d={ROMBO} fill={`url(#${p}g)`} stroke={m.gemaLo} strokeWidth=".6" transform="translate(38 62)" />
          <path d={ROMBO} fill={`url(#${p}g)`} stroke={m.gemaLo} strokeWidth=".6" transform="translate(82 62)" />
        </>}

        {/* Cinta con la cifra (plata/oro) o placa simple (bronce) */}
        {conCinta ? (
          <g>
            <path d={`M26,${esOro ? 92 : 93} L36,88 L36,101 L24,105 L30,98 Z`} fill={m.lo} stroke={m.edge} strokeWidth=".8" />
            <path d={`M94,${esOro ? 92 : 93} L84,88 L84,101 L96,105 L90,98 Z`} fill={m.lo} stroke={m.edge} strokeWidth=".8" />
            <path d="M35,88 C48,84 72,84 85,88 L85,100 C72,96 48,96 35,100 Z" fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.1" />
            {texto ? <text x="60" y="96.5" fontSize={fs} fontWeight={800} fill="#3f2a12" textAnchor="middle" aria-hidden>{texto}</text> : null}
          </g>
        ) : (
          texto ? <g>
            <rect x="43" y="88" width="34" height="13" rx="2.5" fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1" />
            <text x="60" y="97.4" fontSize={fs} fontWeight={800} fill="#3f2a12" textAnchor="middle" aria-hidden>{texto}</text>
          </g> : (
            /* Bronce sin cifra: dos hojas de laurel al pie */
            <g>
              <path d={HOJA} fill={`url(#${p}lau)`} transform="translate(52 96) rotate(150) scale(.7)" />
              <path d={HOJA} fill={`url(#${p}lau)`} transform="translate(68 96) rotate(30) scale(.7)" />
            </g>
          )
        )}
      </svg>
    );
  }

  // ── Estilo E — hito único ──
  const o = METAL.oro;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={title} style={estiloSvg} focusable="false">
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`${p}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={o.hi} /><stop offset=".5" stopColor={o.mid} /><stop offset="1" stopColor="#b57a10" />
        </linearGradient>
        <radialGradient id={`${p}c`} cx=".4" cy=".3" r=".9">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".5" stopColor="#dcefff" /><stop offset="1" stopColor="#8db4d8" />
        </radialGradient>
        <radialGradient id={`${p}ry`} cx=".5" cy=".5" r=".5">
          <stop offset=".45" stopColor="#ffdf7a" stopOpacity="0" /><stop offset="1" stopColor="#ffce4a" stopOpacity=".85" />
        </radialGradient>
        <radialGradient id={`${p}g`} cx=".4" cy=".3" r=".9">
          <stop offset="0" stopColor="#ffb3c8" /><stop offset="1" stopColor="#c2185b" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="108" rx="30" ry="4.5" fill="#1f2937" opacity=".14" />

      {/* Aureola de rayos */}
      <path d={rayos(60, 60, 24, 50, 20, 0.3)} fill={`url(#${p}ry)`} opacity=".85" />

      {/* Alas de cinco plumas con nervaduras y borde de pluma */}
      <path d={ALA_E} fill={`url(#${p}a)`} stroke={o.edge} strokeWidth="1.6" />
      <path d={ALA_E} fill={`url(#${p}a)`} stroke={o.edge} strokeWidth="1.6" transform="translate(120 0) scale(-1 1)" />
      <path d="M9,39 C17,45 22,50 26,56 M6,61 C14,62 20,64 25,68 M11,81 C17,80 23,78 28,75" fill="none" stroke={o.edge} strokeWidth="1" opacity=".55" />
      <path d="M111,39 C103,45 98,50 94,56 M114,61 C106,62 100,64 95,68 M109,81 C103,80 97,78 92,75" fill="none" stroke={o.edge} strokeWidth="1" opacity=".55" />

      {/* Aro biselado: anillo exterior + filete claro + remaches + gema superior */}
      <circle cx="60" cy="60" r="26.5" fill={`url(#${p}a)`} stroke={o.edge} strokeWidth="2.4" />
      <circle cx="60" cy="60" r="22.8" fill="none" stroke="#fff" strokeWidth="1.3" opacity=".5" />
      {[43, 60, 77].map((x) => <circle key={'t' + x} cx={x} cy={x === 60 ? 34.5 : 43} r="1.4" fill={o.edge} opacity=".8" />)}
      {[43, 77].map((x) => <circle key={'b' + x} cx={x} cy="77" r="1.4" fill={o.edge} opacity=".8" />)}
      <path d={ROMBO} fill={`url(#${p}g)`} stroke="#8a1338" strokeWidth=".7" transform="translate(60 34.5) scale(1.05)" />

      {/* Cristal facetado (octógono + aristas) con el emblema */}
      <circle cx="60" cy="60" r="19" fill={`url(#${p}c)`} stroke="#7ea3c6" strokeWidth="1.2" />
      <path d="M60,41 L73.4,46.6 L79,60 L73.4,73.4 L60,79 L46.6,73.4 L41,60 L46.6,46.6 Z" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".8" />
      <path d="M60,41 L60,79 M41,60 L79,60 M46.6,46.6 L73.4,73.4 M46.6,73.4 L73.4,46.6" stroke="#fff" strokeWidth=".9" opacity=".4" />
      <ellipse cx="53" cy="51" rx="6.5" ry="3.4" fill="#fff" opacity=".75" transform="rotate(-24 53 51)" />
      {icono ? <text x="60" y="66.5" fontSize="17" textAnchor="middle" aria-hidden>{icono}</text> : null}

      {/* Destellos */}
      <path d={CHISPA} fill="#fff" opacity=".95" transform="translate(26 27) scale(1.15)" />
      <path d={CHISPA} fill="#ffe9a3" transform="translate(94 31) scale(.9)" />
      <path d={CHISPA} fill="#fff" opacity=".85" transform="translate(90 92) scale(.75)" />
    </svg>
  );
}
