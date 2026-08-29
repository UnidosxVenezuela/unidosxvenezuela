'use server';
// Acciones del Gestor Integral de Casos (0239).
//
// Todas van por RPC `security definer`: `casos_update` NO se tocó a propósito —es la policy
// más peleada del repositorio— y abrirle una rama al gestor para escribir una frase y una
// fecha habría sido pagar un riesgo enorme por dos campos. El permiso vive en la RPC.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk, redirigirError } from '@/lib/flash';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }

/** Mensaje de la base de datos tal cual: las RPC de 0239 ya explican qué pasó. */
function motivo(e: { message?: string } | null, porDefecto: string) {
  const m = (e?.message || '').trim();
  return m || porDefecto;
}

export async function asignarGestor(formData: FormData) {
  const supabase = await createClient();
  const caso = txt(formData.get('caso'));
  const gestor = txt(formData.get('gestor'));
  const volver = txt(formData.get('volver')) || '/gestion-casos';
  if (!caso || !gestor) return redirigirError(volver, 'Falta la solicitud o la persona.');

  const { error } = await supabase.rpc('asignar_gestor_caso', { p_caso: caso, p_gestor: gestor });
  if (error) return redirigirError(volver, motivo(error, 'No se pudo asignar el gestor.'));

  revalidatePath('/gestion-casos');
  revalidatePath('/casos');
  return redirigirOk(volver, 'Gestor asignado.');
}

export async function quitarGestor(formData: FormData) {
  const supabase = await createClient();
  const caso = txt(formData.get('caso'));
  const volver = txt(formData.get('volver')) || '/gestion-casos';
  if (!caso) return redirigirError(volver, 'Falta la solicitud.');

  const { error } = await supabase.rpc('quitar_gestor_caso', {
    p_caso: caso, p_motivo: txt(formData.get('motivo')) || null,
  });
  if (error) return redirigirError(volver, motivo(error, 'No se pudo quitar el gestor.'));

  revalidatePath('/gestion-casos');
  revalidatePath('/casos');
  return redirigirOk(volver, 'El caso quedó sin gestor. Aparecerá en «Sin responsable».');
}

export async function fijarSeguimiento(formData: FormData) {
  const supabase = await createClient();
  const caso = txt(formData.get('caso'));
  const accion = txt(formData.get('accion'));
  const volver = txt(formData.get('volver')) || '/gestion-casos';
  if (!caso) return redirigirError(volver, 'Falta la solicitud.');
  if (!accion) return redirigirError(volver, 'Escribe qué es lo próximo que hay que hacer.');

  // `datetime-local` llega sin zona horaria; se deja que el navegador la resuelva y si
  // viene vacío la RPC pone la que toque por urgencia (24 h / 48 h / 72 h / 7 días).
  const fecha = txt(formData.get('proxima'));
  const area = txt(formData.get('area'));

  const { error } = await supabase.rpc('fijar_seguimiento_caso', {
    p_caso: caso,
    p_accion: accion,
    p_proxima: fecha ? new Date(fecha).toISOString() : null,
    p_area: area || null,
  });
  if (error) return redirigirError(volver, motivo(error, 'No se pudo guardar el seguimiento.'));

  revalidatePath('/gestion-casos');
  revalidatePath('/casos');
  return redirigirOk(volver, 'Próxima acción guardada.');
}

// ── Solicitudes de información (0240) ──
// Los cinco campos que pide la propuesta: qué dato, a quién, por qué, para cuándo y qué
// desbloquea. La autorización vive en la RPC; aquí solo se recogen y se devuelve el motivo
// tal cual, que ya viene escrito para una persona.

export async function pedirInfo(formData: FormData) {
  const supabase = await createClient();
  const caso = txt(formData.get('caso'));
  const dato = txt(formData.get('dato'));
  const volver = txt(formData.get('volver')) || '/gestion-casos';
  if (!caso) return redirigirError(volver, 'Falta la solicitud.');
  if (!dato) return redirigirError(volver, 'Di qué dato o evidencia hace falta.');

  const area = txt(formData.get('area'));
  const responsable = txt(formData.get('responsable'));
  if (!area && !responsable) {
    return redirigirError(volver, 'Indica a quién se le pide: una persona, un área, o las dos.');
  }
  const vence = txt(formData.get('vence'));

  const { error } = await supabase.rpc('pedir_info_caso', {
    p_caso: caso,
    p_dato: dato,
    p_motivo: txt(formData.get('motivo')) || null,
    p_resultado: txt(formData.get('resultado')) || null,
    p_area: area || null,
    p_responsable: responsable || null,
    p_vence: vence ? new Date(vence).toISOString() : null,
  });
  if (error) return redirigirError(volver, motivo(error, 'No se pudo pedir la información.'));

  revalidatePath('/gestion-casos');
  revalidatePath('/casos');
  return redirigirOk(volver, 'Petición enviada. Le llega el aviso a quien le toca.');
}

export async function responderInfo(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('id'));
  const respuesta = txt(formData.get('respuesta'));
  const volver = txt(formData.get('volver')) || '/gestion-casos';
  if (!id) return redirigirError(volver, 'Falta la petición.');
  if (!respuesta) return redirigirError(volver, 'Escribe la respuesta.');

  const { error } = await supabase.rpc('responder_info_caso', { p_id: id, p_respuesta: respuesta });
  if (error) return redirigirError(volver, motivo(error, 'No se pudo guardar la respuesta.'));

  revalidatePath('/gestion-casos');
  revalidatePath('/casos');
  return redirigirOk(volver, 'Respuesta enviada.');
}

export async function cerrarInfo(formData: FormData) {
  const supabase = await createClient();
  const id = txt(formData.get('id'));
  const volver = txt(formData.get('volver')) || '/gestion-casos';
  if (!id) return redirigirError(volver, 'Falta la petición.');

  const { error } = await supabase.rpc('cerrar_info_caso', {
    p_id: id, p_nota: txt(formData.get('nota')) || null,
  });
  if (error) return redirigirError(volver, motivo(error, 'No se pudo cerrar la petición.'));

  revalidatePath('/gestion-casos');
  revalidatePath('/casos');
  return redirigirOk(volver, 'Petición cerrada.');
}
