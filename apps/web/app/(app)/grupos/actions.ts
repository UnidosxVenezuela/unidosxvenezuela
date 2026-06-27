'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function crearGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('grupos').insert({
    nombre: String(formData.get('nombre') ?? ''),
    area: String(formData.get('area') ?? ''),
    descripcion: (String(formData.get('descripcion') ?? '') || null),
  }).select('id').single();

  if (error) throw new Error('No se pudo crear el grupo: ' + error.message);
  revalidatePath('/grupos');
  redirect('/grupos/' + data!.id);
}

export async function agregarMiembro(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('miembros_grupo').insert({
    grupo_id: grupoId,
    perfil_id: String(formData.get('perfil_id')),
  });
  if (error) throw new Error('No se pudo agregar el miembro: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
}

export async function quitarMiembro(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('miembros_grupo').delete()
    .eq('grupo_id', grupoId)
    .eq('perfil_id', String(formData.get('perfil_id')));
  if (error) throw new Error('No se pudo quitar el miembro: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
}

export async function asignarLider(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const perfilId = String(formData.get('perfil_id'));
  // Asegura pertenencia y marca rol de líder
  await supabase.from('miembros_grupo')
    .upsert({ grupo_id: grupoId, perfil_id: perfilId, rol_en_grupo: 'lider' });
  const { error } = await supabase.from('grupos')
    .update({ lider_id: perfilId }).eq('id', grupoId);
  if (error) throw new Error('No se pudo asignar el líder: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
}
