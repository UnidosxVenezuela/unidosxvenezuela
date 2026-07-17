// Datos y columnas para EXPORTAR la referencia de Captación (oportunidades enviadas)
// que ve Logística. Comparte forma con la ruta CSV y la página imprimible. La
// consulta usa el cliente de la SESIÓN → la RLS acota lo que ve cada quien (0162).
import type { Columna } from '@/lib/csv';
import { CATEGORIAS_OPORTUNIDAD, ETIQUETA_CATEGORIA_OPORTUNIDAD } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';

const TOPE = 10000;

export type FiltrosCaptacion = { q?: string; cat?: string };

/** Mismos filtros que la referencia de Captación (categoría/búsqueda), solo «enviadas». */
export async function consultarCaptacion(supabase: any, sp: FiltrosCaptacion): Promise<any[]> {
  const cat = (sp.cat ?? '').trim();
  const fCat = CATEGORIAS_OPORTUNIDAD.includes(cat as any) ? cat : null;
  let q = supabase.from('oportunidades')
    .select('id, categoria, estado, titulo, contacto, enlace, ubicacion, descripcion, creado_en, actualizado_en')
    .eq('estado', 'enviado')
    .order('actualizado_en', { ascending: false }).limit(TOPE);
  if (fCat) q = q.eq('categoria', fCat);
  const qTexto = (sp.q ?? '').trim().slice(0, 120);
  if (qTexto) {
    const s = qTexto.replace(/[%,()]/g, ' ');
    q = q.or(`titulo.ilike.%${s}%,contacto.ilike.%${s}%,descripcion.ilike.%${s}%,ubicacion.ilike.%${s}%`);
  }
  const { data } = await q;
  return (data ?? []) as any[];
}

export const COLUMNAS_CAPTACION: Columna<any>[] = [
  { encabezado: 'Categoría', valor: (o) => ETIQUETA_CATEGORIA_OPORTUNIDAD[o.categoria as keyof typeof ETIQUETA_CATEGORIA_OPORTUNIDAD] ?? o.categoria ?? '' },
  { encabezado: 'Nombre', valor: (o) => o.titulo ?? '' },
  { encabezado: 'Contacto', valor: (o) => o.contacto ?? '' },
  { encabezado: 'Ubicación', valor: (o) => o.ubicacion ?? '' },
  { encabezado: 'Descripción', valor: (o) => o.descripcion ?? '' },
  { encabezado: 'Enlace', valor: (o) => o.enlace ?? '' },
  { encabezado: 'Registrado', valor: (o) => (o.creado_en ? fechaHora(o.creado_en) : '') },
  { encabezado: 'Última actualización', valor: (o) => (o.actualizado_en ? fechaHora(o.actualizado_en) : '') },
];
