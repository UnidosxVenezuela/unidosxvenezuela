'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { esEnlaceWhatsappValido, esEnlaceHttpsValido } from '@/lib/constantes';

function whatsappOpcional(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (!esEnlaceWhatsappValido(s)) throw new Error('El enlace de WhatsApp debe ser https (wa.me, chat.whatsapp.com o api.whatsapp.com).');
  return s;
}

export async function crearGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('grupos').insert({
    nombre: String(formData.get('nombre') ?? ''),
    area: String(formData.get('area') ?? ''),
    descripcion: (String(formData.get('descripcion') ?? '') || null),
    whatsapp: whatsappOpcional(formData.get('whatsapp')),
  }).select('id').single();

  if (error) throw new Error('No se pudo crear el grupo: ' + error.message);
  revalidatePath('/grupos');
  redirect('/grupos/' + data!.id);
}

export async function guardarWhatsappGrupo(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('grupos')
    .update({ whatsapp: whatsappOpcional(formData.get('whatsapp')) }).eq('id', grupoId);
  if (error) throw new Error('No se pudo guardar el WhatsApp: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
}

export async function programarReunion(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const enlace = String(formData.get('enlace') ?? '').trim();
  if (!esEnlaceHttpsValido(enlace)) throw new Error('El enlace de la videollamada debe ser https.');
  const duracion = Number(formData.get('duracion_min')) || 60;
  const { error } = await supabase.from('reuniones').insert({
    grupo_id: grupoId,
    titulo: String(formData.get('titulo') ?? '').trim() || 'Reunión',
    enlace,
    inicio: String(formData.get('inicio') ?? ''),
    duracion_min: duracion,
    creado_por: user.id,
  });
  if (error) throw new Error('No se pudo programar la reunión: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
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
