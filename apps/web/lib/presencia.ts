// Presencia del usuario (0117). El estado EFECTIVO se calcula a partir del último
// latido: si no hubo latido reciente, la persona está «desconectado» aunque su
// elección guardada sea conectado/ocupado.

export type Presencia = 'conectado' | 'ocupado' | 'desconectado';

// Ventana de gracia: si el último latido es más viejo que esto, = desconectado.
// El latido se envía cada ~60s, así que 5 min tolera algún fallo puntual.
const UMBRAL_MS = 5 * 60 * 1000;

export function presenciaEfectiva(estado?: string | null, ultima?: string | null): Presencia {
  if (!ultima) return 'desconectado';
  const ms = Date.now() - new Date(ultima).getTime();
  if (!Number.isFinite(ms) || ms > UMBRAL_MS) return 'desconectado';
  return estado === 'ocupado' ? 'ocupado' : 'conectado';
}

export const ETIQUETA_PRESENCIA: Record<Presencia, string> = {
  conectado: 'Conectado', ocupado: 'Ocupado', desconectado: 'Desconectado',
};

export function colorPresencia(p: Presencia): string {
  return p === 'conectado' ? '#0A7D2C' : p === 'ocupado' ? '#E6A100' : '#94a3b8';
}

/** «hace 3 min», «hace 2 h», «hace 4 d» — o «nunca» si no hay conexión registrada. */
export function haceCuanto(ts?: string | null): string {
  if (!ts) return 'nunca';
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}
