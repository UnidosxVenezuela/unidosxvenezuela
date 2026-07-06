'use client';
import { useEffect, useState, useTransition } from 'react';
import { latido } from '@/app/(app)/perfil/actions';

/**
 * Interruptor de presencia en la barra superior (junto a la campana). La persona se
 * pone «Conectado» u «Ocupado»; mientras la pestaña esté abierta, un latido cada 60s
 * mantiene fresca `ultima_conexion`. Si deja de latir, los demás la ven «desconectado»
 * (eso lo calcula el servidor con `presenciaEfectiva`).
 */
export default function Presencia({ estadoInicial = 'conectado' }: { estadoInicial?: string | null }) {
  const [estado, setEstado] = useState<'conectado' | 'ocupado'>(estadoInicial === 'ocupado' ? 'ocupado' : 'conectado');
  const [, startTransition] = useTransition();

  useEffect(() => {
    const ping = () => startTransition(() => { latido(); });
    ping(); // al entrar, marca conexión de inmediato
    const t = setInterval(() => { if (document.visibilityState === 'visible') ping(); }, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ocupado = estado === 'ocupado';
  const alternar = () => {
    const nuevo: 'conectado' | 'ocupado' = ocupado ? 'conectado' : 'ocupado';
    setEstado(nuevo);
    startTransition(() => { latido(nuevo); });
  };

  return (
    <button
      type="button"
      className="presencia-btn"
      onClick={alternar}
      aria-label={'Tu estado: ' + (ocupado ? 'Ocupado' : 'Conectado') + '. Toca para cambiar.'}
      title={ocupado ? 'Estás Ocupado — toca para ponerte Conectado' : 'Estás Conectado — toca para ponerte Ocupado'}
    >
      <span className={'presencia-punto ' + (ocupado ? 'ocupado' : 'conectado')} aria-hidden />
      <span className="presencia-txt">{ocupado ? 'Ocupado' : 'Conectado'}</span>
    </button>
  );
}
