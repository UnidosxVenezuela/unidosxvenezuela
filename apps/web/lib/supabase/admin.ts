// Cliente Supabase con service_role: SOLO en el servidor (Server Actions /
// Route Handlers). Salta RLS — usar con cuidado y nunca exponer al cliente.
// Lo usa el panel de administración (crear/eliminar usuarios, resetear
// contraseña): esas operaciones REQUIEREN la service key de verdad.
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Falta configurar SUPABASE_SERVICE_ROLE_KEY (la service_role, no la anon) en las variables ' +
      'de entorno del servidor (Vercel → Settings → Environment Variables, entorno Production).',
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
