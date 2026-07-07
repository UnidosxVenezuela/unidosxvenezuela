// Husos horarios (0120): convierten la disponibilidad de un miembro a la zona de quien
// mira, para que se entienda «cuándo está disponible» desde cualquier parte del mundo.
// El desfase del miembro se deduce de su país (PAISES[].utc, aprox.); el de quien mira,
// del navegador. Es una aproximación (algunos países cambian con horario de verano).
import { zonaPais } from './constantes';

/** Desfase horario del país (en horas, p. ej. −4) o null si no se conoce. */
export function offsetPais(codigo?: string | null): number | null {
  const u = (zonaPais(codigo) || '').replace('−', '-'); // el catálogo usa el menos Unicode
  if (!u) return null;
  if (u === 'UTC') return 0;
  const m = u.match(/UTC\s*([+-]\d+(?:\.\d+)?)/);
  return m && m[1] ? parseFloat(m[1]) : null;
}

/** Desfase horario de quien está mirando (según su navegador), en horas. */
export function offsetVisitante(): number {
  return -new Date().getTimezoneOffset() / 60;
}

/** «UTC+1», «UTC−4:30». */
export function etiquetaOffset(off: number): string {
  const signo = off >= 0 ? '+' : '−';
  const abs = Math.abs(off);
  const h = Math.floor(abs);
  const mm = Math.round((abs - h) * 60);
  return 'UTC' + signo + h + (mm ? ':' + String(mm).padStart(2, '0') : '');
}

/** Hora actual (HH:MM) en un huso con `off` horas de desfase respecto a UTC. */
export function horaActualEn(off: number): string {
  const ahoraUtcMin = Date.now() / 60000 + new Date().getTimezoneOffset(); // minutos UTC
  let t = Math.round(ahoraUtcMin + off * 60);
  t = ((t % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

/**
 * Desplaza en `shift` horas las horas escritas en un texto (p. ej. «9:00 a 17:00» o
 * «9am–5pm»). Solo toca patrones que SON horas (llevan «:» o «am/pm») para no confundir
 * números sueltos. Devuelve el texto convertido, o null si no encontró ninguna hora.
 */
export function convertirHorario(texto: string, shift: number): string | null {
  if (!texto || !Number.isFinite(shift)) return null;
  let hubo = false;
  const desplazar = (h: number, m: number) => {
    let t = Math.round(h * 60 + m + shift * 60);
    t = ((t % 1440) + 1440) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  };
  // Un solo paso: rama 12h (grupos 1-3, con am/pm) o rama 24h (grupos 4-5, con «:»).
  // Hacerlo en una pasada evita volver a desplazar una hora ya convertida.
  const RE = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)|\b(\d{1,2}):(\d{2})\b/gi;
  const out = texto.replace(RE, (full, h12, m12, ap, h24, m24) => {
    if (ap != null) {
      let h = parseInt(h12, 10);
      if (h > 12) return full;
      const pm = /p/i.test(ap);
      if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
      hubo = true;
      return desplazar(h, m12 ? parseInt(m12, 10) : 0);
    }
    const h = parseInt(h24, 10), m = parseInt(m24, 10);
    if (h > 23 || m > 59) return full;
    hubo = true;
    return desplazar(h, m);
  });
  return hubo ? out : null;
}
