'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';

export async function registrarHoras(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const horas = Number(formData.get('horas'));
  if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
    throw new Error('Indica un número de horas entre 0 y 24.');
  }
  const fecha = String(formData.get('fecha') ?? '').trim() || undefined;
  const { error } = await supabase.from('registro_horas').insert({
    perfil_id: user.id,
    horas,
    descripcion: (String(formData.get('descripcion') ?? '').trim() || null),
    ...(fecha ? { fecha } : {}),
  });
  if (error) throw new Error('No se pudo registrar: ' + error.message);
  revalidatePath('/horas');
  revalidatePath('/dashboard');
  redirigirOk('/horas', 'Horas registradas');
}

export async function eliminarHoras(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from('registro_horas').delete()
    .eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/horas');
  revalidatePath('/dashboard');
  redirigirOk('/horas', 'Registro eliminado');
}
