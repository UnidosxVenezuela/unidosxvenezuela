'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { esAdministrador } from '@/lib/auth';
import type { NivelSensibilidad } from '@unidos/types';

function txt(v: FormDataEntryValue | null): string { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null): string | null { const s = txt(v); return s ? s : null; }

// El tablón es un canal interno de administración: la RLS ya lo exige, pero lo
// re-chequeamos aquí (una Server Action es un endpoint invocable directamente).
async function exigirAdminTablon(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  if (!esAdministrador(perfil as any)) throw new Error('El tablón es solo para administración.');
  return user;
}

export async function crearPublicacion(formData: FormData) {
  const supabase = await createClient();
  const user = await exigirAdminTablon(supabase);

  const contenido = txt(formData.get('contenido'));
  if (!contenido) return;

  const { error } = await supabase.from('publicaciones').insert({
    autor_id: user.id,
    contenido,
    sensibilidad: (txt(formData.get('sensibilidad')) || 'interna') as NivelSensibilidad,
    grupo_id: opt(formData.get('grupo_id')),
  });
  if (error) throw new Error('No se pudo publicar: ' + error.message);
  revalidatePath('/tablon');
}

export async function comentarPublicacion(formData: FormData) {
  const supabase = await createClient();
  const user = await exigirAdminTablon(supabase);

  const contenido = txt(formData.get('contenido'));
  if (!contenido) return;

  const { error } = await supabase.from('comentarios_publicacion').insert({
    publicacion_id: txt(formData.get('publicacion_id')),
    autor_id: user.id,
    contenido,
  });
  if (error) throw new Error('No se pudo comentar: ' + error.message);
  revalidatePath('/tablon');
}
