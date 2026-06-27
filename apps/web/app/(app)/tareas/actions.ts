'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

  const asignadoA = opt(formData.get('asignado_a'));
  const { data, error } = await supabase.from('tareas').insert({
    titulo: txt(formData.get('titulo')),
    descripcion: opt(formData.get('descripcion')),
    prioridad: (txt(formData.get('prioridad')) || 'media') as Prioridad,
    estado: (asignadoA ? 'asignada' : 'pendiente') as EstadoTarea,
    grupo_id: opt(formData.get('grupo_id')),
    asignado_a: asignadoA,
    creado_por: user.id,
    vence_en: opt(formData.get('vence_en')),
    lat: num(formData.get('lat')),
    lng: num(formData.get('lng')),
  }).select('id').single();

  if (error) throw new Error('No se pudo crear la tarea: ' + error.message);
  revalidatePath('/tareas');
  redirect('/tareas/' + data!.id);
}

export async function cambiarEstado(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('tarea_id'));
  const { error } = await supabase.from('tareas')
    .update({ estado: txt(formData.get('estado')) as EstadoTarea }).eq('id', id);
  if (error) throw new Error('No se pudo cambiar el estado: ' + error.message);
  revalidatePath('/tareas/' + id);
  revalidatePath('/tareas');
}

export async function actualizarAsignacion(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('tarea_id'));
  const { error } = await supabase.from('tareas').update({
    asignado_a: opt(formData.get('asignado_a')),
    prioridad: txt(formData.get('prioridad')) as Prioridad,
  }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar la tarea: ' + error.message);
  revalidatePath('/tareas/' + id);
  revalidatePath('/tareas');
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
