// Datos y filas de la Analítica de Difusión. Comparten forma la página (/reportes/
// difusion), su versión imprimible y la descarga CSV. Todo sale de la RPC
// `resumen_difusion()` (0197), que agrega por encima de la RLS con gate de
// Redacción/Redes/admin — aquí solo se aplana a filas etiquetadas.
import type { Columna } from '@/lib/csv';
import { ETIQUETA_CANAL_DIFUSION } from '@/lib/constantes';

export type CanalDifusion = { canal: string; publicadas: number; pendientes: number };
export type DifusionData = {
  por_canal?: CanalDifusion[];
  pendientes?: { total?: number; espera_prom_horas?: number | null; espera_max_horas?: number | null };
  plazo?: { publicadas?: number; prom_horas?: number | null; mediana_horas?: number | null };
  kpis?: Record<string, number>;
};

/** Trae la analítica de difusión (RPC 0197). Best-effort: si falta la migración o
 *  no hay permiso, devuelve null y la vista muestra el aviso. */
export async function consultarDifusion(supabase: any): Promise<DifusionData | null> {
  const { data, error } = await supabase.rpc('resumen_difusion');
  if (error || !data) return null;
  return data as DifusionData;
}

/** Horas → texto legible (h hasta 48 h; luego días). */
export function horasLegible(h: number | null | undefined): string {
  if (h == null) return '—';
  const n = Number(h);
  if (!isFinite(n)) return '—';
  if (n < 48) return n.toFixed(1) + ' h';
  return (n / 24).toFixed(1) + ' d';
}

export type FilaDifusion = { seccion: string; concepto: string; valor: number | string };

/** Aplana la analítica en filas etiquetadas (formato largo) para CSV / tabla imprimible. */
export function filasDifusion(d: DifusionData): FilaDifusion[] {
  const filas: FilaDifusion[] = [];
  const k = d.kpis ?? {};
  filas.push({ seccion: 'Indicadores', concepto: 'Solicitudes publicadas', valor: Number(k.publicadas ?? 0) });
  filas.push({ seccion: 'Indicadores', concepto: 'Piezas publicadas (por canal)', valor: Number(k.piezas_por_canal ?? 0) });
  filas.push({ seccion: 'Indicadores', concepto: 'Canales activos', valor: Number(k.canales_activos ?? 0) });
  filas.push({ seccion: 'Indicadores', concepto: 'Confirmadas sin publicar', valor: Number(k.sin_publicar ?? 0) });

  (d.por_canal ?? []).forEach((c) => {
    const etq = ETIQUETA_CANAL_DIFUSION[c.canal] ?? c.canal;
    filas.push({ seccion: 'Por canal', concepto: etq + ' · publicadas', valor: Number(c.publicadas) });
    if (Number(c.pendientes) > 0) filas.push({ seccion: 'Por canal', concepto: etq + ' · pendientes', valor: Number(c.pendientes) });
  });

  const p = d.pendientes ?? {};
  filas.push({ seccion: 'Cola de publicación', concepto: 'Confirmadas sin publicar', valor: Number(p.total ?? 0) });
  filas.push({ seccion: 'Cola de publicación', concepto: 'Espera promedio', valor: horasLegible(p.espera_prom_horas) });
  filas.push({ seccion: 'Cola de publicación', concepto: 'Espera máxima', valor: horasLegible(p.espera_max_horas) });

  const pl = d.plazo ?? {};
  filas.push({ seccion: 'Plazo de publicación', concepto: 'Publicadas medidas', valor: Number(pl.publicadas ?? 0) });
  filas.push({ seccion: 'Plazo de publicación', concepto: 'Promedio (confirmación → publicación)', valor: horasLegible(pl.prom_horas) });
  filas.push({ seccion: 'Plazo de publicación', concepto: 'Mediana (confirmación → publicación)', valor: horasLegible(pl.mediana_horas) });

  return filas;
}

export const COLUMNAS_DIFUSION: Columna<FilaDifusion>[] = [
  { encabezado: 'Sección', valor: (f) => f.seccion },
  { encabezado: 'Concepto', valor: (f) => f.concepto },
  { encabezado: 'Valor', valor: (f) => f.valor },
];
