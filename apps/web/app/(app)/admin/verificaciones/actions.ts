'use server';
// Revisión de la segunda verificación por un administrador (aprobar/rechazar).
// La RLS (0063) permite al admin actualizar el estado.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { esAdministrador } from '@/lib/auth';

async function exigirAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  if (!esAdministrador(yo as any)) throw new Error('Solo un administrador puede revisar verificaciones.');
  return { supabase, user };
}

export async function aprobarVerificacion(formData: FormData) {
  const { supabase, user } = await exigirAdmin();
  const { error } = await supabase.from('verificaciones_identidad').update({
    estado: 'aprobada', nota_revision: null,
    revisado_por: user.id, revisado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
  }).eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo aprobar: ' + error.message);
  revalidatePath('/admin/verificaciones');
}

export async function rechazarVerificacion(formData: FormData) {
  const { supabase, user } = await exigirAdmin();
  const nota = String(formData.get('nota') ?? '').trim() || null;
  const { error } = await supabase.from('verificaciones_identidad').update({
    estado: 'rechazada', nota_revision: nota,
    revisado_por: user.id, revisado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
  }).eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo rechazar: ' + error.message);
  revalidatePath('/admin/verificaciones');
}
