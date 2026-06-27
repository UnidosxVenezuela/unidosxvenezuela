'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function actualizarPerfil(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.from('perfiles').update({
    nombre_completo: String(formData.get('nombre') ?? ''),
    telefono: (String(formData.get('telefono') ?? '') || null),
    organizacion: (String(formData.get('organizacion') ?? '') || null),
  }).eq('id', user.id);

  if (error) throw new Error('No se pudo guardar el perfil: ' + error.message);
  revalidatePath('/perfil');
  redirect('/perfil?guardado=1');
}
