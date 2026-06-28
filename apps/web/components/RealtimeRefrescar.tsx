'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Se suscribe a cambios de una tabla y refresca la vista (router.refresh()),
 * con DEBOUNCE: ráfagas de cambios se juntan en un solo refresh para no
 * provocar tormentas de refetch cuando hay muchos usuarios conectados.
 * Uso: <RealtimeRefrescar tabla="tareas" />  o acotado: filtro="id=eq.<uuid>"
 */
export default function RealtimeRefrescar({
  tabla,
  filtro,
  esperaMs = 1500,
}: {
  tabla: string;
  filtro?: string;
  esperaMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refrescarDebounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), esperaMs);
    };
    const canal = supabase
      .channel('rt-' + tabla + '-' + (filtro ?? 'all'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
        refrescarDebounced,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [tabla, filtro, esperaMs, router]);
  return null;
}
