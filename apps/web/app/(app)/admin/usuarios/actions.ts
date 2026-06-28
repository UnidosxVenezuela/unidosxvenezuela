'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Rol } from '@unidos/types';

async function exigirCoordinacion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol').eq('id', user.id).single();
  if (!yo || !['admin', 'coordinador'].includes(yo.rol)) {
    throw new Error('No tienes permisos de coordinación.');
  }
  return supabase;
}

export async function cambiarVerificacion(formData: FormData) {
  const supabase = await exigirCoordinacion();
  const perfilId = String(formData.get('perfil_id'));
  const verificado = String(formData.get('verificado')) === 'true';
  const { error } = await supabase.from('perfiles')
    .update({ verificado }).eq('id', perfilId);
  if (error) throw new Error('No se pudo actualizar la verificación: ' + error.message);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_verificacion', p_entidad_id: perfilId, p_metadata: { valor: verificado },
  });
  revalidatePath('/admin/usuarios');
}

export async function cambiarRol(formData: FormData) {
  const supabase = await exigirCoordinacion();
  const perfilId = String(formData.get('perfil_id'));
  const rol = String(formData.get('rol')) as Rol;
  const { error } = await supabase.from('perfiles')
    .update({ rol }).eq('id', perfilId);
  if (error) throw new Error('No se pudo cambiar el rol: ' + error.message);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_rol', p_entidad_id: perfilId, p_metadata: { valor: rol },
  });
  revalidatePath('/admin/usuarios');
}
