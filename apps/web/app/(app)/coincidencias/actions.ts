'use server';
// Confirmar o descartar una coincidencia (persona digitalizada ↔ desaparecido).
// Solo admin o Búsqueda con 2ª verificación; la RLS (0083) lo refuerza.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk, redirigirError } from '@/lib/flash';
import type { Rol } from '@unidos/types';

async function exigir() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  const esAdmin = roles.includes('admin');
  // El Admin de Verificaciones opera coincidencias como el mando (con 2ª verif).
  const esBusq = roles.includes('busqueda') || roles.includes('admin_verificacion');
  if (!esAdmin && !esBusq) throw new Error('No tienes permiso para gestionar coincidencias.');
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') throw new Error('Necesitas tu segunda verificación aprobada.');
  }
  return { supabase, user };
}

// Confirmar la coincidencia: SOLO el mando de Búsqueda, vía la función DEFINER
// (0090). Un buscador que lo intente recibe un error (el trigger lo bloquea).
export async function confirmarCoincidencia(formData: FormData) {
  const { supabase } = await exigir();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Falta la coincidencia.');
  const { error } = await supabase.rpc('confirmar_coincidencia', { p_id: id });
  if (error) redirigirError('/coincidencias', 'No se pudo confirmar: ' + error.message);
  revalidatePath('/coincidencias');
  redirigirOk('/coincidencias', 'Coincidencia confirmada');
}

// Descartar: cualquier buscador con 2ª verificación (la RLS lo permite).
export async function descartarCoincidencia(formData: FormData) {
  const { supabase, user } = await exigir();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Falta la coincidencia.');
  const { error } = await supabase.from('coincidencias').update({
    estado: 'descartada', revisado_por: user.id, revisado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar: ' + error.message);
  revalidatePath('/coincidencias');
  redirigirOk('/coincidencias', 'Coincidencia descartada');
}
