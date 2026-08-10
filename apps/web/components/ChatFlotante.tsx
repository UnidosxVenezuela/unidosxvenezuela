'use client';
// Acceso flotante a las conversaciones (0231/0233), abajo a la derecha.
//
// Tiene su propio carril: `.consejo` y `.toast` se apartan hacia arriba con la variable
// --fab-hueco de globals.css, para que nunca se tapen entre sí.
//
// El número de sin leer llega del servidor y se mantiene vivo por Realtime: cuando entra
// un mensaje que esta persona puede leer, sube solo. No se resta aquí — bajar el
// contador es cosa del servidor cuando se marca el hilo como leído.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { animate, createSpring } from 'animejs';
import { createClient } from '@/lib/supabase/client';
import { sinMovimiento } from '@/lib/anime';
import Icono from './Icono';

export default function ChatFlotante({ sinLeerInicial, miId }: { sinLeerInicial: number; miId: string }) {
  const pathname = usePathname();
  const [sinLeer, setSinLeer] = useState(sinLeerInicial);
  const botonRef = useRef<HTMLAnchorElement | null>(null);
  const insigniaRef = useRef<HTMLSpanElement | null>(null);
  const montado = useRef(false);

  // El servidor manda: al navegar, su número es el bueno.
  useEffect(() => { setSinLeer(sinLeerInicial); }, [sinLeerInicial]);

  // Realtime sin filtro: la RLS de `hilo_mensajes` ya decide qué llega, así que solo se
  // reciben mensajes de hilos que esta persona puede leer.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel('chat-flotante')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hilo_mensajes' }, (payload: any) => {
        if (payload?.new?.autor_id === miId) return;   // lo mío no cuenta como pendiente
        setSinLeer((n) => n + 1);
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [miId]);

  // Entrada con resorte, y un rebote corto cada vez que sube el contador: es la única
  // señal de que llegó algo cuando no estás mirando esta esquina.
  useEffect(() => {
    const el = botonRef.current;
    if (!el || sinMovimiento()) return;
    if (!montado.current) {
      montado.current = true;
      const a = animate(el, { opacity: [0, 1], scale: [0.8, 1], duration: 600, ease: createSpring({ stiffness: 120 }) });
      return () => { a.revert(); };
    }
    const ins = insigniaRef.current;
    if (!ins || sinLeer === 0) return;
    const a = animate(ins, { scale: [1, 1.25, 1], duration: 420, ease: createSpring({ stiffness: 180 }) });
    return () => { a.revert(); };
  }, [sinLeer]);

  // En la bandeja sobra: ya estás dentro.
  if (pathname?.startsWith('/conversaciones')) return null;

  const etiqueta = sinLeer > 0
    ? 'Conversaciones — ' + sinLeer + (sinLeer === 1 ? ' mensaje sin leer' : ' mensajes sin leer')
    : 'Conversaciones';

  return (
    <Link
      ref={botonRef}
      href="/conversaciones"
      className={'fab-chat' + (sinLeer > 0 ? ' fab-chat-pendiente' : '')}
      aria-label={etiqueta}
      title={etiqueta}
    >
      <Icono nombre="conversacion" size={24} />
      {sinLeer > 0 && (
        <span ref={insigniaRef} className="fab-chat-insignia" aria-hidden="true">
          {sinLeer > 99 ? '99+' : sinLeer}
        </span>
      )}
      {/* El número también se anuncia a un lector de pantalla, sin duplicar el aria-label. */}
      <span className="sr-solo" role="status" aria-live="polite">
        {sinLeer > 0 ? sinLeer + (sinLeer === 1 ? ' mensaje sin leer' : ' mensajes sin leer') : ''}
      </span>
    </Link>
  );
}
