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

export async function solicitarGrupo(formData: FormData) {
  const { supabase, userId } = await usuario();
  const { error } = await supabase.from('solicitudes_acceso').insert({
    perfil_id: userId, tipo: 'grupo', grupo_id: String(formData.get('grupo_id')),
    mensaje: String(formData.get('mensaje') ?? '').trim() || null,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya tienes una solicitud pendiente para ese grupo.');
    throw new Error('No se pudo enviar la solicitud: ' + error.message);
  }
  revalidatePath('/acceso');
  redirigirOk('/acceso', 'Solicitud enviada');
}

export async function solicitarRol(formData: FormData) {
  const { supabase, userId } = await usuario();
  const { error } = await supabase.from('solicitudes_acceso').insert({
    perfil_id: userId, tipo: 'rol', rol: String(formData.get('rol')),
    mensaje: String(formData.get('mensaje') ?? '').trim() || null,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Ya tienes una solicitud pendiente para esa sección.');
    throw new Error('No se pudo enviar la solicitud: ' + error.message);
  }
  revalidatePath('/acceso');
  redirigirOk('/acceso', 'Solicitud enviada');
}

export async function cancelarSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('solicitudes_acceso').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo cancelar: ' + error.message);
  revalidatePath('/acceso');
  redirigirOk('/acceso', 'Solicitud cancelada');
}

// Aprobar/rechazar (líder del grupo o coordinación/admin). La función valida el
// permiso y, al aprobar, agrega la membresía o el rol.
export async function resolverSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const aprobar = String(formData.get('aprobar')) === 'true';
  const volver = String(formData.get('volver') ?? '/admin/solicitudes');
  const { error } = await supabase.rpc('resolver_solicitud_acceso', { p_solicitud: String(formData.get('id')), p_aprobar: aprobar });
  if (error) throw new Error('No se pudo resolver la solicitud: ' + error.message);
  revalidatePath(volver);
  redirigirOk(volver, aprobar ? 'Solicitud aprobada' : 'Solicitud rechazada');
}
