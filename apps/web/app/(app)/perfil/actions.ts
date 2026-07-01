'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizarWhatsapp } from '@/lib/whatsapp';
import { subirArchivo } from '@/lib/storage';

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

// Sube la foto de perfil con la sesión del usuario (RLS de Storage en 0053) y
// guarda la URL. Devuelve la URL o un error para que el componente lo muestre.
export async function subirAvatar(formData: FormData): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'No se recibió el archivo.' };
  if (!file.type.startsWith('image/')) return { error: 'Elige un archivo de imagen.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'La imagen no debe superar 5 MB.' };
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  try {
    const { publicUrl } = await subirArchivo(supabase, 'avatares', `${user.id}/avatar.${ext}`, file, { publico: true });
    const urlFinal = (publicUrl ?? '') + '?t=' + Date.now();
    const { error } = await supabase.from('perfiles').update({ avatar_url: urlFinal }).eq('id', user.id);
    if (error) return { error: 'No se pudo guardar la foto: ' + error.message };
    revalidatePath('/perfil');
    return { url: urlFinal };
  } catch (e) {
    return { error: 'No se pudo subir: ' + ((e as Error)?.message ?? 'error') };
  }
}
