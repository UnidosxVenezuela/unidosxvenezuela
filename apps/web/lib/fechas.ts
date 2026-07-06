// Formato de fecha consistente dd/mm/aaaa (y con hora) en HORA DE VENEZUELA
// (America/Caracas, UTC-4). Determinístico y sin depender del locale ni de la zona
// horaria del runtime: en el SERVIDOR (SSR) el reloj suele estar en UTC, así que
// forzamos la zona de Venezuela con Intl para que el historial y los tiempos se vean
// siempre en la hora local de Venezuela, igual en el servidor y en el navegador.

const ZONA = 'America/Caracas';
function d2(n: number): string { return String(n).padStart(2, '0'); }

/** Descompone una fecha en sus partes (día, mes, año, hora, minuto) en hora de Venezuela. */
function partesVE(v: string | number | Date | null | undefined):
  { dia: number; mes: number; anio: number; hora: number; min: number } | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const hora = g('hour');
  return { dia: g('day'), mes: g('month'), anio: g('year'), hora: hora === 24 ? 0 : hora, min: g('minute') };
}

/** dd/mm/aaaa (hora de Venezuela) */
export function fechaCorta(v: string | number | Date | null | undefined): string {
  const p = partesVE(v);
  return p ? `${d2(p.dia)}/${d2(p.mes)}/${p.anio}` : '';
}

/** dd/mm/aaaa HH:mm (hora de Venezuela) */
export function fechaHora(v: string | number | Date | null | undefined): string {
  const p = partesVE(v);
  return p ? `${d2(p.dia)}/${d2(p.mes)}/${p.anio} ${d2(p.hora)}:${d2(p.min)}` : '';
}
