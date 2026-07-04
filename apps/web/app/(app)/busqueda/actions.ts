'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk, redirigirError } from '@/lib/flash';
import type { Rol } from '@unidos/types';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }
function num(v: FormDataEntryValue | null): number | null {
  const s = txt(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Filtro temprano por rol (admin o busqueda). La 2ª verificación (identidad) y la
// frontera fina las imponen la RLS y las funciones DEFINER de la migración 0086.
async function exigirBusqueda() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.some((r) => r === 'admin' || r === 'busqueda')) {
    throw new Error('No tienes permisos para esta acción.');
  }
  return { supabase, user };
}

// Estados que el buscador puede fijar directamente (los operativos). Las
// transiciones de cierre/mando (aprobar, reunificar, derivar, descartar) llegan
// en la Fase 3 mediante funciones SECURITY DEFINER con la puerta del mando.
const ESTADOS_OPERATIVOS = ['activo', 'en_revision', 'coincidencia_pendiente'];

// ── Intake atómico: crea el caso Desaparecido + su ficha en una transacción ──
export async function crearCasoBusqueda(formData: FormData) {
  const { supabase } = await exigirBusqueda();
  const nombre = txt(formData.get('titulo'));
  if (!nombre) redirigirError('/busqueda/nuevo', 'El nombre de la persona es obligatorio.');
  const edad = num(formData.get('edad'));
  if (edad !== null && (edad < 0 || edad > 130)) redirigirError('/busqueda/nuevo', 'La edad no es válida.');

  const { data, error } = await supabase.rpc('crear_caso_busqueda', {
    p_titulo: nombre,
    p_descripcion: opt(formData.get('descripcion')),
    p_edad: edad,
    p_sexo: opt(formData.get('sexo')),
    p_ultima_ubicacion: opt(formData.get('ultima_ubicacion')),
    p_es_nna: txt(formData.get('es_nna')) === 'on',
    p_reporta_nombre: opt(formData.get('reporta_nombre')),
    p_reporta_telefono: opt(formData.get('reporta_telefono')),
    p_fuente: opt(formData.get('fuente')),
  });
  if (error) redirigirError('/busqueda/nuevo', 'No se pudo registrar el caso: ' + error.message);
  revalidatePath('/busqueda');
  redirigirOk('/busqueda/' + (data as string), 'Caso de búsqueda registrado');
}

// «Tomar» el caso para trabajarlo (se lo asigna a sí mismo, en casos.asignado_a).
export async function tomarCasoBusqueda(formData: FormData) {
  const { supabase, user } = await exigirBusqueda();
  const casoId = txt(formData.get('caso_id'));
  const { error } = await supabase.from('casos')
    .update({ asignado_a: user.id, actualizado_en: new Date().toISOString() }).eq('id', casoId);
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo tomar el caso: ' + error.message);
  revalidatePath('/busqueda'); revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Tomaste el caso');
}

// Avance operativo del estado (activo ↔ en revisión ↔ coincidencia pendiente).
// Re-agenda la próxima revisión (SLA de seguimiento). La RLS + el trigger de
// blindaje impiden que el buscador salte a un estado de cierre/mando.
export async function cambiarEstadoBusqueda(formData: FormData) {
  const { supabase } = await exigirBusqueda();
  const casoId = txt(formData.get('caso_id'));
  const estado = txt(formData.get('estado_busqueda'));
  if (!ESTADOS_OPERATIVOS.includes(estado)) {
    redirigirError('/busqueda/' + casoId, 'Ese cambio de estado no está permitido en esta etapa.');
  }
  const { error } = await supabase.from('busqueda_casos').update({
    estado_busqueda: estado,
    proxima_revision: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
  }).eq('caso_id', casoId);
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo actualizar el estado: ' + error.message);
  revalidatePath('/busqueda'); revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Estado actualizado');
}

// ── Escalamiento y cierre (mando / Enlace). Las funciones DEFINER autorizan. ──
async function usuarioSupabase() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

// Mando: aprobar la coincidencia (pendiente → aprobada).
export async function aprobarCoincidenciaBusqueda(formData: FormData) {
  const { supabase } = await usuarioSupabase();
  const casoId = txt(formData.get('caso_id'));
  const { error } = await supabase.rpc('aprobar_coincidencia_busqueda', { p_caso: casoId });
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo aprobar: ' + error.message);
  revalidatePath('/busqueda'); revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Coincidencia aprobada. Pasa al Enlace para la llamada.');
}

// Mando: derivar un NNA a la autoridad (aprobada → derivado_autoridad).
export async function derivarAutoridadBusqueda(formData: FormData) {
  const { supabase } = await usuarioSupabase();
  const casoId = txt(formData.get('caso_id'));
  const { error } = await supabase.rpc('derivar_autoridad_busqueda', { p_caso: casoId });
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo derivar: ' + error.message);
  revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Caso derivado a la autoridad.');
}

// Mando: actualizar custodia/autoridad de un NNA.
export async function actualizarCustodiaNna(formData: FormData) {
  const { supabase } = await usuarioSupabase();
  const casoId = txt(formData.get('caso_id'));
  const { error } = await supabase.rpc('actualizar_custodia_nna', {
    p_caso: casoId,
    p_custodia: txt(formData.get('custodia_verificada')) === 'on',
    p_autoridad: txt(formData.get('autoridad_notificada')) === 'on',
  });
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo actualizar: ' + error.message);
  revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Custodia/autoridad actualizadas.');
}

// Mando: reunificar un NNA (derivado_autoridad → reunificado; exige custodia+autoridad).
export async function reunificarNnaBusqueda(formData: FormData) {
  const { supabase } = await usuarioSupabase();
  const casoId = txt(formData.get('caso_id'));
  const { error } = await supabase.rpc('reunificar_nna_busqueda', { p_caso: casoId });
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo reunificar: ' + error.message);
  revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Menor reunificado.');
}

// Mando: cerrar (descartado / encontrado_fallecido).
export async function cerrarBusqueda(formData: FormData) {
  const { supabase } = await usuarioSupabase();
  const casoId = txt(formData.get('caso_id'));
  const { error } = await supabase.rpc('cerrar_busqueda', {
    p_caso: casoId, p_estado: txt(formData.get('estado')), p_nota: opt(formData.get('nota')),
  });
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo cerrar: ' + error.message);
  revalidatePath('/busqueda'); revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Caso cerrado.');
}

// Enlace: registrar la llamada de confirmación (aprobada → reunificado, NO-NNA).
export async function registrarContactoBusqueda(formData: FormData) {
  const { supabase } = await usuarioSupabase();
  const casoId = txt(formData.get('caso_id'));
  const { error } = await supabase.rpc('registrar_contacto_busqueda', {
    p_caso: casoId, p_resultado: opt(formData.get('resultado')),
  });
  if (error) redirigirError('/busqueda/enlace', 'No se pudo registrar: ' + error.message);
  revalidatePath('/busqueda/enlace');
  redirigirOk('/busqueda/enlace', 'Llamada registrada. Caso reunificado.');
}

// ── Bitácora confidencial (solo el asignado del caso o el mando) ──
export async function agregarBitacoraBusqueda(formData: FormData) {
  const { supabase, user } = await exigirBusqueda();
  const casoId = txt(formData.get('caso_id'));
  const contenido = txt(formData.get('contenido'));
  if (!contenido) redirigirError('/busqueda/' + casoId, 'La nota no puede estar vacía.');
  const { error } = await supabase.from('bitacora_busqueda').insert({
    caso_id: casoId,
    autor_id: user.id,
    contenido,
    fuente: opt(formData.get('fuente')),
    resultado: opt(formData.get('resultado')),
    tipo: opt(formData.get('tipo')),
  });
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo guardar la nota: ' + error.message);
  revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Nota registrada');
}

export async function eliminarBitacoraBusqueda(formData: FormData) {
  const { supabase } = await exigirBusqueda();
  const casoId = txt(formData.get('caso_id'));
  const { error } = await supabase.from('bitacora_busqueda').delete().eq('id', txt(formData.get('id')));
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudo eliminar la nota: ' + error.message);
  revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Nota eliminada');
}

// ── Catálogo de fuentes (gestión: solo el mando; la RLS lo exige) ──
export async function crearFuente(formData: FormData) {
  const { supabase } = await exigirBusqueda();
  const nombre = txt(formData.get('nombre'));
  if (!nombre) redirigirError('/busqueda/recursos', 'El nombre de la fuente es obligatorio.');
  const { error } = await supabase.from('fuentes_verificacion').insert({
    nombre,
    descripcion: opt(formData.get('descripcion')),
    url: opt(formData.get('url')),
    categoria: opt(formData.get('categoria')),
    para_nna: txt(formData.get('para_nna')) === 'on',
    orden: num(formData.get('orden')) ?? 0,
  });
  if (error) redirigirError('/busqueda/recursos', 'No se pudo agregar la fuente: ' + error.message);
  revalidatePath('/busqueda/recursos');
  redirigirOk('/busqueda/recursos', 'Fuente agregada');
}

export async function eliminarFuente(formData: FormData) {
  const { supabase } = await exigirBusqueda();
  const { error } = await supabase.from('fuentes_verificacion').delete().eq('id', txt(formData.get('id')));
  if (error) redirigirError('/busqueda/recursos', 'No se pudo eliminar: ' + error.message);
  revalidatePath('/busqueda/recursos');
  redirigirOk('/busqueda/recursos', 'Fuente eliminada');
}

// Editar los datos estructurados de la ficha (edad, sexo, ubicación, reporte, NNA).
export async function editarFichaBusqueda(formData: FormData) {
  const { supabase } = await exigirBusqueda();
  const casoId = txt(formData.get('caso_id'));
  const edad = num(formData.get('edad'));
  if (edad !== null && (edad < 0 || edad > 130)) redirigirError('/busqueda/' + casoId, 'La edad no es válida.');
  const { error } = await supabase.from('busqueda_casos').update({
    edad,
    sexo: opt(formData.get('sexo')),
    ultima_ubicacion: opt(formData.get('ultima_ubicacion')),
    es_nna: txt(formData.get('es_nna')) === 'on',
    reporta_nombre: opt(formData.get('reporta_nombre')),
    reporta_telefono: opt(formData.get('reporta_telefono')),
    fuente_verifico: opt(formData.get('fuente_verifico')),
  }).eq('caso_id', casoId);
  if (error) redirigirError('/busqueda/' + casoId, 'No se pudieron guardar los datos: ' + error.message);
  revalidatePath('/busqueda/' + casoId);
  redirigirOk('/busqueda/' + casoId, 'Datos actualizados');
}
