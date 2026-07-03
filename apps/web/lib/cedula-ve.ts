// Consulta de cédula al registro del CNE. SOLO se llama desde el servidor.
//
// Soporta DOS proveedores (se elige por variables de entorno):
//
//  1) cedula.com.ve  — servicio hospedado (de pago, requiere app_id + token).
//     Se activa con CEDULA_COM_VE_APP_ID + CEDULA_COM_VE_TOKEN.
//     GET https://api.cedula.com.ve/api/v1?app_id=…&token=…&cedula=…
//     Respuesta: { data: { primer_nombre, primer_apellido, … } } | { error_str }
//     (Fuente: github.com/YipiApp/API-Cedula.com.ve, GPLv3.)
//
//  2) Compatible con CedulaVE (MegaCreativo, MIT) — el script auto-hospedado o
//     un espejo. Se activa con CEDULA_VE_API_URL (+ CEDULA_VE_API_TOKEN opcional).
//     GET …?nac=V&dni=…  →  { status, response: { fullname | name/lastname, … } }
//
// El antiguo host público api.megacreativo.com fue discontinuado (su DNS ya no
// resuelve), por eso NO hay endpoint por defecto: hay que configurar uno.
// La búsqueda es POR CÉDULA (no por nombre). Falla de forma controlada (nunca
// lanza): devuelve un motivo.

// --- Proveedor cedula.com.ve (de pago) ---
const CV_APPID = (process.env.CEDULA_COM_VE_APP_ID || '').trim();
const CV_TOKEN = (process.env.CEDULA_COM_VE_TOKEN || '').trim();
const CV_URL = (process.env.CEDULA_COM_VE_URL || 'https://api.cedula.com.ve/api/v1').trim();

// --- Proveedor compatible con CedulaVE (auto-hospedado o espejo) ---
const MC_URL = (process.env.CEDULA_VE_API_URL || '').trim();
const MC_TOKEN = (process.env.CEDULA_VE_API_TOKEN || '').trim();

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

export type MotivoCedula = 'entrada' | 'no_encontrada' | 'servicio' | 'no_configurada';

export type ResultadoCedula =
  | { ok: true; datos: DatosCedula }
  | { ok: false; motivo: MotivoCedula };

type Proveedor = 'cedula_com_ve' | 'compatible';

/** Deja solo dígitos y valida un largo razonable de cédula venezolana. */
export function normalizarCedula(cedula: string): string {
  return (cedula || '').replace(/\D/g, '').slice(0, 9);
}

/** Qué proveedor está configurado (cedula.com.ve tiene prioridad si tiene credenciales). */
function proveedorActivo(): Proveedor | null {
  if (CV_APPID && CV_TOKEN && /^https?:\/\//i.test(CV_URL)) return 'cedula_com_ve';
  if (/^https?:\/\//i.test(MC_URL)) return 'compatible';
  return null;
}

/** La herramienta está activa solo si hay un proveedor configurado. */
export function cedulaVeActivo(): boolean {
  return proveedorActivo() !== null;
}

// Diagnóstico en el servidor. NUNCA registra la cédula consultada (dato sensible),
// solo el host y el tipo de fallo, para que un admin entienda qué pasó.
function diag(detalle: string) {
  try { console.error('[cedula-ve]', detalle); } catch { /* noop */ }
}

function hostDe(url: string): string {
  try { return new URL(url).host; } catch { return 'endpoint'; }
}

export async function consultarCedulaVE(nac: Nacionalidad, cedula: string): Promise<ResultadoCedula> {
  const prov = proveedorActivo();
  if (!prov) return { ok: false, motivo: 'no_configurada' };
  const dni = normalizarCedula(cedula);
  if (!dni || dni.length < 4) return { ok: false, motivo: 'entrada' };
  if (nac !== 'V' && nac !== 'E') return { ok: false, motivo: 'entrada' };
  return prov === 'cedula_com_ve' ? consultarCedulaComVe(nac, dni) : consultarCompatible(nac, dni);
}

// --- Implementación cedula.com.ve ---
async function consultarCedulaComVe(nac: Nacionalidad, dni: string): Promise<ResultadoCedula> {
  const sep = CV_URL.includes('?') ? '&' : '?';
  // Este proveedor consulta solo por número de cédula (los ejemplos no envían nac).
  const url = `${CV_URL}${sep}app_id=${encodeURIComponent(CV_APPID)}&token=${encodeURIComponent(CV_TOKEN)}&cedula=${encodeURIComponent(dni)}`;
  const host = hostDe(CV_URL);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (res.status === 404) return { ok: false, motivo: 'no_encontrada' };
    if (res.status === 401 || res.status === 403) { diag(`HTTP ${res.status} desde ${host} (¿app_id/token inválidos?)`); return { ok: false, motivo: 'servicio' }; }
    if (!res.ok) { diag(`HTTP ${res.status} desde ${host}`); return { ok: false, motivo: 'servicio' }; }
    const j: any = await res.json().catch(() => null);
    if (!j || typeof j !== 'object') { diag(`respuesta no-JSON desde ${host}`); return { ok: false, motivo: 'servicio' }; }
    if (j.error_str || j.error) return { ok: false, motivo: 'no_encontrada' };
    const d = j.data ?? j;
    if (!d || typeof d !== 'object') return { ok: false, motivo: 'no_encontrada' };
    const fullname = [d.primer_nombre, d.segundo_nombre, d.primer_apellido, d.segundo_apellido]
      .map((x: any) => String(x ?? '').trim()).filter(Boolean).join(' ')
      || String(d.nombre_completo ?? d.fullname ?? '').trim();
    if (!fullname) return { ok: false, motivo: 'no_encontrada' };
    return {
      ok: true,
      datos: {
        nac: String(d.nacionalidad ?? d.nac ?? nac),
        dni: String(d.cedula ?? d.dni ?? dni),
        fullname,
        state: String(d.estado ?? d.state ?? ''),
        municipality: String(d.municipio ?? d.municipality ?? ''),
        parish: String(d.parroquia ?? d.parish ?? ''),
        voting: String(d.centro ?? d.centro_votacion ?? d.voting ?? ''),
        address: String(d.direccion ?? d.address ?? ''),
      },
    };
  } catch (e: any) {
    diag(`${e?.name || 'error'} al consultar ${host}: ${e?.code || e?.message || ''}`.trim());
    return { ok: false, motivo: 'servicio' };
  } finally {
    clearTimeout(t);
  }
}

// --- Implementación compatible con CedulaVE (MegaCreativo / auto-hospedado) ---
async function consultarCompatible(nac: Nacionalidad, dni: string): Promise<ResultadoCedula> {
  const sep = MC_URL.includes('?') ? '&' : '?';
  const url = `${MC_URL}${sep}nac=${encodeURIComponent(nac)}&dni=${encodeURIComponent(dni)}`;
  const host = hostDe(MC_URL);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (MC_TOKEN) headers.authorization = `Bearer ${MC_TOKEN}`;
    const res = await fetch(url, { signal: ctrl.signal, headers, cache: 'no-store' });
    if (res.status === 404) return { ok: false, motivo: 'no_encontrada' };
    if (!res.ok) { diag(`HTTP ${res.status} desde ${host}`); return { ok: false, motivo: 'servicio' }; }

    const j: any = await res.json().catch(() => null);
    if (!j || typeof j !== 'object') { diag(`respuesta no-JSON desde ${host}`); return { ok: false, motivo: 'servicio' }; }

    // Distintos proveedores anidan los datos en `response`/`data` o los devuelven planos.
    const r = j.response ?? j.data ?? j;
    const statusNum = typeof j.status === 'number' ? j.status : undefined;
    if ((statusNum !== undefined && statusNum !== 200) || !r || typeof r !== 'object') {
      return { ok: false, motivo: 'no_encontrada' };
    }
    const fullname = String(r.fullname ?? [r.name, r.lastname].filter(Boolean).join(' ') ?? '').trim();
    if (!fullname) return { ok: false, motivo: 'no_encontrada' };
    return {
      ok: true,
      datos: {
        nac: String(r.nac ?? nac),
        dni: String(r.dni ?? dni),
        fullname,
        state: String(r.state ?? r.estado ?? ''),
        municipality: String(r.municipality ?? r.municipio ?? ''),
        parish: String(r.parish ?? r.parroquia ?? ''),
        voting: String(r.voting ?? r.centro ?? ''),
        address: String(r.address ?? r.direccion ?? ''),
      },
    };
  } catch (e: any) {
    diag(`${e?.name || 'error'} al consultar ${host}: ${e?.code || e?.message || ''}`.trim());
    return { ok: false, motivo: 'servicio' };
  } finally {
    clearTimeout(t);
  }
}
