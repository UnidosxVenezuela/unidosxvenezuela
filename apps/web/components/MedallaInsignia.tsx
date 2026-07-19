/**
 * Medalla SVG de una insignia (sin dependencias; apta para Server Components y también
 * usable dentro de componentes cliente porque no toca APIs de servidor).
 *
 * Acabado de alta calidad (bisel, brillo especular, sombra, zafiros) portado del
 * rediseño (Claude Design). Modo `animada`: la medalla se «arma» por capas con un pop
 * escalonado + un brillo; honra `prefers-reduced-motion` desde la propia hoja de estilos.
 *
 * Estilo E — HITOS únicos: alas de plumas, aureola de rayos, aro biselado con gema y
 *   cristal facetado con el emoji al centro.
 * Estilo D — ESCALERAS con nivel (bronce/plata/oro), cada nivel con su silueta:
 *   BRONCE escudo sobrio · PLATA doble marco + media corona + cinta · ORO ornado (rayos,
 *   laurel completo, alas, corona, cinta, 5 estrellas, zafiros).
 *
 * Los gradientes llevan ids únicos por instancia (uid) para repetir muchas medallas en
 * la misma página sin que los defs colisionen.
 */
import type { CSSProperties } from 'react';

export type NivelInsignia = 'bronce' | 'plata' | 'oro';

type Metal = { hi: string; mid: string; lo: string; edge: string; ray: string; gema: string; gemaLo: string };
type Campo = { hi: string; lo: string; borde: string };

const METAL: Record<NivelInsignia, Metal> = {
  bronce: { hi: '#ffdfae', mid: '#b96f24', lo: '#6e3c0c', edge: '#452505', ray: '#d18f45', gema: '#ffd79a', gemaLo: '#c9791f' },
  plata:  { hi: '#ffffff', mid: '#c3cedd', lo: '#7e8ca0', edge: '#4c5867', ray: '#c6cfdc', gema: '#c9e6ff', gemaLo: '#3f77cf' },
  oro:    { hi: '#fff4bb', mid: '#f0ad12', lo: '#9c690f', edge: '#63400a', ray: '#ffd23a', gema: '#9cc4ff', gemaLo: '#1b3fae' },
};
const CAMPO_FIN: Record<NivelInsignia, Campo> = {
  bronce: { hi: '#9a6631', lo: '#5c3714', borde: '#43270d' },
  plata:  { hi: '#46566f', lo: '#26314b', borde: '#1b2338' },
  oro:    { hi: '#a23a54', lo: '#5a172e', borde: '#43101f' },
};
const ESCUDO = 'M38,28 H82 V66 C82,80 72,90 60,98 C48,90 38,80 38,66 Z';
const ALA_E = 'M42,60 C30,38 12,30 2,36 C10,42 16,48 20,54 C8,48 -2,52 0,62 C8,63 16,65 22,69 C10,68 2,74 6,84 C14,84 24,80 30,76 C24,84 24,92 30,96 C38,90 44,78 48,68 Z';
const ALA_D = 'M40,50 C22,40 8,44 5,55 C14,54 21,56 26,60 C12,58 3,64 3,73 C13,71 22,73 28,77 C17,78 10,84 12,90 C24,88 35,80 42,68 Z';
const ESTRELLA5 = 'M0,-9 L2.6,-2.8 L9,-2.8 L3.9,1.6 L5.9,8.5 L0,4.3 L-5.9,8.5 L-3.9,1.6 L-9,-2.8 L-2.6,-2.8 Z';
const ROMBO = 'M0,-6.5 L4.6,0 L0,6.5 L-4.6,0 Z';
const CHISPA = 'M0,-7 L1.7,-1.9 L7,0 L1.7,1.9 L0,7 L-1.7,1.9 L-7,0 L-1.7,-1.9 Z';
const HOJA = 'M0,0 C4,-3.4 9,-3 12,0 C9,3 4,3.4 0,0 Z';
const CORONA = 'M45,26 L48,15 L54,21 L60,11 L66,21 L72,15 L75,26 Z';

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

// CSS de las capas cuando la medalla entra «armándose». Puro CSS → honra reduced-motion.
const cssAnim = (p: string) => `
.${p} .cp{transform-box:fill-box;transform-origin:center;opacity:0;animation:${p}pop .5s cubic-bezier(.2,1.4,.4,1) forwards}
.${p} .cp1{animation-delay:.15s}.${p} .cp2{animation-delay:.35s}.${p} .cp3{animation-delay:.55s}
.${p} .cp4{animation-delay:.75s}.${p} .cp5{animation-delay:.95s}
.${p} .brillo{animation:${p}brillo 1.6s ease .9s}
@keyframes ${p}pop{0%{opacity:0;transform:scale(.2) rotate(-14deg)}60%{opacity:1;transform:scale(1.12) rotate(3deg)}100%{opacity:1;transform:scale(1) rotate(0)}}
@keyframes ${p}brillo{0%,100%{opacity:.7}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.${p} .cp{animation:none;opacity:1}.${p} .brillo{animation:none}}
`;

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
  /** La medalla se «arma» por capas al montarse (para la celebración). */
  animada?: boolean;
};

export default function MedallaInsignia({ uid, estilo, nivel, icono, texto, size = 44, title, apagada = false, animada = false }: Props) {
  const p = 'mi' + String(uid).replace(/[^a-zA-Z0-9]/g, '');
  // El filtro SVG feDropShadow es caro: solo en medallas grandes (celebración/animada).
  const conFiltro = !apagada && (animada || size >= 120);
  const estiloSvg: React.CSSProperties = apagada
    ? { filter: 'grayscale(1)', opacity: 0.35 }
    : { filter: 'drop-shadow(0 2px 3px rgba(15,23,42,.28))' };
  const fSombra = (pid: string) => (conFiltro ? `url(#${pid}sf)` : undefined);
  const k = (i: number) => (animada ? 'cp cp' + i : undefined);

  const Defs = ({ m, c }: { m: Metal; c: Campo | null }) => (
    <defs>
      <linearGradient id={`${p}m`} x1="0" y1="0" x2=".22" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".92" />
        <stop offset=".1" stopColor={m.hi} />
        <stop offset=".28" stopColor={m.mid} />
        <stop offset=".46" stopColor={m.hi} />
        <stop offset=".58" stopColor={m.mid} />
        <stop offset=".82" stopColor={m.lo} />
        <stop offset="1" stopColor={m.edge} />
      </linearGradient>
      {c ? <linearGradient id={`${p}c`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={c.hi} /><stop offset="1" stopColor={c.lo} />
      </linearGradient> : null}
      <radialGradient id={`${p}g`} cx=".4" cy=".3" r=".9">
        <stop offset="0" stopColor={m.gema} /><stop offset="1" stopColor={m.gemaLo} />
      </radialGradient>
      <radialGradient id={`${p}zaf`} cx=".35" cy=".28" r=".95">
        <stop offset="0" stopColor="#e6f3ff" /><stop offset=".35" stopColor="#5ea0ff" /><stop offset=".8" stopColor="#1b3fae" /><stop offset="1" stopColor="#0c2270" />
      </radialGradient>
      <radialGradient id={`${p}ry`} cx=".5" cy=".5" r=".5">
        <stop offset=".5" stopColor={m.ray} stopOpacity="0" /><stop offset="1" stopColor={m.ray} stopOpacity=".95" />
      </radialGradient>
      <linearGradient id={`${p}lau`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6d788" /><stop offset=".55" stopColor="#c99b3f" /><stop offset="1" stopColor="#6f4b12" />
      </linearGradient>
      <radialGradient id={`${p}cen`} cx=".38" cy=".3" r="1">
        <stop offset="0" stopColor="#fffdf6" /><stop offset=".65" stopColor="#fbf4e6" /><stop offset="1" stopColor="#e8d9bd" />
      </radialGradient>
      <radialGradient id={`${p}spec`} cx=".33" cy=".2" r=".62">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".85" /><stop offset=".55" stopColor="#ffffff" stopOpacity=".18" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <filter id={`${p}sf`} x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="1.8" stdDeviation="1.7" floodColor="#0b1220" floodOpacity=".38" />
      </filter>
    </defs>
  );

  if (estilo === 'D') {
    const nv = (nivel ?? 'bronce') as NivelInsignia;
    const m = METAL[nv];
    const c = CAMPO_FIN[nv];
    const esPlata = nv === 'plata', esOro = nv === 'oro';
    const conLaurel = esPlata || esOro;
    const conCinta = esPlata || esOro;
    const estrellas = esOro ? 5 : esPlata ? 3 : 1;
    const fs = texto ? (texto.length > 3 ? 7 : texto.length > 2 ? 8.5 : 10) : 0;
    const anchoEstrellas = esOro ? 30 : 22;
    const escalaEstrella = estrellas === 1 ? 0.9 : esOro ? 0.54 : 0.62;
    const estrellasArr = Array.from({ length: estrellas }, (_, i) => {
      const t = estrellas === 1 ? 0.5 : i / (estrellas - 1);
      const x = 60 - anchoEstrellas / 2 + t * anchoEstrellas;
      const y = 43.5 - Math.sin(t * Math.PI) * 3;
      return { x, y };
    });
    return (
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={title} style={estiloSvg} focusable="false" className={p}>
        {title ? <title>{title}</title> : null}
        {animada ? <style>{cssAnim(p)}</style> : null}
        <Defs m={m} c={c} />
        <ellipse cx="60" cy="110" rx="31" ry="4.5" fill="#1f2937" opacity=".14" />
        <g className={k(1)}>
          {esOro && <>
            <path className={animada ? 'brillo' : undefined} d={RAYOS_ORO} fill={`url(#${p}ry)`} opacity=".95" />
            <path d={RAYOS_ORO2} fill={m.hi} opacity=".55" />
          </>}
          {esPlata && <path className={animada ? 'brillo' : undefined} d={RAYOS_PLATA} fill={`url(#${p}ry)`} opacity=".6" />}
          {esOro && <g transform="translate(0 -2.5)">
            <path d={CORONA} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="60" cy="11" r="2.4" fill={`url(#${p}g)`} stroke={m.edge} strokeWidth=".7" />
            <circle cx="48" cy="15" r="1.6" fill={`url(#${p}g)`} /><circle cx="72" cy="15" r="1.6" fill={`url(#${p}g)`} />
          </g>}
          {esOro && <>
            <path d={ALA_D} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.5" />
            <path d={ALA_D} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.5" transform="translate(120 0) scale(-1 1)" />
          </>}
        </g>
        <g className={k(2)}>
          {conLaurel && [LAUREL_EXT, ...(esOro ? [LAUREL_INT] : [])].map((set, si) => (
            <g key={si}>
              {set.map((h, i) => <path key={'l' + i} d={HOJA} fill={`url(#${p}lau)`} stroke="#5a3c0e" strokeWidth=".5"
                transform={`translate(${h.x} ${h.y}) rotate(${h.rot}) scale(.62)`} />)}
              {set.map((h, i) => <path key={'r' + i} d={HOJA} fill={`url(#${p}lau)`} stroke="#5a3c0e" strokeWidth=".5"
                transform={`translate(${(120 - h.x).toFixed(1)} ${h.y}) rotate(${(180 - h.rot).toFixed(1)}) scale(.62)`} />)}
            </g>
          ))}
        </g>
        <g className={k(3)}>
          <path d={ESCUDO} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="2.4" filter={fSombra(p)} transform="translate(60 63) scale(1.2) translate(-60 -63)" />
          {(esPlata || esOro)
            ? <path d={ESCUDO} fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.4" transform="translate(60 63) scale(1.08) translate(-60 -63)" />
            : null}
          <path d={ESCUDO} fill={`url(#${p}c)`} stroke={c.borde} strokeWidth="1.4" />
          <path d={ESCUDO} fill={`url(#${p}spec)`} opacity=".55" />
          <path d="M40,30 H80 L76,36 H44 Z" fill="#fff" opacity=".2" />
          {(esPlata || esOro) && <path d={ESCUDO} fill="none" stroke={m.hi} strokeWidth="1.4" opacity=".85" transform="translate(60 63.5) scale(.9) translate(-60 -63.5)" />}
          <path d={ESCUDO} fill="none" stroke="#fff" strokeWidth=".8" opacity=".22" transform="translate(60 64.5) scale(1.16) translate(-60 -64.5)" />
          {esOro && <>
            <circle cx="44" cy="33" r="2.3" fill={`url(#${p}zaf)`} stroke="#0c2270" strokeWidth=".5" />
            <circle cx="76" cy="33" r="2.3" fill={`url(#${p}zaf)`} stroke="#0c2270" strokeWidth=".5" />
            <circle cx="43.3" cy="32.3" r=".6" fill="#fff" opacity=".9" />
            <circle cx="75.3" cy="32.3" r=".6" fill="#fff" opacity=".9" />
          </>}
          {estrellasArr.map((s, i) => (
            <path key={i} d={ESTRELLA5} fill={m.hi} stroke={m.edge} strokeWidth=".5"
              transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) scale(${escalaEstrella})`} />
          ))}
        </g>
        <g className={k(4)}>
          <ellipse cx="60" cy="64.5" rx="15.5" ry="14.5" fill="#0b1220" opacity=".22" />
          <circle cx="60" cy="62" r="15" fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.6" />
          <circle cx="60" cy="62" r="13.2" fill="none" stroke={m.hi} strokeWidth=".8" opacity=".7" />
          <circle cx="60" cy="62" r="11.6" fill={`url(#${p}cen)`} stroke={m.lo} strokeWidth=".8" />
          <circle cx="60" cy="62" r="10.1" fill="none" stroke={m.lo} strokeWidth=".35" opacity=".45" />
          <circle cx="60" cy="62" r="8.6" fill="none" stroke={m.lo} strokeWidth=".3" opacity=".3" />
          <path d="M50.5,56.5 A11,11 0 0 1 64.5,52.5" stroke="#fff" strokeWidth="2" fill="none" opacity=".85" strokeLinecap="round" />
          <ellipse cx="55" cy="70.5" rx="6" ry="1.8" fill={m.hi} opacity=".35" transform="rotate(16 55 70.5)" />
          {icono ? <text x="60" y="67" fontSize="13" textAnchor="middle" aria-hidden="true">{icono}</text> : null}
          {esOro && <>
            <path d={ROMBO} fill={`url(#${p}g)`} stroke={m.gemaLo} strokeWidth=".6" transform="translate(38 62)" />
            <path d={ROMBO} fill={`url(#${p}g)`} stroke={m.gemaLo} strokeWidth=".6" transform="translate(82 62)" />
          </>}
        </g>
        <g className={k(5)}>
          {conCinta ? (
            <g>
              <path d={`M26,${esOro ? 92 : 93} L36,88 L36,101 L24,105 L30,98 Z`} fill={m.lo} stroke={m.edge} strokeWidth=".8" />
              <path d={`M94,${esOro ? 92 : 93} L84,88 L84,101 L96,105 L90,98 Z`} fill={m.lo} stroke={m.edge} strokeWidth=".8" />
              <path d="M35,88 C48,84 72,84 85,88 L85,100 C72,96 48,96 35,100 Z" fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1.1" />
              <path d="M35,97 C48,93 72,93 85,97 L85,100 C72,96 48,96 35,100 Z" fill="#0b1220" opacity=".18" />
              <path d="M37,89 C49,85.4 71,85.4 83,89 L83,91.5 C71,88 49,88 37,91.5 Z" fill="#fff" opacity=".35" />
              {texto ? <g><text x="60" y="97.1" fontSize={fs} fontWeight={800} fill="#fff" opacity=".4" textAnchor="middle" aria-hidden="true">{texto}</text><text x="60" y="96.5" fontSize={fs} fontWeight={800} fill="#3a2408" textAnchor="middle" aria-hidden="true">{texto}</text></g> : null}
            </g>
          ) : (
            texto ? <g>
              <rect x="43" y="88" width="34" height="13" rx="2.5" fill={`url(#${p}m)`} stroke={m.edge} strokeWidth="1" />
              <rect x="44" y="89" width="32" height="4.5" rx="2" fill="#fff" opacity=".3" />
              <text x="60" y="98" fontSize={fs} fontWeight={800} fill="#fff" opacity=".4" textAnchor="middle" aria-hidden="true">{texto}</text>
              <text x="60" y="97.4" fontSize={fs} fontWeight={800} fill="#3a2408" textAnchor="middle" aria-hidden="true">{texto}</text>
            </g> : (
              <g>
                <path d={HOJA} fill={`url(#${p}lau)`} transform="translate(52 96) rotate(150) scale(.7)" />
                <path d={HOJA} fill={`url(#${p}lau)`} transform="translate(68 96) rotate(30) scale(.7)" />
              </g>
            )
          )}
        </g>
      </svg>
    );
  }

  // ── Estilo E — hito único ──
  const o = METAL.oro;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={title} style={estiloSvg} focusable="false" className={p}>
      {title ? <title>{title}</title> : null}
      {animada ? <style>{cssAnim(p)}</style> : null}
      <defs>
        <linearGradient id={`${p}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={o.hi} /><stop offset=".45" stopColor={o.mid} /><stop offset=".7" stopColor="#ffd75e" /><stop offset="1" stopColor="#b57a10" />
        </linearGradient>
        <radialGradient id={`${p}c`} cx=".4" cy=".3" r=".9">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".5" stopColor="#dcefff" /><stop offset="1" stopColor="#8db4d8" />
        </radialGradient>
        <radialGradient id={`${p}ry`} cx=".5" cy=".5" r=".5">
          <stop offset=".45" stopColor="#ffdf7a" stopOpacity="0" /><stop offset="1" stopColor="#ffce4a" stopOpacity=".9" />
        </radialGradient>
        <radialGradient id={`${p}g`} cx=".4" cy=".3" r=".9">
          <stop offset="0" stopColor="#9cc4ff" /><stop offset="1" stopColor="#1b3fae" />
        </radialGradient>
        <linearGradient id={`${p}cw`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4faff" /><stop offset=".45" stopColor="#c3ddf8" /><stop offset="1" stopColor="#7fa8d8" />
        </linearGradient>
        <radialGradient id={`${p}spec`} cx=".33" cy=".2" r=".62">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".85" /><stop offset=".55" stopColor="#ffffff" stopOpacity=".15" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${p}sf`} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="1.8" stdDeviation="1.7" floodColor="#0b1220" floodOpacity=".38" />
        </filter>
      </defs>
      <ellipse cx="60" cy="108" rx="30" ry="4.5" fill="#1f2937" opacity=".14" />
      <g className={k(1)}>
        <path className={animada ? 'brillo' : undefined} d={rayos(60, 60, 24, 50, 20, 0.3)} fill={`url(#${p}ry)`} opacity=".85" />
      </g>
      <g className={k(2)}>
        <path d={ALA_E} fill={`url(#${p}cw)`} stroke="#6d94c4" strokeWidth="1.3" opacity=".96" />
        <path d={ALA_E} fill={`url(#${p}cw)`} stroke="#6d94c4" strokeWidth="1.3" opacity=".96" transform="translate(120 0) scale(-1 1)" />
        <path d="M9,39 C17,45 22,50 26,56 M6,61 C14,62 20,64 25,68 M11,81 C17,80 23,78 28,75" fill="none" stroke="#ffffff" strokeWidth="1.1" opacity=".75" />
        <path d="M111,39 C103,45 98,50 94,56 M114,61 C106,62 100,64 95,68 M109,81 C103,80 97,78 92,75" fill="none" stroke="#ffffff" strokeWidth="1.1" opacity=".75" />
        <path d="M14,44 C20,49 24,53 28,59 M12,66 C18,67 22,69 27,72" fill="none" stroke="#4f78ab" strokeWidth=".7" opacity=".5" />
        <path d="M106,44 C100,49 96,53 92,59 M108,66 C102,67 98,69 93,72" fill="none" stroke="#4f78ab" strokeWidth=".7" opacity=".5" />
      </g>
      <g className={k(3)}>
        <circle cx="60" cy="60" r="26.5" fill={`url(#${p}a)`} stroke={o.edge} strokeWidth="2.4" filter={fSombra(p)} />
        <circle cx="60" cy="60" r="24.6" fill="none" stroke="#7a4e0c" strokeWidth=".7" opacity=".55" />
        <circle cx="60" cy="60" r="22.8" fill="none" stroke="#fff" strokeWidth="1.3" opacity=".5" />
        <path d="M39.9,45.9 A24.6,24.6 0 0 1 66.4,36.2" stroke="#fff" strokeWidth="2.8" fill="none" opacity=".85" strokeLinecap="round" />
        <path d="M83.1,68.4 A24.6,24.6 0 0 1 72.3,81.3" stroke="#ffe9a3" strokeWidth="1.6" fill="none" opacity=".5" strokeLinecap="round" />
        {[43, 77].map((x) => <g key={'t' + x}><circle cx={x} cy="43" r="2" fill={`url(#${p}g)`} stroke="#0c2270" strokeWidth=".5" /><circle cx={x - 0.6} cy="42.4" r=".55" fill="#fff" opacity=".9" /></g>)}
        {[43, 77].map((x) => <g key={'b' + x}><circle cx={x} cy="77" r="2" fill={`url(#${p}g)`} stroke="#0c2270" strokeWidth=".5" /><circle cx={x - 0.6} cy="76.4" r=".55" fill="#fff" opacity=".9" /></g>)}
        <path d={ROMBO} fill={`url(#${p}g)`} stroke="#0c2270" strokeWidth=".7" transform="translate(60 34.5) scale(1.05)" />
        <circle cx="58.8" cy="32.8" r=".7" fill="#fff" opacity=".9" />
      </g>
      <g className={k(4)}>
        <circle cx="60" cy="60" r="19" fill={`url(#${p}c)`} stroke="#7ea3c6" strokeWidth="1.2" />
        <circle cx="60" cy="60" r="17.2" fill="none" stroke="#fff" strokeWidth=".5" opacity=".5" />
        <circle cx="60" cy="60" r="19" fill={`url(#${p}spec)`} opacity=".6" />
        <path d="M60,41 L73.4,46.6 L79,60 L73.4,73.4 L60,79 L46.6,73.4 L41,60 L46.6,46.6 Z" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".8" />
        <path d="M60,41 L60,79 M41,60 L79,60 M46.6,46.6 L73.4,73.4 M46.6,73.4 L73.4,46.6" stroke="#fff" strokeWidth=".9" opacity=".4" />
        <ellipse cx="53" cy="51" rx="6.5" ry="3.4" fill="#fff" opacity=".75" transform="rotate(-24 53 51)" />
        {icono ? <text x="60" y="66.5" fontSize="17" textAnchor="middle" aria-hidden="true">{icono}</text> : null}
      </g>
      <g className={k(5)}>
        <path d={CHISPA} fill="#fff" opacity=".95" transform="translate(26 27) scale(1.15)" />
        <path d={CHISPA} fill="#ffe9a3" transform="translate(94 31) scale(.9)" />
        <path d={CHISPA} fill="#fff" opacity=".85" transform="translate(90 92) scale(.75)" />
      </g>
    </svg>
  );
}
