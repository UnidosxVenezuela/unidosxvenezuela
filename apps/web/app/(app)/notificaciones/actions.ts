'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function marcarLeida(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from('notificaciones')
    .update({ leida: true }).eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo marcar como leída: ' + error.message);
  revalidatePath('/notificaciones');
}

export async function marcarTodasLeidas() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.from('notificaciones')
    .update({ leida: true }).eq('leida', false);
  if (error) throw new Error('No se pudo actualizar: ' + error.message);
  revalidatePath('/notificaciones');
}
