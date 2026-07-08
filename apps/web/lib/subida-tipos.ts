// Tipos, límites y validación de subida de archivos — COMPARTIDO cliente/servidor.
// Sin secretos ni dependencias de servidor: es seguro importarlo desde componentes
// cliente. La firma S3 (con credenciales) vive aparte en `lib/r2.ts` (solo servidor).

export type TipoSubida = 'imagen' | 'video' | 'documento';

// Límites por tipo (MB). La subida directa a R2 (presigned) evita el tope de las
// Server Actions/Vercel (~4.5 MB), así que aquí ponemos los límites reales de producto.
export const LIMITES_MB: Record<TipoSubida, number> = {
  imagen: 15,
  video: 1024, // 1 GB
  documento: 25,
};

const MIME_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MIME_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
const MIME_DOC = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt', 'text/csv': 'csv',
};

/** Clasifica un MIME en imagen/video/documento (o null si no se permite). */
export function clasificarMime(mime: string): TipoSubida | null {
  const m = (mime || '').toLowerCase();
  if (MIME_IMAGEN.includes(m)) return 'imagen';
  if (MIME_VIDEO.includes(m)) return 'video';
  if (MIME_DOC.includes(m)) return 'documento';
  // Fallback por prefijo: algunos navegadores (móviles) dan un MIME inusual.
  if (m.startsWith('image/')) return 'imagen';
  if (m.startsWith('video/')) return 'video';
  return null;
}

export function limiteBytes(tipo: TipoSubida): number {
  return LIMITES_MB[tipo] * 1024 * 1024;
}

/** Extensión de archivo a partir del MIME (o del nombre como respaldo). */
export function extDe(mime: string, nombre: string): string {
  const porMime = EXT_POR_MIME[(mime || '').toLowerCase()];
  if (porMime) return porMime;
  const porNombre = (nombre.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return porNombre || 'bin';
}

/** Nombre legible y saneado para guardar/mostrar (la key S3 la arma el servidor). */
export function nombreSeguro(nombre: string): string {
  return (nombre || 'archivo').replace(/[^\w.\- ]+/g, '').trim().slice(0, 120) || 'archivo';
}

/** URL pública de lectura (R2 detrás del CDN de Cloudflare). Isomórfico (NEXT_PUBLIC_). */
export function urlPublicaR2(key: string): string {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return base + '/' + key.split('/').map(encodeURIComponent).join('/');
}

/** ¿El cliente sabe que R2 está activo? (solo mira la URL pública, no los secretos.) */
export function r2ClienteActivo(): boolean {
  return !!process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
}

/** Validación de un archivo en el cliente antes de pedir la firma. */
export function validarArchivo(
  file: { size: number; type: string; name: string },
): { ok: true; tipo: TipoSubida } | { ok: false; error: string } {
  const tipo = clasificarMime(file.type) ?? (/\.(jpe?g|png|webp|gif|avif)$/i.test(file.name) ? 'imagen' : null);
  if (!tipo) return { ok: false, error: 'Tipo de archivo no permitido.' };
  if (file.size === 0) return { ok: false, error: 'El archivo está vacío.' };
  if (file.size > limiteBytes(tipo)) {
    return { ok: false, error: `Supera el límite de ${LIMITES_MB[tipo]} MB para ${tipo}.` };
  }
  return { ok: true, tipo };
}
