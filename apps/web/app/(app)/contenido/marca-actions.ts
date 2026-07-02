'use server';
// Lineamientos de marca (logo, colores, tipografía) para alinear a todos los
// grupos de contenido. Solo el admin los edita; el pipeline los ve (RLS 0064).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { esAdministrador } from '@/lib/auth';
import { redirigirOk } from '@/lib/flash';

function opt(v: FormDataEntryValue | null) { const s = String(v ?? '').trim(); return s ? s : null; }

export async function guardarLineamientos(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  if (!esAdministrador(yo as any)) throw new Error('Solo un administrador edita los lineamientos de marca.');

  const { error } = await supabase.from('lineamientos_marca').update({
    logo_url: opt(formData.get('logo_url')),
    paleta: opt(formData.get('paleta')),
    tipografia: opt(formData.get('tipografia')),
    notas: opt(formData.get('notas')),
    actualizado_por: user.id,
    actualizado_en: new Date().toISOString(),
  }).eq('id', 1);
  if (error) throw new Error('No se pudieron guardar los lineamientos: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk('/contenido', 'Lineamientos de marca actualizados');
}
