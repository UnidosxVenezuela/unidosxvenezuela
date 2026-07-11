'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { animate } from 'animejs';
import { createClient } from '@/lib/supabase/client';
import { sinMovimiento } from '@/lib/anime';
import Icono from './Icono';

export default function CampanaNotificaciones() {
  const [n, setN] = useState(0);
  const iconoRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const previo = useRef<number | null>(null); // null = aún no medido (no animar en la carga inicial)

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

  // Señal de "llegó un aviso": el badge hace un pop y la campana se balancea, SOLO
  // cuando el contador sube (no en la primera medición) y si se permite el movimiento.
  useEffect(() => {
    const anterior = previo.current;
    previo.current = n;
    if (anterior === null || n <= anterior || sinMovimiento()) return;
    if (badgeRef.current) {
      animate(badgeRef.current, { scale: [0.7, 1.25, 1], duration: 460, ease: 'outQuad' });
    }
    if (iconoRef.current) {
      animate(iconoRef.current, { rotate: [0, -10, 8, -3, 0], duration: 520, ease: 'outQuad' });
    }
  }, [n]);

  return (
    <Link href="/notificaciones" className="icono-btn campana-btn"
      aria-label={n > 0 ? `Avisos (${n} sin leer)` : 'Avisos'}>
      <span ref={iconoRef} style={{ display: 'inline-flex' }}><Icono nombre="avisos" size={20} /></span>
      {n > 0 && <span ref={badgeRef} className="insignia critica campana-insignia" aria-live="polite">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
