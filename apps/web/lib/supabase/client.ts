// Cliente Supabase para componentes de cliente ('use client').
import { createBrowserClient } from '@supabase/ssr';

// detectSessionInUrl=false en /actualizar-clave: ahí canjeamos el ?code= a mano
// para controlar errores y evitar la carrera con la auto-detección.
export function createClient(opts?: { detectSessionInUrl?: boolean }) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl: opts?.detectSessionInUrl ?? true } },
  );
}
