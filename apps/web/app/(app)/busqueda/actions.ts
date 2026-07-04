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
