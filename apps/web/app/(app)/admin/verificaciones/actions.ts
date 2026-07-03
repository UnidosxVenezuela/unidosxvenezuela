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
  const { data: fila, error } = await supabase.from('verificaciones_identidad').update({
    estado: 'aprobada', nota_revision: null,
    revisado_por: user.id, revisado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
  }).eq('id', String(formData.get('id'))).select('perfil_id').single();
  if (error) throw new Error('No se pudo aprobar: ' + error.message);
  // La notificación a la persona la dispara el trigger (0077); aquí, la auditoría.
  if (fila?.perfil_id) await supabase.rpc('registrar_auditoria', { p_accion: 'verificacion_aprobada', p_entidad_id: fila.perfil_id, p_metadata: {} });
  revalidatePath('/admin/verificaciones');
}

export async function rechazarVerificacion(formData: FormData) {
  const { supabase, user } = await exigirAdmin();
  const nota = String(formData.get('nota') ?? '').trim() || null;
  const { data: fila, error } = await supabase.from('verificaciones_identidad').update({
    estado: 'rechazada', nota_revision: nota,
    revisado_por: user.id, revisado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
  }).eq('id', String(formData.get('id'))).select('perfil_id').single();
  if (error) throw new Error('No se pudo rechazar: ' + error.message);
  if (fila?.perfil_id) await supabase.rpc('registrar_auditoria', { p_accion: 'verificacion_rechazada', p_entidad_id: fila.perfil_id, p_metadata: { nota } });
  revalidatePath('/admin/verificaciones');
}
