import type { EstadoCaso as TEstadoCaso } from '@unidos/types';
import { ETIQUETA_ESTADO_CASO } from '@/lib/constantes';
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

/** Insignia de estado de caso. */
export default function EstadoCaso({ estado }: { estado: TEstadoCaso }) {
  return <Pill tono={TONO[estado] ?? 'neutra'}>{ETIQUETA_ESTADO_CASO[estado]}</Pill>;
}
