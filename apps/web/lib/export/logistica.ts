// Datos y filas de la Reportería de Logística (0227). Comparten forma la página
// (/reportes/logistica), su versión imprimible y la descarga CSV. Todo sale de la
// RPC `resumen_logistica()`, que agrega por encima de la RLS con gate de Logística
// o Alianzas (consulta cruzada, 0226) — aquí solo se aplana a filas etiquetadas.
//
// LO CUBIERTO POR TERCEROS VA SIEMPRE APARTE. `cantidad_terceros` es lo que puso
// otra ONG o un particular: no es capacidad de respuesta de la organización.
// `pct_propio` es la cifra honesta de lo que cubrimos nosotros.
import type { Columna } from '@/lib/csv';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_INSUMO } from '@/lib/constantes';

export type TipoLogistica = { tipo: string; n: number; entregadas: number };
export type ProveedorLogistica = { nombre: string; total: number; n_aportes: number };

export type LogisticaData = {
  kpis?: Record<string, number | null>;
  por_estado?: Record<string, number>;
  por_tipo?: TipoLogistica[];
  cobertura_items?: {
    items_totales?: number; items_cumplidos?: number; items_por_tercero?: number;
    cantidad_pedida?: number; cantidad_cubierta?: number; cantidad_terceros?: number;
    pct_cubierto?: number | null; pct_propio?: number | null;
  };
  plazos?: { medidas?: number; prom_horas?: number | null; mediana_horas?: number | null; max_horas?: number | null };
  top_proveedores?: ProveedorLogistica[];
  escalados?: { a_alianzas?: number; voluntariado?: number };
  capacidad?: { compromisos?: number; proveedores?: number; restante?: number };
};

/** Trae la reportería de Logística (RPC 0227). Best-effort: si falta la migración o
 *  no hay permiso, devuelve null y la vista muestra el aviso. */
export async function consultarLogistica(supabase: any): Promise<LogisticaData | null> {
  const { data, error } = await supabase.rpc('resumen_logistica');
  if (error || !data) return null;
  return data as LogisticaData;
}

/** Horas → texto legible (h hasta 48 h; luego días). Mismo criterio que difusión. */
export function horasLegible(h: number | null | undefined): string {
  if (h == null) return '—';
  const n = Number(h);
  if (!isFinite(n)) return '—';
  if (n < 48) return n.toFixed(1) + ' h';
  return (n / 24).toFixed(1) + ' d';
}

/** Number → texto con separador de miles, sin decimales inútiles. */
export function num(n: number | null | undefined): string {
  if (n == null) return '—';
  const v = Number(n);
  if (!isFinite(v)) return '—';
  return v % 1 === 0 ? v.toLocaleString('es-VE') : v.toFixed(1);
}

export function pct(n: number | null | undefined): string {
  return n == null ? '—' : Number(n).toFixed(1) + ' %';
}

export type FilaLogistica = { seccion: string; concepto: string; valor: number | string };

/** Aplana la reportería en filas etiquetadas (formato largo) para CSV / tabla imprimible. */
export function filasLogistica(d: LogisticaData): FilaLogistica[] {
  const filas: FilaLogistica[] = [];
  const k = d.kpis ?? {};
  const add = (seccion: string, concepto: string, valor: number | string) => filas.push({ seccion, concepto, valor });

  add('Indicadores', 'Solicitudes totales', Number(k.total_solicitudes ?? 0));
  add('Indicadores', 'Activas', Number(k.activas ?? 0));
  add('Indicadores', 'Entregadas', Number(k.entregadas ?? 0));
  add('Indicadores', 'Canceladas', Number(k.canceladas ?? 0));
  add('Indicadores', 'Sin disponibilidad', Number(k.no_disponibles ?? 0));
  add('Indicadores', 'Con desglose por ítem', Number(k.con_desglose ?? 0));
  add('Indicadores', 'Creadas por el área', Number(k.creadas_por_area ?? 0));
  add('Indicadores', 'Proveedores utilizados', Number(k.proveedores_activos ?? 0));

  Object.entries(d.por_estado ?? {}).forEach(([estado, n]) => {
    add('Por estado', ETIQUETA_ESTADO_INSUMO[estado] ?? estado, Number(n));
  });

  (d.por_tipo ?? []).forEach((t) => {
    const etq = ETIQUETA_TIPO_INSUMO[t.tipo] ?? t.tipo;
    add('Por tipo', etq + ' · solicitudes', Number(t.n));
    add('Por tipo', etq + ' · entregadas', Number(t.entregadas));
  });

  const c = d.cobertura_items ?? {};
  add('Cobertura por ítem', 'Ítems del desglose', Number(c.items_totales ?? 0));
  add('Cobertura por ítem', 'Ítems cumplidos', Number(c.items_cumplidos ?? 0));
  add('Cobertura por ítem', 'Ítems cubiertos por terceros', Number(c.items_por_tercero ?? 0));
  add('Cobertura por ítem', 'Cantidad pedida', num(c.cantidad_pedida));
  add('Cobertura por ítem', 'Cantidad cubierta (total)', num(c.cantidad_cubierta));
  add('Cobertura por ítem', 'De la cual, por terceros', num(c.cantidad_terceros));
  add('Cobertura por ítem', 'Cobertura total', pct(c.pct_cubierto));
  add('Cobertura por ítem', 'Cobertura con capacidad propia', pct(c.pct_propio));

  const p = d.plazos ?? {};
  add('Plazos de entrega', 'Entregas medidas', Number(p.medidas ?? 0));
  add('Plazos de entrega', 'Promedio (alta → entrega)', horasLegible(p.prom_horas));
  add('Plazos de entrega', 'Mediana (alta → entrega)', horasLegible(p.mediana_horas));
  add('Plazos de entrega', 'Máximo', horasLegible(p.max_horas));

  (d.top_proveedores ?? []).forEach((pr) => {
    add('Proveedores', pr.nombre, num(pr.total) + ' (' + pr.n_aportes + ' aportes)');
  });

  const e = d.escalados ?? {};
  add('Escalado a Alianzas', 'Solicitudes escaladas', Number(e.a_alianzas ?? 0));
  add('Escalado a Alianzas', 'Voluntariado profesional', Number(e.voluntariado ?? 0));

  const cap = d.capacidad ?? {};
  add('Capacidad comprometida', 'Compromisos vigentes', Number(cap.compromisos ?? 0));
  add('Capacidad comprometida', 'Aliados con capacidad', Number(cap.proveedores ?? 0));
  add('Capacidad comprometida', 'Capacidad restante', num(cap.restante));

  return filas;
}

export const COLUMNAS_LOGISTICA: Columna<FilaLogistica>[] = [
  { encabezado: 'Sección', valor: (f) => f.seccion },
  { encabezado: 'Concepto', valor: (f) => f.concepto },
  { encabezado: 'Valor', valor: (f) => f.valor },
];
