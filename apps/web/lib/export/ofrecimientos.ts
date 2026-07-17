// Datos y columnas para EXPORTAR el listado de Donación-Ofrecimiento
// (oportunidades_donacion). Comparte forma con la ruta CSV y la página imprimible.
// La consulta usa el cliente de la SESIÓN → la RLS acota lo que ve cada quien.
import type { Columna } from '@/lib/csv';
import {
  ESTADOS_VERIF, CLASES_OFERTA, ETIQUETA_ESTADO_VERIF, ETIQUETA_CLASE_OFERTA,
  ETIQUETA_TIPO_OFERTA, ETIQUETA_ORIGEN_OFERTA, ETIQUETA_ESTADO_OFERTA, ETIQUETA_TIPO_INSUMO,
} from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';

const TOPE = 10000;

export type FiltrosOfrecimientos = { q?: string; verif?: string; clase?: string };

/** Mismos filtros que el tablero Donación-Ofrecimiento (verificación/clase/búsqueda). */
export async function consultarOfrecimientos(supabase: any, sp: FiltrosOfrecimientos): Promise<any[]> {
  let query = supabase.from('oportunidades_donacion').select('*').order('creado_en', { ascending: false }).limit(TOPE);
  const fVerif = ESTADOS_VERIF.includes(sp.verif ?? '') ? sp.verif! : '';
  const fClase = CLASES_OFERTA.includes(sp.clase ?? '') ? sp.clase! : '';
  if (fVerif) query = query.eq('estado_verificacion', fVerif);
  if (fClase) query = query.eq('clase', fClase);
  const qTexto = (sp.q ?? '').trim().slice(0, 120);
  if (qTexto) {
    const s = qTexto.replace(/[%,()]/g, ' ');
    const n = s.match(/^(?:of[-\s]?)?#?0*(\d{1,10})$/i)?.[1];
    const partes = [`organizacion.ilike.%${s}%`, `contacto.ilike.%${s}%`, `descripcion.ilike.%${s}%`, `ubicacion.ilike.%${s}%`];
    if (n) partes.push('numero.eq.' + Number(n));
    query = query.or(partes.join(','));
  }
  const { data } = await query;
  return (data ?? []) as any[];
}

const etTipoInsumo = (t: string) => ETIQUETA_TIPO_INSUMO[t as keyof typeof ETIQUETA_TIPO_INSUMO] ?? t;

export const COLUMNAS_OFRECIMIENTOS: Columna<any>[] = [
  { encabezado: 'Número', valor: (o) => (o.numero != null ? 'OF-' + String(o.numero).padStart(5, '0') : '') },
  { encabezado: 'Quién ofrece', valor: (o) => o.organizacion ?? '' },
  { encabezado: 'Tipo de origen', valor: (o) => (o.origen ? (ETIQUETA_ORIGEN_OFERTA[o.origen as keyof typeof ETIQUETA_ORIGEN_OFERTA] ?? o.origen) : '') },
  { encabezado: 'Qué ofrece', valor: (o) => (o.clase ? (ETIQUETA_CLASE_OFERTA[o.clase as keyof typeof ETIQUETA_CLASE_OFERTA] ?? o.clase) : '') },
  { encabezado: 'Forma', valor: (o) => (o.tipo_oferta ? (ETIQUETA_TIPO_OFERTA[o.tipo_oferta as keyof typeof ETIQUETA_TIPO_OFERTA] ?? o.tipo_oferta) : '') },
  { encabezado: 'Estado', valor: (o) => (o.estado ? (ETIQUETA_ESTADO_OFERTA[o.estado as keyof typeof ETIQUETA_ESTADO_OFERTA] ?? o.estado) : '') },
  { encabezado: 'Verificación', valor: (o) => (o.estado_verificacion ? (ETIQUETA_ESTADO_VERIF[o.estado_verificacion as keyof typeof ETIQUETA_ESTADO_VERIF] ?? o.estado_verificacion) : '') },
  { encabezado: 'Contacto', valor: (o) => o.contacto ?? '' },
  { encabezado: 'Cubre', valor: (o) => (Array.isArray(o.cubre_tipos) ? o.cubre_tipos.map(etTipoInsumo).join(' · ') : '') },
  { encabezado: 'Monto estimado', valor: (o) => (o.monto_estimado != null ? o.monto_estimado : '') },
  { encabezado: 'Ubicación', valor: (o) => o.ubicacion ?? '' },
  { encabezado: 'Enlace', valor: (o) => o.enlace ?? '' },
  { encabezado: 'Descripción', valor: (o) => o.descripcion ?? '' },
  { encabezado: 'Registrado', valor: (o) => (o.creado_en ? fechaHora(o.creado_en) : '') },
];
