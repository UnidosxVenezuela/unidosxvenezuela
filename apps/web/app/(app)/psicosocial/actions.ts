'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }

async function usuario() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, userId: user.id };
}

// ── Solicitud / caso ──
// Cualquier persona verificada puede REGISTRAR una solicitud (detección en campo).
// La coordinación psicosocial la triará y asignará a un profesional.
export async function crearAcompanamiento(formData: FormData) {
  const { supabase, userId } = await usuario();
  const persona = txt(formData.get('persona'));
  if (!persona) throw new Error('Indica el nombre o alias de la persona.');
  const { data, error } = await supabase.from('acompanamientos').insert({
    persona,
    contacto: opt(formData.get('contacto')),
    tipo: txt(formData.get('tipo')) || 'otro',
    motivo: opt(formData.get('motivo')),
    riesgo: txt(formData.get('riesgo')) || 'media',
    estado: 'solicitado',
    creado_por: userId,
  }).select('id').single();
  if (error) throw new Error('No se pudo registrar la solicitud: ' + error.message);
  revalidatePath('/psicosocial');
  redirigirOk('/psicosocial/' + data!.id, 'Solicitud registrada');
}

// Asignar un profesional (coordinación psicosocial). La RLS y el trigger de aviso
// hacen el resto. Al asignar, el caso pasa a «asignado» si estaba solicitado.
export async function asignarAcompanamiento(formData: FormData) {
  const { supabase } = await usuario();
  const id = txt(formData.get('id'));
  const asignadoA = opt(formData.get('asignado_a'));
  const patch: Record<string, unknown> = { asignado_a: asignadoA, actualizado_en: new Date().toISOString() };
  const { data: actual } = await supabase.from('acompanamientos').select('estado').eq('id', id).single();
  if (asignadoA && actual?.estado === 'solicitado') patch.estado = 'asignado';
  const { error } = await supabase.from('acompanamientos').update(patch).eq('id', id);
  if (error) throw new Error('No se pudo asignar: ' + error.message);
  revalidatePath('/psicosocial'); revalidatePath('/psicosocial/' + id);
  redirigirOk('/psicosocial/' + id, asignadoA ? 'Profesional asignado' : 'Asignación quitada');
}

// Un profesional toma un caso sin asignar (autoasignación).
export async function tomarAcompanamiento(formData: FormData) {
  const { supabase, userId } = await usuario();
  const id = txt(formData.get('id'));
  const { error } = await supabase.from('acompanamientos')
    .update({ asignado_a: userId, estado: 'asignado', actualizado_en: new Date().toISOString() })
    .eq('id', id).is('asignado_a', null);
  if (error) throw new Error('No se pudo tomar el caso: ' + error.message);
  revalidatePath('/psicosocial'); revalidatePath('/psicosocial/' + id);
  redirigirOk('/psicosocial/' + id, 'Tomaste el caso');
}

// Avance de estado (asignado → en_acompanamiento → seguimiento). El cierre va aparte.
export async function cambiarEstadoAcomp(formData: FormData) {
  const { supabase } = await usuario();
  const id = txt(formData.get('id'));
  const estado = txt(formData.get('estado'));
  const patch: Record<string, unknown> = { estado, actualizado_en: new Date().toISOString() };
  if (estado === 'cerrado') patch.cerrado_en = new Date().toISOString();
  const { error } = await supabase.from('acompanamientos').update(patch).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el estado: ' + error.message);
  revalidatePath('/psicosocial'); revalidatePath('/psicosocial/' + id);
  redirigirOk('/psicosocial/' + id, 'Estado actualizado');
}

// Cerrar el caso con una nota de cierre.
export async function cerrarAcompanamiento(formData: FormData) {
  const { supabase } = await usuario();
  const id = txt(formData.get('id'));
  const { error } = await supabase.from('acompanamientos').update({
    estado: 'cerrado', notas_cierre: opt(formData.get('notas_cierre')),
    cerrado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo cerrar el caso: ' + error.message);
  revalidatePath('/psicosocial'); revalidatePath('/psicosocial/' + id);
  redirigirOk('/psicosocial/' + id, 'Caso cerrado');
}

export async function actualizarRiesgo(formData: FormData) {
  const { supabase } = await usuario();
  const id = txt(formData.get('id'));
  const { error } = await supabase.from('acompanamientos')
    .update({ riesgo: txt(formData.get('riesgo')), actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el riesgo: ' + error.message);
  revalidatePath('/psicosocial/' + id);
  redirigirOk('/psicosocial/' + id, 'Nivel de riesgo actualizado');
}

// ── Bitácora confidencial ──
export async function agregarBitacora(formData: FormData) {
  const { supabase, userId } = await usuario();
  const acompId = txt(formData.get('acompanamiento_id'));
  const contenido = txt(formData.get('contenido'));
  if (!contenido) throw new Error('La nota no puede estar vacía.');
  const { error } = await supabase.from('bitacora_psicosocial').insert({
    acompanamiento_id: acompId, autor_id: userId,
    contenido, tipo_contacto: opt(formData.get('tipo_contacto')),
  });
  if (error) throw new Error('No se pudo guardar la nota: ' + error.message);
  revalidatePath('/psicosocial/' + acompId);
}

export async function eliminarBitacora(formData: FormData) {
  const { supabase } = await usuario();
  const acompId = txt(formData.get('acompanamiento_id'));
  const { error } = await supabase.from('bitacora_psicosocial').delete().eq('id', txt(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar la nota: ' + error.message);
  revalidatePath('/psicosocial/' + acompId);
}

// Eliminar el caso: solo coordinación psicosocial (la RLS lo exige).
export async function eliminarAcompanamiento(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('acompanamientos').delete().eq('id', txt(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/psicosocial');
  redirigirOk('/psicosocial', 'Caso eliminado');
}

// ── Recursos / líneas de crisis (coordinación psicosocial) ──
export async function crearRecurso(formData: FormData) {
  const { supabase } = await usuario();
  const titulo = txt(formData.get('titulo'));
  if (!titulo) throw new Error('El título es obligatorio.');
  const { error } = await supabase.from('recursos_psicosocial').insert({
    titulo,
    descripcion: opt(formData.get('descripcion')),
    telefono: opt(formData.get('telefono')),
    url: opt(formData.get('url')),
  });
  if (error) throw new Error('No se pudo agregar el recurso: ' + error.message);
  revalidatePath('/psicosocial/recursos');
  redirigirOk('/psicosocial/recursos', 'Recurso agregado');
}

export async function eliminarRecurso(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('recursos_psicosocial').delete().eq('id', txt(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/psicosocial/recursos');
  redirigirOk('/psicosocial/recursos', 'Recurso eliminado');
}
