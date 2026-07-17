// Datos y columnas para EXPORTAR el listado de Envío a Redacción (casos confirmados
// y ya enviados a redacción). Comparte forma con la ruta CSV y la página imprimible.
// La consulta va con el cliente de la SESIÓN → la RLS acota lo que ve cada quien.
import type { Columna } from '@/lib/csv';
import { ETIQUETA_ESTADO_CASO } from '@/lib/constantes';
import { fechaHora, fechaCorta } from '@/lib/fechas';

const TOPE = 10000;

/** Todo lo que Redacción trabaja: confirmadas (por difundir) + ya enviadas. */
export async function consultarRedaccion(supabase: any): Promise<any[]> {
  // Paso 10: Redacción exporta el contacto AUTORIZADO para difusión, nunca el interno.
  const COLS = 'id, numero, titulo, descripcion, categoria, estado, fuente, fuente_url, fecha_publicacion, contacto_difusion, autoriza_difusion, notas, req_tipo, req_cantidad, req_urgencia, requiere_difusion, publicado_en, publicacion_url, actualizado_en';
  const { data } = await supabase.from('casos').select(COLS)
    .in('estado', ['confirmado', 'enviado_redaccion'])
    .order('actualizado_en', { ascending: false }).limit(TOPE);
  return (data ?? []) as any[];
}

export const COLUMNAS_REDACCION: Columna<any>[] = [
  { encabezado: 'Número', valor: (c) => (c.numero != null ? '#' + String(c.numero).padStart(5, '0') : '') },
  { encabezado: 'Título', valor: (c) => c.titulo ?? '' },
  { encabezado: 'Categoría', valor: (c) => c.categoria ?? '' },
  { encabezado: 'Estado', valor: (c) => ETIQUETA_ESTADO_CASO[c.estado as keyof typeof ETIQUETA_ESTADO_CASO] ?? c.estado ?? '' },
  { encabezado: 'Prioridad difusión', valor: (c) => (c.requiere_difusion ? 'Sí (Logística no pudo cubrir)' : '') },
  { encabezado: 'Urgencia', valor: (c) => c.req_urgencia ?? '' },
  { encabezado: 'Contacto de difusión', valor: (c) => (c.autoriza_difusion ? (c.contacto_difusion ?? '') : '') },
  { encabezado: 'Fuente', valor: (c) => c.fuente ?? '' },
  { encabezado: 'Enlace fuente', valor: (c) => c.fuente_url ?? '' },
  { encabezado: 'Fecha de publicación', valor: (c) => (c.fecha_publicacion ? fechaCorta(c.fecha_publicacion) : '') },
  { encabezado: 'Descripción', valor: (c) => c.descripcion ?? '' },
  { encabezado: 'Notas', valor: (c) => c.notas ?? '' },
  { encabezado: 'Publicado', valor: (c) => (c.publicado_en ? fechaHora(c.publicado_en) : '') },
  { encabezado: 'Enlace publicación', valor: (c) => c.publicacion_url ?? '' },
  { encabezado: 'Última actualización', valor: (c) => (c.actualizado_en ? fechaHora(c.actualizado_en) : '') },
];
