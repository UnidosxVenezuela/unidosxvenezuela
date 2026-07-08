'use client';
// Utilidades de subida directa navegador → R2: compresión de imagen (canvas) y
// PUT con barra de progreso (XHR). Solo se usan desde componentes cliente.

/** Comprime una imagen grande a JPEG (redimensiona al lado máximo). Si no conviene
 *  (ya es liviana, o es un formato que no queremos re-encodear), devuelve el original. */
export async function comprimirImagen(
  file: File,
  opts: { maxDim?: number; calidad?: number; umbralBytes?: number } = {},
): Promise<{ blob: Blob; mime: string }> {
  const maxDim = opts.maxDim ?? 1920;
  const calidad = opts.calidad ?? 0.82;
  const umbral = opts.umbralBytes ?? 1024 * 1024; // no re-comprimir imágenes ya livianas
  // Solo JPEG/PNG/WEBP: GIF (posible animación) y AVIF se dejan tal cual.
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return { blob: file, mime: file.type };
  try {
    const bitmap = await cargarBitmap(file);
    const escala = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && file.size <= umbral) { cerrar(bitmap); return { blob: file, mime: file.type }; }
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { cerrar(bitmap); return { blob: file, mime: file.type }; }
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    cerrar(bitmap);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', calidad));
    if (blob && blob.size < file.size) return { blob, mime: 'image/jpeg' };
    return { blob: file, mime: file.type };
  } catch {
    return { blob: file, mime: file.type };
  }
}

async function cargarBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* respaldo con <img> */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

function cerrar(b: ImageBitmap | HTMLImageElement) {
  if (typeof (b as ImageBitmap).close === 'function') (b as ImageBitmap).close();
}

/** PUT del blob a la URL firmada, con progreso 0..100. Lanza Error si falla. */
export function subirPut(
  url: string, blob: Blob, mime: string, onProgreso?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgreso) onProgreso(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('Error al subir el archivo (' + xhr.status + ').'));
    };
    xhr.onerror = () => reject(new Error('Error de red al subir el archivo.'));
    xhr.send(blob);
  });
}
