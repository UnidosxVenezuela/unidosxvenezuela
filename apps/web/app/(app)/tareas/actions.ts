'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import type { EstadoTarea, Prioridad } from '@unidos/types';

function txt(v: FormDataEntryValue | null): string { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null): string | null { const s = txt(v); return s ? s : null; }
function num(v: FormDataEntryValue | null): number | null {
  const s = txt(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null;
}

export async function crearTarea(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Solo admin/coordinador/líder pueden crear tareas.
  const { data: yo } = await supabase.from('perfiles').select('rol').eq('id', user.id).single();
  if (!yo || !['admin', 'coordinador', 'lider_grupo'].includes(yo.rol)) {
    throw new Error('No tienes permisos para crear tareas.');
  }

  const asignadoA = opt(formData.get('asignado_a'));
  const { data, error } = await supabase.from('tareas').insert({
    titulo: txt(formData.get('titulo')),
    descripcion: opt(formData.get('descripcion')),
    categoria: (txt(formData.get('categoria')) || 'general'),
    prioridad: (txt(formData.get('prioridad')) || 'media') as Prioridad,
    estado: (asignadoA ? 'asignada' : 'pendiente') as EstadoTarea,
    grupo_id: opt(formData.get('grupo_id')),
    asignado_a: asignadoA,
    cupo: num(formData.get('cupo')), // null = sin límite (se trata como 1)
    creado_por: user.id,
    vence_en: opt(formData.get('vence_en')),
    ubicacion: opt(formData.get('ubicacion')),
    lat: num(formData.get('lat')),
    lng: num(formData.get('lng')),
  }).select('id').single();

  if (error) throw new Error('No se pudo crear la tarea: ' + error.message);
  // El asignado inicial cuenta como participante (para el cupo).
  if (asignadoA) await supabase.from('tarea_personas').insert({ tarea_id: data!.id, perfil_id: asignadoA });
  revalidatePath('/tareas');
  redirigirOk('/tareas/' + data!.id, 'Tarea creada');
}

export async function cambiarEstado(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('tarea_id'));
  const { error } = await supabase.from('tareas')
    .update({ estado: txt(formData.get('estado')) as EstadoTarea }).eq('id', id);
  if (error) throw new Error('No se pudo cambiar el estado: ' + error.message);
  revalidatePath('/tareas/' + id);
  revalidatePath('/tareas');
  redirigirOk(opt(formData.get('volver')) || ('/tareas/' + id), 'Estado actualizado');
}

export async function actualizarAsignacion(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('tarea_id'));
  const asignado = opt(formData.get('asignado_a'));
  const { error } = await supabase.from('tareas').update({
    asignado_a: asignado,
    prioridad: txt(formData.get('prioridad')) as Prioridad,
  }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar la tarea: ' + error.message);
  // El responsable asignado también cuenta como participante (para el cupo).
  if (asignado) await supabase.from('tarea_personas').upsert({ tarea_id: id, perfil_id: asignado }, { onConflict: 'tarea_id,perfil_id', ignoreDuplicates: true });
  revalidatePath('/tareas/' + id);
  revalidatePath('/tareas');
  redirigirOk(opt(formData.get('volver')) || ('/tareas/' + id), 'Cambios guardados');
}

export async function tomarTarea(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('tarea_id'));
  const { error } = await supabase.rpc('tomar_tarea', { p_tarea: id });
  if (error) throw new Error(error.message);
  revalidatePath('/tareas');
  revalidatePath('/tareas/' + id);
}

export async function liberarTarea(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('tarea_id'));
  const { error } = await supabase.rpc('liberar_tarea', { p_tarea: id });
  if (error) throw new Error(error.message);
  revalidatePath('/tareas');
  revalidatePath('/tareas/' + id);
}

export async function agregarEnlace(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const id = txt(formData.get('tarea_id'));
  let url = txt(formData.get('url'));
  const nombre = txt(formData.get('nombre')) || url;
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!/^https:\/\/\S+$/i.test(url)) throw new Error('Enlace no válido (debe ser https).');

  const clase = (txt(formData.get('clase')) === 'entregable') ? 'entregable' : 'material';
  const { error } = await supabase.from('adjuntos_tarea').insert({
    tarea_id: id, tipo: 'enlace', clase, url, nombre, mime: null, creado_por: user.id,
  });
  if (error) throw new Error('No se pudo agregar el enlace: ' + error.message);
  revalidatePath('/tareas/' + id);
}

// Sube un adjunto de tarea con la sesión del usuario (RLS de Storage en 0053) y
// crea la fila en adjuntos_tarea. clase: 'material' | 'entregable'.
export async function subirAdjuntoTarea(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const tareaId = txt(formData.get('tarea_id'));
  const clase = txt(formData.get('clase')) || 'material';
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'No se recibió el archivo.' };
  if (file.size > 25 * 1024 * 1024) return { error: 'El archivo no debe superar 25 MB.' };
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `${tareaId}/${Date.now()}-${safe}`;
  try {
    await subirArchivo(supabase, 'adjuntos', path, file, { publico: false, upsert: false });
  } catch (e) { return { error: 'No se pudo subir: ' + ((e as Error)?.message ?? 'error') }; }
  const tipo = file.type.startsWith('image/') ? 'imagen' : 'documento';
  const { error } = await supabase.from('adjuntos_tarea').insert({
    tarea_id: tareaId, tipo, clase, url: path, nombre: file.name, mime: file.type || null, creado_por: user.id,
  });
  if (error) {
    await borrarArchivo(supabase, 'adjuntos', [path]);
    return { error: 'No se pudo registrar: ' + error.message };
  }
  revalidatePath('/tareas/' + tareaId);
  return {};
}

export async function eliminarAdjunto(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('tarea_id'));
  const adjuntoId = txt(formData.get('adjunto_id'));

  const { data: adj } = await supabase.from('adjuntos_tarea')
    .select('tipo, url').eq('id', adjuntoId).single();

  // Borrar el OBJETO con la sesión del usuario.
  if (adj && adj.tipo !== 'enlace' && adj.url) {
    await borrarArchivo(supabase, 'adjuntos', [adj.url]);
  }
  const { error } = await supabase.from('adjuntos_tarea').delete().eq('id', adjuntoId);
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/tareas/' + id);
}

export async function agregarComentario(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('tarea_id'));
  const contenido = txt(formData.get('contenido'));
  if (!contenido) return;
  const { error } = await supabase.from('comentarios_tarea')
    .insert({ tarea_id: id, autor_id: user.id, contenido });
  if (error) throw new Error('No se pudo comentar: ' + error.message);
  revalidatePath('/tareas/' + id);
}
