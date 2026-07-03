// Consulta de cédula al registro del CNE mediante una API compatible con
// CedulaVE (MegaCreativo, licencia MIT). SOLO se llama desde el servidor.
//
// IMPORTANTE: el antiguo host público `api.megacreativo.com` fue discontinuado
// (su DNS ya no resuelve), por eso NO hay un endpoint por defecto. El
// administrador DEBE configurar `CEDULA_VE_API_URL` con un proveedor vigente
// —el script CedulaVE auto-hospedado o un espejo compatible—. Si el proveedor
// exige un token, puede incluirse en la propia URL (…?token=XXX) o, si usa
// cabecera Bearer, en `CEDULA_VE_API_TOKEN`.
//
// La búsqueda es POR CÉDULA (no por nombre): sirve para contrastar la cédula de
// un caso contra el registro oficial y ver si el nombre/ubicación concuerdan.
// Falla de forma controlada (nunca lanza): devuelve un motivo.

const BASE = (process.env.CEDULA_VE_API_URL || '').trim();
const TOKEN = (process.env.CEDULA_VE_API_TOKEN || '').trim();

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

/** Deja solo dígitos y valida un largo razonable de cédula venezolana. */
export function normalizarCedula(cedula: string): string {
  return (cedula || '').replace(/\D/g, '').slice(0, 9);
}

/** La herramienta está activa solo si hay un endpoint http(s) configurado. */
export function cedulaVeActivo(): boolean {
  return /^https?:\/\//i.test(BASE);
}

// Diagnóstico en el servidor. NUNCA registra la cédula consultada (dato sensible),
// solo el host y el tipo de fallo, para que un admin entienda qué pasó.
function diag(detalle: string) {
  try { console.error('[cedula-ve]', detalle); } catch { /* noop */ }
}

export async function consultarCedulaVE(nac: Nacionalidad, cedula: string): Promise<ResultadoCedula> {
  if (!cedulaVeActivo()) return { ok: false, motivo: 'no_configurada' };
  const dni = normalizarCedula(cedula);
  if (!dni || dni.length < 4) return { ok: false, motivo: 'entrada' };
  if (nac !== 'V' && nac !== 'E') return { ok: false, motivo: 'entrada' };

  const sep = BASE.includes('?') ? '&' : '?';
  const url = `${BASE}${sep}nac=${encodeURIComponent(nac)}&dni=${encodeURIComponent(dni)}`;
  let host = 'endpoint';
  try { host = new URL(BASE).host; } catch { /* URL rara: se reporta genérico */ }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
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
    // Causa más frecuente tras la caída del host por defecto: DNS/host inalcanzable o timeout.
    diag(`${e?.name || 'error'} al consultar ${host}: ${e?.code || e?.message || ''}`.trim());
    return { ok: false, motivo: 'servicio' };
  } finally {
    clearTimeout(t);
  }
}
