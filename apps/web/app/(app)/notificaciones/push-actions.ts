'use server';
// Server Actions para las suscripciones push del navegador.
// La RLS (migración 0060) garantiza que solo se guarden filas con
// perfil_id = auth.uid(); el perfil_id se toma de la sesión, no del cliente.
import { createClient } from '@/lib/supabase/server';

export type Suscripcion = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

/** Guarda (o actualiza) la suscripción push de este navegador para el usuario. */
export async function guardarSuscripcion(sub: Suscripcion) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesión no válida.' };
  if (!sub?.endpoint || !sub.p256dh || !sub.auth) {
    return { ok: false as const, error: 'Suscripción incompleta.' };
  }
  const { error } = await supabase.from('push_suscripciones').upsert(
    {
      perfil_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

/** Elimina la suscripción de este navegador (al desactivar los avisos). */
export async function borrarSuscripcion(endpoint: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesión no válida.' };
  const { error } = await supabase.from('push_suscripciones')
    .delete().eq('endpoint', endpoint);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
