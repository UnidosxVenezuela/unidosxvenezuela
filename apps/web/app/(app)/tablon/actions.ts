'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { NivelSensibilidad } from '@unidos/types';

function txt(v: FormDataEntryValue | null): string { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null): string | null { const s = txt(v); return s ? s : null; }

export async function crearPublicacion(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

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
