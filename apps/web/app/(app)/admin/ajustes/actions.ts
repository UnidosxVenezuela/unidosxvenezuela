'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk, redirigirError } from '@/lib/flash';

// Guarda el link del grupo de WhatsApp de Redacción (0188). El permiso (admin
// general) y el guardado los hace la RPC set_ajuste; aquí solo se valida el formato.
export async function guardarWhatsappGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const valor = String(formData.get('valor') ?? '').trim();
  // Vacío = limpiar el ajuste. Si hay valor, exige un link de WhatsApp válido.
  if (valor && !/^https?:\/\/(chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com)\//i.test(valor)) {
    return redirigirError('/admin/ajustes', 'Pega un enlace de grupo de WhatsApp válido (chat.whatsapp.com/…).');
  }
  const { error } = await supabase.rpc('set_ajuste', { p_clave: 'whatsapp_grupo_difusion', p_valor: valor || null });
  if (error) {
    const m = (error.message || '').toLowerCase();
    if (error.code === 'PGRST202' || /set_ajuste|schema cache|no existe la funci/.test(m)) {
      return redirigirError('/admin/ajustes', 'Aún no disponible (falta aplicar la migración 0188).');
    }
    return redirigirError('/admin/ajustes', 'No se pudo guardar: ' + error.message);
  }
  revalidatePath('/admin/ajustes'); revalidatePath('/envio-redaccion');
  redirigirOk('/admin/ajustes', 'Ajuste guardado');
}
