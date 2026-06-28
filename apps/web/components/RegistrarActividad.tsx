'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Cuenta automáticamente el tiempo de sesión: cada INTERVALO de uso ACTIVO
 * (pestaña visible) suma esos minutos a las horas del voluntario vía RPC.
 * El tope de 24h/día lo aplica la base de datos.
 */
const INTERVALO_MIN = 5;

export default function RegistrarActividad() {
  useEffect(() => {
    const supabase = createClient();
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      supabase.rpc('sumar_horas_sesion', { p_minutos: INTERVALO_MIN }).then(() => {}, () => {});
    };
    const id = setInterval(tick, INTERVALO_MIN * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}
