// Validación y análisis heurístico de enlaces y archivos (sin servicios externos).
// Es la PRIMERA línea de defensa. El escaneo profundo de amenazas con Google Safe
// Browsing vive en `lib/safe-browsing.ts` (solo servidor) y se aplica al
// crear/editar un caso, como segunda línea.

const TLDS_SOSPECHOSOS = new Set(['zip', 'mov', 'xyz', 'top', 'tk', 'gq', 'ml', 'cf', 'ga', 'click', 'link', 'work', 'loan', 'review', 'country', 'kim', 'men']);
const ACORTADORES = new Set(['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'rb.gy', 'acortar.link', 'wa.link']);

export type NivelSeg = 'ok' | 'aviso' | 'peligro';
export type AnalisisUrl = { ok: boolean; motivo?: string; nivel: NivelSeg; notas: string[]; url?: string };

/** Analiza un enlace: valida el formato y marca señales de riesgo (heurístico). */
export function analizarUrl(entrada: string | null | undefined): AnalisisUrl {
  const notas: string[] = [];
  const s = (entrada ?? '').trim();
  if (!s) return { ok: true, nivel: 'ok', notas: [] }; // vacío = opcional
  if (/^\s*(javascript|data|vbscript|file):/i.test(s)) {
    return { ok: false, motivo: 'Ese tipo de enlace no está permitido por seguridad.', nivel: 'peligro', notas: ['Esquema no permitido'] };
  }
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); }
  catch { return { ok: false, motivo: 'El enlace no tiene un formato válido.', nivel: 'peligro', notas: ['Formato inválido'] }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, motivo: 'Usa un enlace http(s) válido.', nivel: 'peligro', notas: ['Protocolo no web'] };
  }
  let nivel: NivelSeg = 'ok';
  const subir = (n: NivelSeg) => { if (n === 'peligro' || (n === 'aviso' && nivel === 'ok')) nivel = n; };
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'http:') { notas.push('Sin cifrado (http)'); subir('aviso'); }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) { notas.push('El dominio es una dirección IP'); subir('aviso'); }
  if (host.startsWith('xn--') || host.includes('.xn--')) { notas.push('Dominio con caracteres internacionales (posible suplantación)'); subir('aviso'); }
  const tld = host.split('.').pop() ?? '';
  if (TLDS_SOSPECHOSOS.has(tld)) { notas.push('Dominio poco común (.' + tld + ')'); subir('aviso'); }
  if (ACORTADORES.has(host)) { notas.push('Es un acortador: oculta el destino real'); subir('aviso'); }
  if (u.username || u.password) { notas.push('El enlace incluye usuario/contraseña'); subir('aviso'); }
  if (s.length > 300) { notas.push('Enlace inusualmente largo'); subir('aviso'); }
  return { ok: true, nivel, notas, url: u.toString() };
}

// ── Archivos ──
const EXT_OK = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'mp4', 'mov', 'webm', 'm4v']);
const EXT_PELIGRO = new Set(['exe', 'bat', 'cmd', 'com', 'scr', 'pif', 'msi', 'apk', 'jar', 'js', 'mjs', 'vbs', 'ps1', 'sh', 'dll', 'html', 'htm', 'svg', 'app']);

/** Valida un archivo por nombre/tamaño (lista blanca de extensiones + límite). */
export function validarArchivo(nombre: string, tamano: number, maxMB = 10): { ok: boolean; motivo?: string } {
  const ext = (nombre.split('.').pop() ?? '').toLowerCase();
  if (EXT_PELIGRO.has(ext)) return { ok: false, motivo: 'Por seguridad no se permite este tipo de archivo (.' + ext + ').' };
  if (!EXT_OK.has(ext)) return { ok: false, motivo: 'Tipo de archivo no admitido (.' + (ext || '?') + '). Usa imagen, PDF, documento, hoja de cálculo o video.' };
  if (tamano > maxMB * 1024 * 1024) return { ok: false, motivo: 'El archivo supera ' + maxMB + ' MB.' };
  return { ok: true };
}
