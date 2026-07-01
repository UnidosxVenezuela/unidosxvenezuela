'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';
import { esEnlaceWhatsappValido, esEnlaceHttpsValido } from '@/lib/constantes';
import type { Rol } from '@unidos/types';

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
    abierto: String(formData.get('visibilidad')) !== 'privado',
  }).select('id').single();

  if (error) throw new Error('No se pudo crear el grupo: ' + error.message);
  revalidatePath('/grupos');
  redirigirOk('/grupos/' + data!.id, 'Grupo creado');
}

export async function guardarWhatsappGrupo(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('grupos')
    .update({ whatsapp: whatsappOpcional(formData.get('whatsapp')) }).eq('id', grupoId);
  if (error) throw new Error('No se pudo guardar el WhatsApp: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'WhatsApp guardado');
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
  redirigirOk('/grupos/' + grupoId, 'Reunión programada');
}

export async function fijarMensaje(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const contenido = String(formData.get('contenido') ?? '').trim();
  if (!contenido) throw new Error('El mensaje no puede estar vacío.');
  if (contenido.length > 2000) throw new Error('El mensaje es demasiado largo (máx. 2000).');
  // Adjunto opcional (ya subido al bucket 'grupos' por el cliente).
  const adjPath = String(formData.get('adjunto_path') ?? '').trim() || null;
  const adjTipo = String(formData.get('adjunto_tipo') ?? '').trim() || null;
  const adjNombre = String(formData.get('adjunto_nombre') ?? '').trim() || null;
  // La RLS exige ser líder del grupo / coordinación; si no, devuelve error.
  const { error } = await supabase.from('mensajes_fijados').insert({
    grupo_id: grupoId, autor_id: user.id, contenido,
    adjunto_path: adjPath, adjunto_tipo: adjTipo, adjunto_nombre: adjNombre,
  });
  if (error) throw new Error('No se pudo fijar el mensaje: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
}

export async function desfijarMensaje(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const mensajeId = String(formData.get('mensaje_id'));
  const { data: row } = await supabase.from('mensajes_fijados')
    .select('adjunto_path').eq('id', mensajeId).single();
  const { error } = await supabase.from('mensajes_fijados').delete().eq('id', mensajeId);
  if (error) throw new Error('No se pudo quitar el mensaje: ' + error.message);
  if (row?.adjunto_path) await supabase.storage.from('grupos').remove([row.adjunto_path]);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Anuncio quitado');
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
  redirigirOk('/grupos/' + grupoId, 'Miembro agregado');
}

export async function quitarMiembro(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('miembros_grupo').delete()
    .eq('grupo_id', grupoId)
    .eq('perfil_id', String(formData.get('perfil_id')));
  if (error) throw new Error('No se pudo quitar el miembro: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Miembro quitado');
}

export async function unirmeGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  // La RLS solo permite auto-unirse a grupos abiertos (y no vetados).
  const { error } = await supabase.from('miembros_grupo')
    .insert({ grupo_id: grupoId, perfil_id: user.id });
  if (error) throw new Error('No se pudo unir al grupo: ' + error.message);
  revalidatePath('/grupos');
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Te uniste al grupo');
}

export async function cambiarVisibilidadGrupo(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const abierto = String(formData.get('abierto')) === 'true';
  const { error } = await supabase.from('grupos').update({ abierto }).eq('id', grupoId);
  if (error) throw new Error('No se pudo cambiar la visibilidad: ' + error.message);
  revalidatePath('/grupos');
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, abierto ? 'Grupo ahora abierto' : 'Grupo ahora privado');
}

export async function banearMiembro(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const perfilId = String(formData.get('perfil_id'));
  // La RLS exige líder del grupo o coordinación.
  const { error } = await supabase.from('miembros_baneados')
    .insert({ grupo_id: grupoId, perfil_id: perfilId, baneado_por: user.id });
  if (error) throw new Error('No se pudo vetar: ' + error.message);
  await supabase.from('miembros_grupo').delete().eq('grupo_id', grupoId).eq('perfil_id', perfilId);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Persona vetada del grupo');
}

export async function desbanearMiembro(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('miembros_baneados').delete()
    .eq('grupo_id', grupoId).eq('perfil_id', String(formData.get('perfil_id')));
  if (error) throw new Error('No se pudo quitar el veto: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Veto levantado');
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
  redirigirOk('/grupos/' + grupoId, 'Líder actualizado');
}

// Asigna roles ADICIONALES de la cadena de contenido a un miembro (o a uno
// mismo). La autorización real la hace la función asignar_roles_contenido:
// coordinación a cualquiera; un líder solo a voluntarios o a sí mismo, y solo
// roles de la cadena de contenido. Facilita sumar gente al flujo de trabajo.
export async function asignarRolesContenido(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const perfilId = String(formData.get('perfil_id'));
  const roles = Array.from(new Set(formData.getAll('roles').map(String)));
  const { error } = await supabase.rpc('asignar_roles_contenido', { p_perfil: perfilId, p_roles: roles });
  if (error) throw new Error('No se pudieron asignar los roles: ' + error.message);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_roles_extra', p_entidad_id: perfilId, p_metadata: { roles, via: 'grupo' },
  });
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Roles de contenido actualizados');
}

// Eliminar un grupo: SOLO administradores (la RLS 0049 también lo exige). Borra
// el grupo y su contenido en cascada; las tareas se conservan sin grupo.
export async function eliminarGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin')) throw new Error('Solo un administrador puede eliminar grupos.');

  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('grupos').delete().eq('id', grupoId);
  if (error) throw new Error('No se pudo eliminar el grupo: ' + error.message);
  revalidatePath('/grupos');
  redirigirOk('/grupos', 'Grupo eliminado');
}
