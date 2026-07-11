'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate } from 'animejs';
import type { EstadoCaso as TEstadoCaso } from '@unidos/types';
import { ETIQUETA_ESTADO_CASO } from '@/lib/constantes';
import { sinMovimiento } from '@/lib/anime';
import Pill, { type TonoPill } from './Pill';

// Estado del caso como Pill (un solo sistema de insignias de estado en la app).
const TONO: Record<TEstadoCaso, TonoPill> = {
  pendiente: 'neutra',   // sin asignar / pendiente de revisión
  en_proceso: 'aviso',   // ya tomado / en progreso
  confirmado: 'ok',
  falso: 'critica',
  enviado_redaccion: 'info',
  resuelto: 'ok',        // atendido / entregado — ciclo cerrado
};

/** Insignia de estado de caso. Hace un "pop" sutil cuando el estado CAMBIA (por una
 *  acción o por tiempo real), no en cada render/refresco. Respeta reduced-motion. */
export default function EstadoCaso({ estado }: { estado: TEstadoCaso }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previo = useRef<TEstadoCaso | null>(null); // null = aún no medido (no animar al montar)

  useLayoutEffect(() => {
    const cambio = previo.current !== null && previo.current !== estado;
    previo.current = estado;
    if (!cambio || sinMovimiento() || !ref.current) return;
    animate(ref.current, { scale: [0.8, 1.12, 1], duration: 460, ease: 'outQuad' });
  }, [estado]);

  return (
    <span ref={ref} style={{ display: 'inline-flex' }}>
      <Pill tono={TONO[estado] ?? 'neutra'}>{ETIQUETA_ESTADO_CASO[estado]}</Pill>
    </span>
  );
}
