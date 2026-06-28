// Cliente Supabase con service_role: SOLO en el servidor (Server Actions /
// Route Handlers). Salta RLS — usar con cuidado y nunca exponer al cliente.
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
