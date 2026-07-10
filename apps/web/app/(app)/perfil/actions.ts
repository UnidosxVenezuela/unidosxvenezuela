'use server';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizarWhatsapp } from '@/lib/whatsapp';
import { subirArchivo } from '@/lib/storage';
import { PAISES } from '@/lib/constantes';

// Minutos que vale un enlace de vinculación de Telegram (un solo uso).
const TELEGRAM_VIGENCIA_MIN = 15;

// Latido de presencia (0117): refresca `ultima_conexion` mientras la pestaña está
// abierta y, si se pasa, fija el estado elegido (conectado/ocupado). Ligero y silencioso.
export async function latido(estado?: 'conectado' | 'ocupado') {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const patch: Record<string, unknown> = { ultima_conexion: new Date().toISOString() };
  if (estado === 'conectado' || estado === 'ocupado') patch.estado_presencia = estado;
  await supabase.from('perfiles').update(patch).eq('id', user.id);
}

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

  // País: solo se acepta un código conocido de la lista (o vacío para quitarlo).
  const paisRaw = String(formData.get('pais') ?? '').trim();
  const pais = PAISES.some((p) => p.codigo === paisRaw) ? paisRaw : null;

  const opt = (k: string) => (String(formData.get(k) ?? '').trim() || null);
  const { error } = await supabase.from('perfiles').update({
    nombre_completo: String(formData.get('nombre') ?? ''),
    telefono: (String(formData.get('telefono') ?? '') || null),
    whatsapp,
    organizacion: (String(formData.get('organizacion') ?? '') || null),
    pais,
    habilidades,
    // Ficha del voluntario (0115): la propia persona la completa.
    ciudad: opt('ciudad'),
    disponibilidad: opt('disponibilidad'),
    horas_semana: opt('horas_semana'),
    experiencia: opt('experiencia'),
    contacto_emergencia: opt('contacto_emergencia'),
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

// ── Telegram (canal de avisos, 0139) ──
// Genera un enlace profundo de un solo uso `t.me/<bot>?start=<token>`. La
// persona lo abre y pulsa Start; el webhook valida el token y vincula su chat.
export async function crearEnlaceTelegram(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT;
  if (!bot) return { error: 'El canal de Telegram aún no está configurado.' };

  // Un solo enlace vigente por persona: borra los previos (RLS: solo los suyos).
  await supabase.from('telegram_enlaces').delete().eq('perfil_id', user.id);

  // Token corto, seguro y admisible en el deep-link de Telegram ([A-Za-z0-9_-]).
  const token = randomBytes(9).toString('base64url');
  const expira = new Date(Date.now() + TELEGRAM_VIGENCIA_MIN * 60_000).toISOString();
  const { error } = await supabase.from('telegram_enlaces').insert({
    token, perfil_id: user.id, expira_en: expira,
  });
  if (error) return { error: 'No se pudo generar el enlace: ' + error.message };
  return { url: `https://t.me/${bot}?start=${token}` };
}

// Corta la vinculación desde la app (RLS: auto-edición del propio perfil; los
// campos de Telegram no están en la lista negra de `proteger_campos_perfil`).
export async function desvincularTelegram() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  await supabase.from('perfiles')
    .update({ telegram_chat_id: null, telegram_username: null })
    .eq('id', user.id);
  revalidatePath('/perfil');
}
