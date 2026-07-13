'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import { validarArchivo } from '@/lib/validaciones';
import type { EstadoTarea, Prioridad } from '@unidos/types';

function txt(v: FormDataEntryValue | null): string { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null): string | null { const s = txt(v); return s ? s : null; }
function num(v: FormDataEntryValue | null): number | null {
  const s = txt(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null;
}

// ¿La persona `p` pertenece al grupo `g` (miembro o su líder)? Espeja el trigger 0101
// para dar un mensaje claro antes de intentar el INSERT/UPDATE.
async function esDelGrupo(supabase: any, g: string, p: string): Promise<boolean> {
  const { count } = await supabase.from('miembros_grupo')
    .select('*', { count: 'exact', head: true }).eq('grupo_id', g).eq('perfil_id', p);
  if ((count ?? 0) > 0) return true;
  const { data: gr } = await supabase.from('grupos').select('lider_id').eq('id', g).single();
  return gr?.lider_id === p;
}

export async function crearTarea(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const grupoElegido = opt(formData.get('grupo_id'));
  const asignadoA = opt(formData.get('asignado_a'));
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const rolesYo = [yo?.rol, ...(((yo?.roles_extra as (Prioridad | string)[] | null) ?? []))] as string[];
  const esAdmin = rolesYo.includes('admin');

  // Autorización precisa (igual que la RLS): el admin en cualquier grupo; el resto
  // SOLO en un grupo que lidera o coordina (evita el error críptico de la RLS).
  if (!esAdmin) {
    if (!grupoElegido) throw new Error('Elige el grupo de la tarea.');
    const { data: puede } = await supabase.rpc('puede_publicar_en_grupo', { g: grupoElegido });
    if (puede !== true) throw new Error('Solo puedes crear tareas en un grupo que lideras o coordinas.');
  }
  // La asignación debe ser de un miembro del propio grupo (el trigger 0101 lo blinda).
  if (asignadoA && grupoElegido && !(await esDelGrupo(supabase, grupoElegido, asignadoA))) {
    throw new Error('Solo puedes asignar la tarea a un miembro del grupo.');
  }

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
  const estado = txt(formData.get('estado')) as EstadoTarea;

  // Dar una tarea por COMPLETADA la confirma un MANDO (admin, coordinación o el líder del
  // grupo), no cualquiera que pueda editar. Espeja la regla de la UI y cierra el hueco de
  // que el asignado/creador la cierre por una petición directa (la RLS sí les deja editar).
  if (estado === 'completada') {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user?.id ?? '').maybeSingle();
    const roles = [(yo as any)?.rol, ...(((yo as any)?.roles_extra as string[] | null) ?? [])];
    const { data: t } = await supabase.from('tareas').select('grupo_id, grupos(lider_id)').eq('id', id).maybeSingle();
    const esLider = !!(t as any)?.grupos?.lider_id && (t as any).grupos.lider_id === user?.id;
    if (!(roles.includes('admin') || roles.includes('coordinador') || esLider)) {
      throw new Error('Solo la coordinación o el líder del grupo pueden dar una tarea por completada.');
    }
  }

  const { error } = await supabase.from('tareas').update({ estado }).eq('id', id);
  if (error) throw new Error('No se pudo cambiar el estado: ' + error.message);
  revalidatePath('/tareas/' + id);
  revalidatePath('/tareas');
  redirigirOk(opt(formData.get('volver')) || ('/tareas/' + id), 'Estado actualizado');
}

export async function actualizarAsignacion(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('tarea_id'));
  const asignado = opt(formData.get('asignado_a'));
  const { data: t } = await supabase.from('tareas').select('grupo_id, estado').eq('id', id).single();
  // Reasignar solo a un miembro del propio grupo de la tarea (el trigger 0101 lo blinda).
  if (asignado && t?.grupo_id && !(await esDelGrupo(supabase, t.grupo_id, asignado))) {
    throw new Error('Solo puedes asignar la tarea a un miembro del grupo.');
  }
  const cambios: Record<string, unknown> = {
    asignado_a: asignado,
    prioridad: txt(formData.get('prioridad')) as Prioridad,
  };
  // Al asignar una tarea que estaba 'pendiente', pásala a 'asignada' (consistente con
  // crearTarea y tomar_tarea, para que el estado refleje que ya tiene responsable).
  if (asignado && (t as any)?.estado === 'pendiente') cambios.estado = 'asignada' as EstadoTarea;
  const { error } = await supabase.from('tareas').update(cambios).eq('id', id);
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
  redirigirOk('/tareas', '¡Gracias por sumarte! 💛 Ya estás en esta tarea.');
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
  const val = validarArchivo(file.name, file.size, 25);  // lista blanca de tipos (no svg/html/exe)
  if (!val.ok) return { error: val.motivo };
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
