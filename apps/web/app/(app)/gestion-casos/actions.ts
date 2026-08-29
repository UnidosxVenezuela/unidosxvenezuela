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
