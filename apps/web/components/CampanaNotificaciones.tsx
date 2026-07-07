'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Icono from './Icono';

export default function CampanaNotificaciones() {
  const [n, setN] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let activo = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !activo) return;
      const cargar = async () => {
        const { count } = await supabase
          .from('notificaciones')
          .select('*', { count: 'exact', head: true })
          .eq('leida', false);
        if (activo) setN(count ?? 0);
      };
      await cargar();
      canal = supabase
        .channel('notif-' + user.id)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notificaciones', filter: 'destinatario_id=eq.' + user.id },
          cargar,
        )
        .subscribe();
    })();

    return () => { activo = false; if (canal) supabase.removeChannel(canal); };
  }, []);

  return (
    <Link href="/notificaciones" className="icono-btn campana-btn"
      aria-label={n > 0 ? `Avisos (${n} sin leer)` : 'Avisos'}>
      <Icono nombre="avisos" size={20} />
      {n > 0 && <span className="insignia critica campana-insignia" aria-live="polite">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
