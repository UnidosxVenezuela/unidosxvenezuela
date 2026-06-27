// Fábrica de cliente Supabase reutilizable (web y móvil).
// Cada app pasa su propia URL/anon key y, en móvil, el storage de sesión.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface UnidosClientOptions {
  url: string;
  anonKey: string;
  // En React Native pasa AsyncStorage; en web puedes omitirlo.
  authStorage?: unknown;
}

export function crearClienteUnidos(opts: UnidosClientOptions): SupabaseClient {
  return createClient(opts.url, opts.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      ...(opts.authStorage ? { storage: opts.authStorage as never } : {}),
    },
  });
}

export type { SupabaseClient };
