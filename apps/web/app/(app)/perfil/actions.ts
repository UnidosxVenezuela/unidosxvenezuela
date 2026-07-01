'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizarWhatsapp } from '@/lib/whatsapp';

export async function actualizarPerfil(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Habilidades: limpia, sin vacíos ni duplicados, máximo 30.
  const habilidades = Array.from(new Set(
    formData.getAll('habilidades').map((h) => String(h).trim()).filter(Boolean),
  )).slice(0, 30);

  // WhatsApp: dígitos con código de país (o vacío para quitarlo).
  const whatsappRaw = String(formData.get('whatsapp') ?? '').trim();
  const whatsapp = whatsappRaw ? normalizarWhatsapp(whatsappRaw) : null;
  if (whatsappRaw && !whatsapp) throw new Error('El WhatsApp debe incluir el código de país (solo dígitos).');

  const { error } = await supabase.from('perfiles').update({
    nombre_completo: String(formData.get('nombre') ?? ''),
    telefono: (String(formData.get('telefono') ?? '') || null),
    whatsapp,
    organizacion: (String(formData.get('organizacion') ?? '') || null),
    habilidades,
  }).eq('id', user.id);

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Ese número de WhatsApp ya está registrado por otra cuenta.');
    }
    throw new Error('No se pudo guardar el perfil: ' + error.message);
  }
  revalidatePath('/perfil');
  redirect('/perfil?guardado=1');
}
