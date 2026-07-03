// Consulta de cédula al registro del CNE mediante CedulaVE API
// (MegaCreativo, licencia MIT). SOLO se llama desde el servidor.
//
// La búsqueda es POR CÉDULA (no por nombre): sirve para contrastar la cédula de
// un caso contra el registro oficial y ver si el nombre/ubicación concuerdan.
//
// Endpoint configurable por entorno (CEDULA_VE_API_URL) por si cambia el host o
// se auto-hospeda. Falla de forma controlada (nunca lanza): devuelve un motivo.

const BASE = process.env.CEDULA_VE_API_URL || 'https://api.megacreativo.com/public/cedula-ve/v1/';

export type Nacionalidad = 'V' | 'E';

export type DatosCedula = {
  nac: string;
  dni: string;
  fullname: string;
  state: string;
  municipality: string;
  parish: string;
  voting: string;
  address: string;
};

export type ResultadoCedula =
  | { ok: true; datos: DatosCedula }
  | { ok: false; motivo: 'entrada' | 'no_encontrada' | 'servicio' };

/** Deja solo dígitos y valida un largo razonable de cédula venezolana. */
export function normalizarCedula(cedula: string): string {
  return (cedula || '').replace(/\D/g, '').slice(0, 9);
}

export function cedulaVeActivo(): boolean {
  return !!BASE;
}

export async function consultarCedulaVE(nac: Nacionalidad, cedula: string): Promise<ResultadoCedula> {
  const dni = normalizarCedula(cedula);
  if (!dni || dni.length < 4) return { ok: false, motivo: 'entrada' };
  if (nac !== 'V' && nac !== 'E') return { ok: false, motivo: 'entrada' };

  const sep = BASE.includes('?') ? '&' : '?';
  const url = `${BASE}${sep}nac=${encodeURIComponent(nac)}&dni=${encodeURIComponent(dni)}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (res.status === 404) return { ok: false, motivo: 'no_encontrada' };
    if (!res.ok) return { ok: false, motivo: 'servicio' };
    const j: any = await res.json().catch(() => null);
    const r = j?.response;
    if (!r || (typeof j?.status === 'number' && j.status !== 200)) return { ok: false, motivo: 'no_encontrada' };
    const fullname = String(r.fullname ?? [r.name, r.lastname].filter(Boolean).join(' ')).trim();
    if (!fullname) return { ok: false, motivo: 'no_encontrada' };
    return {
      ok: true,
      datos: {
        nac: String(r.nac ?? nac),
        dni: String(r.dni ?? dni),
        fullname,
        state: String(r.state ?? ''),
        municipality: String(r.municipality ?? ''),
        parish: String(r.parish ?? ''),
        voting: String(r.voting ?? ''),
        address: String(r.address ?? ''),
      },
    };
  } catch {
    return { ok: false, motivo: 'servicio' };
  } finally {
    clearTimeout(t);
  }
}
