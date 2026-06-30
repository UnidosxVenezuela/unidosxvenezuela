'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';
import type { EstadoCaso } from '@unidos/types';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }

async function exigirVerificacion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, verificado').eq('id', user.id).single();
  if (!yo || !yo.verificado || !['admin', 'coordinador', 'verificador'].includes(yo.rol)) {
    throw new Error('No tienes permisos del módulo de verificación.');
  }
  return { supabase, user };
}

export async function crearCaso(formData: FormData) {
  const { supabase, user } = await exigirVerificacion();
  const titulo = txt(formData.get('titulo'));
  if (!titulo) throw new Error('El título es obligatorio.');
  const { data, error } = await supabase.from('casos').insert({
    titulo,
    descripcion: opt(formData.get('descripcion')),
    categoria: opt(formData.get('categoria')),
    fuente: opt(formData.get('fuente')),
    fuente_url: opt(formData.get('fuente_url')),
    fecha_publicacion: opt(formData.get('fecha_publicacion')),
    asignado_a: opt(formData.get('asignado_a')),
    estado: 'en_proceso',
    creado_por: user.id,
  }).select('id').single();
  if (error) throw new Error('No se pudo crear el caso: ' + error.message);
  revalidatePath('/casos');
  redirigirOk('/casos/' + data!.id, 'Caso creado');
}

export async function cambiarEstadoCaso(formData: FormData) {
  const { supabase } = await exigirVerificacion();
  const id = txt(formData.get('caso_id'));
  const estado = txt(formData.get('estado')) as EstadoCaso;
  const { error } = await supabase.from('casos')
    .update({ estado, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el estado: ' + error.message);
  revalidatePath('/casos');
  revalidatePath('/casos/' + id);
  redirigirOk(opt(formData.get('volver')) || ('/casos/' + id), 'Estado actualizado');
}

export async function actualizarCaso(formData: FormData) {
  const { supabase } = await exigirVerificacion();
  const id = txt(formData.get('caso_id'));
  const { error } = await supabase.from('casos').update({
    asignado_a: opt(formData.get('asignado_a')),
    notas: opt(formData.get('notas')),
    actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el caso: ' + error.message);
  revalidatePath('/casos');
  revalidatePath('/casos/' + id);
  redirigirOk(opt(formData.get('volver')) || ('/casos/' + id), 'Caso actualizado');
}
