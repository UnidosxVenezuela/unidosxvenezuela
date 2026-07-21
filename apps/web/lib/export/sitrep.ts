// Datos y filas del SitRep (Reporte de Situación). Comparten forma la página
// agregada (/reportes/sitrep), su versión imprimible y la descarga CSV. Todo sale
// de la RPC `resumen_sitrep()` (0196), que ya agrega por encima de la RLS con gate
// de Coordinación (admin) — aquí solo se aplana a filas etiquetadas.
import type { Columna } from '@/lib/csv';
import {
  ETIQUETA_ESTADO_CASO, ESTADOS_CASO, ETIQUETA_PRIORIDAD, PRIORIDADES, RANGO_PRIORIDAD,
  AREAS_DESTINO, ETIQUETA_AREA_DESTINO, ESTADOS_DERIVACION, ETIQUETA_ESTADO_DERIVACION,
  CANALES_DIFUSION, ETIQUETA_CANAL_DIFUSION,
} from '@/lib/constantes';

export type SitrepData = {
  por_estado?: Record<string, number>;
  por_urgencia?: Record<string, number>;
  matriz?: { area: string; estado: string; n: number; personas: number }[];
  logistica?: Record<string, number>;
  difusion?: { publicadas?: number; confirmadas_sin_publicar?: number; por_canal?: Record<string, number> };
  kpis?: Record<string, number>;
};

/** Urgencias de mayor a menor (crítica primero), para mostrar y aplanar. */
export const URGENCIAS_ORDEN = [...PRIORIDADES].sort((a, b) => RANGO_PRIORIDAD[a] - RANGO_PRIORIDAD[b]);

/** Trae el SitRep agregado (RPC 0196). La RPC gatea es_admin(); si falta la
 *  migración o no hay permiso, devuelve null y la vista muestra el aviso. */
export async function consultarSitrep(supabase: any): Promise<SitrepData | null> {
  const { data, error } = await supabase.rpc('resumen_sitrep');
  if (error || !data) return null;
  return data as SitrepData;
}

export type FilaSitrep = { seccion: string; concepto: string; valor: number | string };

/** Aplana el SitRep en filas etiquetadas (formato largo) para CSV / tabla imprimible. */
export function filasSitrep(d: SitrepData): FilaSitrep[] {
  const filas: FilaSitrep[] = [];
  const k = d.kpis ?? {};
  const KPIS: [string, string][] = [
    ['solicitudes_total', 'Solicitudes totales'],
    ['activas', 'Solicitudes activas'],
    ['personas_afectadas', 'Personas afectadas'],
    ['publicadas', 'Publicadas'],
    ['derivaciones_abiertas', 'Derivaciones abiertas'],
    ['derivaciones_total', 'Derivaciones (histórico)'],
  ];
  KPIS.forEach(([key, etq]) => filas.push({ seccion: 'Indicadores', concepto: etq, valor: Number(k[key] ?? 0) }));

  const pe = d.por_estado ?? {};
  ESTADOS_CASO.forEach((e) => {
    if (pe[e] != null) filas.push({ seccion: 'Solicitudes por estado', concepto: ETIQUETA_ESTADO_CASO[e], valor: Number(pe[e]) });
  });

  const pu = d.por_urgencia ?? {};
  URGENCIAS_ORDEN.forEach((p) => {
    if (pu[p] != null) filas.push({ seccion: 'Solicitudes por urgencia', concepto: ETIQUETA_PRIORIDAD[p], valor: Number(pu[p]) });
  });
  if (pu['sin'] != null) filas.push({ seccion: 'Solicitudes por urgencia', concepto: 'Sin urgencia indicada', valor: Number(pu['sin']) });

  const celda = new Map<string, number>();
  (d.matriz ?? []).forEach((m) => celda.set(m.area + '·' + m.estado, Number(m.n)));
  AREAS_DESTINO.forEach((a) => ESTADOS_DERIVACION.forEach((e) => {
    const n = celda.get(a + '·' + e);
    if (n) filas.push({ seccion: 'Derivaciones por área', concepto: ETIQUETA_AREA_DESTINO[a] + ' · ' + ETIQUETA_ESTADO_DERIVACION[e], valor: n });
  }));

  const lg = d.logistica ?? {};
  ESTADOS_DERIVACION.forEach((e) => {
    if (lg[e] != null) filas.push({ seccion: 'Logística', concepto: ETIQUETA_ESTADO_DERIVACION[e], valor: Number(lg[e]) });
  });

  const df = d.difusion ?? {};
  filas.push({ seccion: 'Difusión', concepto: 'Publicadas', valor: Number(df.publicadas ?? 0) });
  filas.push({ seccion: 'Difusión', concepto: 'Confirmadas sin publicar', valor: Number(df.confirmadas_sin_publicar ?? 0) });
  const pc = df.por_canal ?? {};
  CANALES_DIFUSION.forEach((c) => {
    if (pc[c] != null) filas.push({ seccion: 'Difusión', concepto: 'Canal · ' + (ETIQUETA_CANAL_DIFUSION[c] ?? c), valor: Number(pc[c]) });
  });
  // Canales fuera del catálogo conocido (por si se registró alguno libre).
  Object.keys(pc).forEach((c) => {
    if (!CANALES_DIFUSION.includes(c)) filas.push({ seccion: 'Difusión', concepto: 'Canal · ' + c, valor: Number(pc[c]) });
  });

  return filas;
}

export const COLUMNAS_SITREP: Columna<FilaSitrep>[] = [
  { encabezado: 'Sección', valor: (f) => f.seccion },
  { encabezado: 'Concepto', valor: (f) => f.concepto },
  { encabezado: 'Valor', valor: (f) => f.valor },
];
