'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
    voluntario_id: String(formData.get('voluntario_id') ?? '').trim() || null,
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
export async function crearDonacion(formData: FormData) {
  const { supabase, userId } = await usuario();
  const donante = String(formData.get('donante') ?? '').trim();
  if (!donante) throw new Error('El nombre del donante es obligatorio.');
  const montoRaw = String(formData.get('monto') ?? '').trim();
  const { error } = await supabase.from('donaciones').insert({
    donante,
    tipo: String(formData.get('tipo') ?? 'especie'),
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    monto: montoRaw ? Number(montoRaw) : null,
    solicitud_id: String(formData.get('solicitud_id') ?? '').trim() || null,
    creado_por: userId,
  });
  if (error) throw new Error('No se pudo registrar la donación: ' + error.message);
  revalidatePath('/insumos/donaciones');
  redirigirOk('/insumos/donaciones', 'Donación registrada');
}

export async function cambiarEstadoDonacion(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('donaciones')
    .update({ estado: String(formData.get('estado')) }).eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo actualizar: ' + error.message);
  revalidatePath('/insumos/donaciones');
  redirigirOk('/insumos/donaciones', 'Donación actualizada');
}

export async function eliminarDonacion(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('donaciones').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/insumos/donaciones');
  redirigirOk('/insumos/donaciones', 'Donación eliminada');
}
