// Operaciones de Storage con la SESIÓN DEL USUARIO (no la service key). Las
// políticas de Storage viven en la migración 0053 (buckets + RLS), así que las
// subidas funcionan con el cliente autenticado normal, sin depender de que esté
// configurada (bien) la service key en el servidor.
import type { createClient } from '@/lib/supabase/server';

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Sube un archivo con el cliente del usuario. Devuelve la ruta y, si es público, la URL. */
export async function subirArchivo(
  client: Cliente,
  bucket: string,
  ruta: string,
  file: File,
  opts: { publico: boolean; upsert?: boolean },
): Promise<{ path: string; publicUrl: string | null }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await client.storage.from(bucket).upload(ruta, buffer, {
    upsert: opts.upsert ?? true,
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw new Error(error.message);
  const publicUrl = opts.publico ? client.storage.from(bucket).getPublicUrl(ruta).data.publicUrl : null;
  return { path: ruta, publicUrl };
}

/** URL firmada para un bucket privado (con la sesión del usuario). */
export async function urlFirmada(client: Cliente, bucket: string, path: string, segundos = 3600): Promise<string | null> {
  const { data } = await client.storage.from(bucket).createSignedUrl(path, segundos);
  return data?.signedUrl ?? null;
}

/** Borra objetos con la sesión del usuario. */
export async function borrarArchivo(client: Cliente, bucket: string, paths: string[]): Promise<void> {
  if (paths.length) await client.storage.from(bucket).remove(paths);
}
