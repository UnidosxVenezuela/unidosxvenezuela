'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { subirArchivo } from '@/lib/storage';
import { redirigirOk } from '@/lib/flash';

async function usuario() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, userId: user.id };
}

// ── Solicitudes ──
export async function crearSolicitud(formData: FormData) {
  const { supabase, userId } = await usuario();
  const titulo = String(formData.get('titulo') ?? '').trim();
  if (!titulo) throw new Error('El título es obligatorio.');
  const { data, error } = await supabase.from('solicitudes_insumo').insert({
    titulo,
    tipo: String(formData.get('tipo') ?? 'otro'),
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    cantidad: String(formData.get('cantidad') ?? '').trim() || null,
    urgencia: String(formData.get('urgencia') ?? 'media'),
    punto_id: String(formData.get('punto_id') ?? '').trim() || null,
    solicitado_por: userId,
  }).select('id').single();
  if (error) throw new Error('No se pudo crear la solicitud: ' + error.message);
  revalidatePath('/insumos');
  redirigirOk('/insumos/' + data!.id, 'Solicitud creada');
}

export async function cambiarEstadoSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const estado = String(formData.get('estado'));
  const { error } = await supabase.from('solicitudes_insumo')
    .update({ estado, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el estado: ' + error.message);
  revalidatePath('/insumos'); revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, 'Estado actualizado');
}

export async function asignarProveedorSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const proveedorId = String(formData.get('proveedor_id') ?? '').trim() || null;
  const { error } = await supabase.from('solicitudes_insumo').update({ proveedor_id: proveedorId }).eq('id', id);
  if (error) throw new Error('No se pudo asignar el proveedor: ' + error.message);
  revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, 'Proveedor asignado');
}

// Enlazar la solicitud al centro de acopio que la cubrirá (Fase 3: sugerencia del
// más cercano con existencias). La RLS (solins_update) exige puede_logistica().
export async function asignarCentroSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const puntoId = String(formData.get('punto_id') ?? '').trim() || null;
  const { error } = await supabase.from('solicitudes_insumo').update({ punto_id: puntoId }).eq('id', id);
  if (error) throw new Error('No se pudo asignar el centro: ' + error.message);
  revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, 'Centro de acopio asignado');
}

// Evidencia de entrega (Fase 3, paso 6 del flujograma): foto y/o nota que respalda
// que el recurso llegó. La RLS (solins_update) exige puede_logistica().
export async function guardarEvidenciaEntrega(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const nota = String(formData.get('nota') ?? '').trim() || null;
  const patch: Record<string, unknown> = { entrega_nota: nota, actualizado_en: new Date().toISOString() };
  const file = formData.get('evidencia');
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) throw new Error('La imagen no puede superar 8 MB.');
    if (!file.type.startsWith('image/')) throw new Error('La evidencia debe ser una imagen.');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const ruta = id + '/' + Date.now() + '.' + ext;
    const { path } = await subirArchivo(supabase, 'entregas', ruta, file, { publico: false });
    patch.entrega_evidencia_path = path;
  }
  const { error } = await supabase.from('solicitudes_insumo').update(patch).eq('id', id);
  if (error) throw new Error('No se pudo guardar la evidencia: ' + error.message);
  revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, 'Evidencia guardada');
}

export async function eliminarSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('solicitudes_insumo').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/insumos');
  redirigirOk('/insumos', 'Solicitud eliminada');
}

// ── Proveedores ──
export async function crearProveedor(formData: FormData) {
  const { supabase, userId } = await usuario();
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio.');
  const { error } = await supabase.from('proveedores').insert({
    nombre,
    tipo: String(formData.get('tipo') ?? '').trim() || null,
    contacto: String(formData.get('contacto') ?? '').trim() || null,
    notas: String(formData.get('notas') ?? '').trim() || null,
    creado_por: userId,
  });
  if (error) throw new Error('No se pudo crear el proveedor: ' + error.message);
  revalidatePath('/insumos/proveedores');
  redirigirOk('/insumos/proveedores', 'Proveedor agregado');
}

export async function eliminarProveedor(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('proveedores').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar el proveedor: ' + error.message);
  revalidatePath('/insumos/proveedores');
  redirigirOk('/insumos/proveedores', 'Proveedor eliminado');
}

// ── Envíos ──
export async function crearEnvio(formData: FormData) {
  const { supabase, userId } = await usuario();
  const solicitudId = String(formData.get('solicitud_id'));
  const fleteRaw = String(formData.get('flete') ?? '').trim();
  const { error } = await supabase.from('envios').insert({
    solicitud_id: solicitudId,
    transportista_id: String(formData.get('transportista_id') ?? '').trim() || null,
    tipo_vehiculo: String(formData.get('tipo_vehiculo') ?? '').trim() || null,
    flete: fleteRaw ? Number(fleteRaw) : null,
    origen: String(formData.get('origen') ?? '').trim() || null,
    destino: String(formData.get('destino') ?? '').trim() || null,
    notas: String(formData.get('notas') ?? '').trim() || null,
    creado_por: userId,
  });
  if (error) throw new Error('No se pudo registrar el envío: ' + error.message);
  revalidatePath('/insumos/' + solicitudId);
  redirigirOk('/insumos/' + solicitudId, 'Envío registrado');
}

export async function eliminarEnvio(formData: FormData) {
  const { supabase } = await usuario();
  const solicitudId = String(formData.get('solicitud_id'));
  const { error } = await supabase.from('envios').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar el envío: ' + error.message);
  revalidatePath('/insumos/' + solicitudId);
  redirigirOk('/insumos/' + solicitudId, 'Envío eliminado');
}

// ── Donaciones ──
// Una donación se CREA al conectar una oferta con una solicitud (ver
// conectarConSolicitud en oportunidades/actions.ts). Su lista, con seguimiento de
// estado y borrado, vive dentro de «Oportunidades de donación» (flujo unificado);
// ya no hay una sección «Donaciones» aparte ni alta directa.
export async function cambiarEstadoDonacion(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('donaciones')
    .update({ estado: String(formData.get('estado')) }).eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo actualizar: ' + error.message);
  revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades', 'Donación actualizada');
}

export async function eliminarDonacion(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('donaciones').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades', 'Donación eliminada');
}

// ── Transportistas de Logística (0159) ──
// Registro propio de conductores/transportistas que ofrecen el servicio. Alimenta el
// selector de «Conductor» al registrar un envío. Lo gestiona Logística (RLS puede_logistica).
export async function crearTransportista(formData: FormData) {
  const { supabase, userId } = await usuario();
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio.');
  const { error } = await supabase.from('transportistas_logistica').insert({
    nombre,
    contacto: String(formData.get('contacto') ?? '').trim() || null,
    vehiculo: String(formData.get('vehiculo') ?? '').trim() || null,
    notas: String(formData.get('notas') ?? '').trim() || null,
    creado_por: userId,
  });
  if (error) throw new Error('No se pudo registrar el transportista: ' + error.message);
  revalidatePath('/insumos/transportistas');
  redirigirOk('/insumos/transportistas', 'Transportista registrado');
}

export async function alternarTransportista(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const activo = String(formData.get('activo')) === 'true';
  const { error } = await supabase.from('transportistas_logistica').update({ activo }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar: ' + error.message);
  revalidatePath('/insumos/transportistas');
  redirigirOk('/insumos/transportistas', activo ? 'Transportista activado' : 'Transportista desactivado');
}

export async function eliminarTransportista(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('transportistas_logistica').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar el transportista: ' + error.message);
  revalidatePath('/insumos/transportistas');
  redirigirOk('/insumos/transportistas', 'Transportista eliminado');
}

// Registrar un transportista tomando los datos de un Donación-Ofrecimiento de transporte
// (organización → nombre, contacto y descripción). El índice único evita duplicarlo.
export async function registrarTransportistaDesdeOferta(formData: FormData) {
  const { supabase, userId } = await usuario();
  const oportunidadId = String(formData.get('oportunidad_id'));
  const { data: o } = await supabase.from('oportunidades_donacion')
    .select('organizacion, contacto, descripcion').eq('id', oportunidadId).maybeSingle();
  if (!o) throw new Error('Ofrecimiento no encontrado.');
  const { error } = await supabase.from('transportistas_logistica').insert({
    nombre: (o as any).organizacion || 'Transportista',
    contacto: (o as any).contacto || null,
    notas: (o as any).descripcion || null,
    oportunidad_id: oportunidadId,
    creado_por: userId,
  });
  if (error) {
    if ((error as any).code === '23505') throw new Error('Este ofrecimiento ya está registrado como transportista.');
    throw new Error('No se pudo registrar: ' + error.message);
  }
  revalidatePath('/insumos/oportunidades/' + oportunidadId);
  revalidatePath('/insumos/transportistas');
  redirigirOk('/insumos/oportunidades/' + oportunidadId, 'Registrado como transportista de Logística');
}
