// Datos y columnas para la reportería de Alianzas Estratégicas (0200): el registro de
// empresas «Captado» (oportunidades) como respaldo formal para presentar a las empresas
// («70 empresas · 1000 medicamentos»). El resumen agregado sale de la RPC
// resumen_alianzas() (gate puede_alianzas); la tabla por empresa usa el cliente de la
// SESIÓN → la RLS acota lo que ve cada quien. Comparte forma la página, su versión
// imprimible y la descarga CSV.
import type { Columna } from '@/lib/csv';
import { ETIQUETA_ESTADO_OPORTUNIDAD } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';

const TOPE = 10000;

export type AlianzasResumen = {
  kpis?: Record<string, number | null>;
  por_estado?: Record<string, number>;
  por_rubro?: Record<string, number>;
  por_score?: Record<string, number>;
  // Ampliación 0228: el departamento entero, no solo el registro «Captado». Todo
  // opcional — una base sin 0228 aplicada sigue pintando el reporte de 0200.
  afiliados?: {
    total?: number; activos?: number; con_cuenta?: number;
    por_tipo?: Record<string, number>;
    por_cargo?: { cargo: string; n: number }[];
  };
  escalado?: { a_alianzas?: number; voluntariado?: number; escalado_pendiente?: number; escalado_resuelto?: number };
  por_origen?: Record<string, number>;
  transporte?: { con_transporte?: number; sin_transporte?: number };
  correos?: {
    total?: number; enviados?: number; fallidos?: number; ultimo?: string | null;
    por_plantilla?: { plantilla: string; n: number }[];
  };
  capacidad?: {
    compromisos?: number; proveedores?: number; comprometido?: number;
    restante?: number; entregado?: number; recurrentes?: number; puntuales?: number;
  };
};

export const ETIQUETA_ORIGEN_OPORTUNIDAD: Record<string, string> = {
  prospeccion: 'Prospección (búsqueda activa)',
  captacion: 'Captación (llegó al equipo)',
  sin_especificar: 'Sin especificar',
};

/** Trae el resumen agregado (RPC 0200). Gatea puede_alianzas(); si falta la migración
 *  o no hay permiso, devuelve null y la vista muestra el aviso. */
export async function consultarResumenAlianzas(supabase: any): Promise<AlianzasResumen | null> {
  const { data, error } = await supabase.rpc('resumen_alianzas');
  if (error || !data) return null;
  return data as AlianzasResumen;
}

/** Empresas del registro (respaldo por empresa). Respeta la RLS de la sesión. Si 0199
 *  aún no está aplicada, reintenta con las columnas base (degradación elegante). */
export async function consultarEmpresasAlianzas(supabase: any): Promise<any[]> {
  const COLS = 'id, categoria, estado, titulo, rubro, direccion, responsable_nombre, responsable_telefono, contacto, volumen, capacidades, transporte, logistica_entrega, score_confiabilidad, origen, creado_en, verificado_en, actualizado_en';
  const { data, error } = await supabase.from('oportunidades').select(COLS)
    .order('actualizado_en', { ascending: false }).limit(TOPE);
  if (error) {
    const { data: d2 } = await supabase.from('oportunidades')
      .select('id, categoria, estado, titulo, contacto, creado_en, actualizado_en')
      .order('actualizado_en', { ascending: false }).limit(TOPE);
    return (d2 ?? []) as any[];
  }
  return (data ?? []) as any[];
}

/** Días entre registro (Pendiente) y verificación (Verificado). '' si falta el sello. */
export function diasAVerificado(o: any): number | '' {
  if (!o?.creado_en || !o?.verificado_en) return '';
  const a = new Date(o.creado_en).getTime(), b = new Date(o.verificado_en).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return '';
  return Math.max(0, Math.round((b - a) / 86400000));
}

export const COLUMNAS_ALIANZAS: Columna<any>[] = [
  { encabezado: 'Empresa', valor: (o) => o.titulo ?? '' },
  { encabezado: 'Rubro', valor: (o) => o.rubro ?? '' },
  { encabezado: 'Estado', valor: (o) => ETIQUETA_ESTADO_OPORTUNIDAD[o.estado as keyof typeof ETIQUETA_ESTADO_OPORTUNIDAD] ?? o.estado ?? '' },
  { encabezado: 'Volumen / insumos', valor: (o) => o.volumen ?? '' },
  { encabezado: 'Capacidades', valor: (o) => o.capacidades ?? '' },
  { encabezado: 'Transporte', valor: (o) => (o.transporte ? 'Sí' : '') },
  { encabezado: 'Logística de entrega', valor: (o) => o.logistica_entrega ?? '' },
  { encabezado: 'Score', valor: (o) => (o.score_confiabilidad != null ? String(o.score_confiabilidad) : '') },
  { encabezado: 'Responsable', valor: (o) => o.responsable_nombre ?? '' },
  { encabezado: 'Teléfono', valor: (o) => o.responsable_telefono ?? '' },
  { encabezado: 'Contacto', valor: (o) => o.contacto ?? '' },
  { encabezado: 'Dirección', valor: (o) => o.direccion ?? '' },
  { encabezado: 'Días a verificado', valor: (o) => diasAVerificado(o) },
  { encabezado: 'Registrada', valor: (o) => (o.creado_en ? fechaHora(o.creado_en) : '') },
];
