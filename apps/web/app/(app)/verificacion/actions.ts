'use server';
// Segunda verificación de identidad: sube la foto en vivo (rostro + documento)
// y la foto del documento al bucket privado 'identidad', y registra la solicitud
// como 'pendiente'. La RLS (0063) garantiza carpeta propia y que nadie se
// auto-apruebe. Devuelve un resultado (el wizard cliente maneja el redirect).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { subirArchivo, borrarArchivo } from '@/lib/storage';

const MAX = 8 * 1024 * 1024; // 8 MB por imagen

export async function enviarVerificacion(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesión no válida.' };

  const consent = String(formData.get('consentimiento') ?? '');
  if (consent !== 'true' && consent !== 'on') {
    return { ok: false as const, error: 'Debes aceptar el uso de la información para continuar.' };
  }
  const selfie = formData.get('selfie');
  const documento = formData.get('documento');
  if (!(selfie instanceof File) || selfie.size === 0) return { ok: false as const, error: 'Falta la foto en vivo (rostro + documento).' };
  if (!(documento instanceof File) || documento.size === 0) return { ok: false as const, error: 'Falta la foto del documento.' };
  if (selfie.size > MAX || documento.size > MAX) return { ok: false as const, error: 'Cada imagen debe pesar menos de 8 MB.' };

  const ts = Date.now();
  const selfiePath = `${user.id}/selfie-${ts}.jpg`;
  const ext = (documento.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const docPath = `${user.id}/doc-${ts}.${ext}`;

  try {
    await subirArchivo(supabase, 'identidad', selfiePath, selfie, { publico: false, upsert: true });
    await subirArchivo(supabase, 'identidad', docPath, documento, { publico: false, upsert: true });
  } catch (e: any) {
    await borrarArchivo(supabase, 'identidad', [selfiePath, docPath]).catch(() => {});
    return { ok: false as const, error: 'No se pudieron subir las imágenes: ' + (e?.message ?? 'error') };
  }

  const { error } = await supabase.from('verificaciones_identidad').upsert({
    perfil_id: user.id,
    estado: 'pendiente',
    selfie_path: selfiePath,
    documento_path: docPath,
    consentimiento: true,
    nota_revision: null,
    revisado_por: null,
    revisado_en: null,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'perfil_id' });
  if (error) {
    await borrarArchivo(supabase, 'identidad', [selfiePath, docPath]).catch(() => {});
    return { ok: false as const, error: 'No se pudo guardar la verificación: ' + error.message };
  }
  revalidatePath('/verificacion');
  return { ok: true as const };
}
