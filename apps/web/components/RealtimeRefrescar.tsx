'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Se suscribe a cambios de una tabla y refresca la vista (router.refresh()).
 * Uso: <RealtimeRefrescar tabla="tareas" />  o con filtro: filtro="id=eq.<uuid>"
 */
export default function RealtimeRefrescar({
  tabla,
  filtro,
}: {
  tabla: string;
  filtro?: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel('rt-' + tabla + '-' + (filtro ?? 'all'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [tabla, filtro, router]);
  return null;
}
