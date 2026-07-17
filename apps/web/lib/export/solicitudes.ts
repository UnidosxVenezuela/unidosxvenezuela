// Datos y columnas para EXPORTAR el listado de Solicitudes (casos). Lo comparten la
// ruta CSV y la página imprimible, para que ambas muestren exactamente lo mismo. La
// consulta usa el cliente de la SESIÓN → la RLS acota qué filas ve cada quien.
import type { Columna } from '@/lib/csv';
import { ETIQUETA_ESTADO_CASO } from '@/lib/constantes';
import { fechaHora, fechaCorta } from '@/lib/fechas';

const ESTADOS_VALIDOS = ['pendiente', 'en_proceso', 'confirmado', 'falso', 'enviado_redaccion', 'resuelto'];
const TOPE = 10000;

export type FiltrosSolicitudes = { q?: string; estado?: string; categoria?: string };

/** Mismos filtros que el tablero de Solicitudes (estado/categoría/búsqueda). */
export async function consultarSolicitudes(supabase: any, sp: FiltrosSolicitudes): Promise<any[]> {
  const COLS = 'id, numero, titulo, descripcion, categoria, estado, fuente, fuente_url, fecha_publicacion, contacto, req_tipo, req_cantidad, req_urgencia, actualizado_en, creado_en';
  const estadoFiltro = (sp.estado ?? '').split(',').map((s) => s.trim()).filter((e) => ESTADOS_VALIDOS.includes(e));
  let q = supabase.from('casos').select(COLS).order('actualizado_en', { ascending: false }).limit(TOPE);
  if (estadoFiltro.length === 1) q = q.eq('estado', estadoFiltro[0]);
  else if (estadoFiltro.length > 1) q = q.in('estado', estadoFiltro);
  if (sp.categoria) q = q.eq('categoria', sp.categoria);
  if (sp.q) {
    const s = sp.q.replace(/[%,()]/g, ' ').trim();
    const n = s.match(/^(?:sol[-\s]?)?#?0*(\d{1,10})$/i)?.[1];
    const partes = [`titulo.ilike.%${s}%`, `descripcion.ilike.%${s}%`, `fuente.ilike.%${s}%`];
    if (n) partes.push('numero.eq.' + Number(n));
    q = q.or(partes.join(','));
  }
  const { data } = await q;
  return (data ?? []) as any[];
}

export const COLUMNAS_SOLICITUDES: Columna<any>[] = [
  { encabezado: 'Número', valor: (c) => (c.numero != null ? '#' + String(c.numero).padStart(5, '0') : '') },
  { encabezado: 'Título', valor: (c) => c.titulo ?? '' },
  { encabezado: 'Categoría', valor: (c) => c.categoria ?? '' },
  { encabezado: 'Estado', valor: (c) => ETIQUETA_ESTADO_CASO[c.estado as keyof typeof ETIQUETA_ESTADO_CASO] ?? c.estado ?? '' },
  { encabezado: 'Urgencia', valor: (c) => c.req_urgencia ?? '' },
  { encabezado: 'Requerimiento', valor: (c) => c.req_tipo ?? '' },
  { encabezado: 'Cantidad', valor: (c) => c.req_cantidad ?? '' },
  { encabezado: 'Contacto', valor: (c) => c.contacto ?? '' },
  { encabezado: 'Fuente', valor: (c) => c.fuente ?? '' },
  { encabezado: 'Enlace fuente', valor: (c) => c.fuente_url ?? '' },
  { encabezado: 'Fecha de publicación', valor: (c) => (c.fecha_publicacion ? fechaCorta(c.fecha_publicacion) : '') },
  { encabezado: 'Descripción', valor: (c) => c.descripcion ?? '' },
  { encabezado: 'Última actualización', valor: (c) => (c.actualizado_en ? fechaHora(c.actualizado_en) : '') },
];
