'use server';
// Buzón de problemas e ideas (migración 0234).
// Escritura solo por RPC: la tabla no publica policy de INSERT ni de UPDATE.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk, redirigirError } from '@/lib/flash';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return supabase;
}

export async function enviarSugerencia(formData: FormData) {
  const tipo = txt(formData.get('tipo'));
  const mensaje = txt(formData.get('mensaje'));
  const ruta = txt(formData.get('ruta'));
  const volver = txt(formData.get('volver')) || '/dashboard';

  if (!mensaje) redirigirError(volver, 'Escribe qué pasó o qué se te ocurre.');

  const supabase = await ctx();
  const { error } = await supabase.rpc('enviar_sugerencia', {
    p_tipo: tipo === 'idea' ? 'idea' : 'problema',
    p_mensaje: mensaje,
    p_ruta: ruta || null,
  });
  if (error) redirigirError(volver, 'No se pudo enviar: ' + error.message);

  revalidatePath('/sugerencias');
  revalidatePath('/admin/sugerencias');
  redirigirOk(volver, tipo === 'idea'
    ? 'Gracias. Tu idea llegó a coordinación.'
    : 'Gracias por avisar. Coordinación ya lo tiene.');
}

export async function atenderSugerencia(formData: FormData) {
  const id = txt(formData.get('id'));
  const estado = txt(formData.get('estado'));
  const nota = txt(formData.get('nota'));

  const supabase = await ctx();
  const { error } = await supabase.rpc('atender_sugerencia', {
    p_id: id, p_estado: estado, p_nota: nota || null,
  });
  if (error) redirigirError('/admin/sugerencias', 'No se pudo guardar: ' + error.message);

  revalidatePath('/admin/sugerencias');
  redirigirOk('/admin/sugerencias', 'Reporte actualizado.');
}
