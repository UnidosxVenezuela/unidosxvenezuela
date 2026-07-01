// Operaciones de Storage con la service key (SOLO servidor). Saltan la RLS de
// Storage y aseguran que el bucket exista, para que las subidas NO dependan de
// que estén creadas las policies de storage.objects en el proyecto Supabase.
import { createAdminClient } from '@/lib/supabase/admin';

/** Sube un archivo (crea el bucket si falta). Devuelve la ruta y, si es público, la URL. */
export async function subirArchivoAdmin(
  bucket: string,
  ruta: string,
  file: File,
  opts: { publico: boolean; upsert?: boolean },
): Promise<{ path: string; publicUrl: string | null }> {
  const admin = createAdminClient();
  // Idempotente: si el bucket ya existe, la API devuelve un error que ignoramos.
  await admin.storage.createBucket(bucket, { public: opts.publico });
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(bucket).upload(ruta, buffer, {
    upsert: opts.upsert ?? true,
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw new Error(error.message);
  const publicUrl = opts.publico ? admin.storage.from(bucket).getPublicUrl(ruta).data.publicUrl : null;
  return { path: ruta, publicUrl };
}

/** URL firmada para un bucket privado (salta la RLS de Storage). */
export async function urlFirmadaAdmin(bucket: string, path: string, segundos = 3600): Promise<string | null> {
  const { data } = await createAdminClient().storage.from(bucket).createSignedUrl(path, segundos);
  return data?.signedUrl ?? null;
}

/** Borra objetos con la service key. */
export async function borrarArchivoAdmin(bucket: string, paths: string[]): Promise<void> {
  if (paths.length) await createAdminClient().storage.from(bucket).remove(paths);
}
