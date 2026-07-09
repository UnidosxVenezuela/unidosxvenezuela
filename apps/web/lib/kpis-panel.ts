// KPIs accionables por rol para el Panel: cada tarjeta muestra el «trabajo pendiente»
// relevante a la función de la persona, reutilizando la MISMA consulta que usa cada
// sección (tabla + filtros + valores de estado) para no desalinearse. Todo cuenta a
// través de la RLS (conteos agregados, sin exponer filas ni datos de menores).
import type { NavFlags } from './nav-flags';

export type KpiRol = {
  etiqueta: string; valor: number; sub: string;
  icono: string; tinte: string; color: string; href: string;
};

// Resuelve un conteo `{ count, error }`; ante error devuelve null (se omite la tarjeta).
async function num(p: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const { count, error } = await p;
  return error ? null : (count ?? 0);
}

/**
 * Devuelve hasta 4 KPIs según los flags del usuario, ordenados por prioridad.
 * El admin ve la «tira de flujo» aparte, así que se le omiten los KPIs de
 * Verificación y Envío a Redacción (evita duplicar ese tramo).
 */
export async function kpisDeRol(supabase: any, userId: string, flags: NavFlags): Promise<KpiRol[]> {
  const conFlujo = flags.admin; // el admin ve la tira de flujo (Verificación → Envío)

  type Cand = { cond: boolean; base: Omit<KpiRol, 'valor'>; contar: () => Promise<number | null> };
  const cands: Cand[] = [
    {
      cond: flags.verificacion && !conFlujo,
      base: { etiqueta: 'Casos por verificar', sub: 'esperan tu revisión', icono: 'ok', tinte: '#dcfce7', color: '#16a34a', href: '/casos?estado=pendiente,en_proceso' },
      contar: () => num(supabase.from('casos').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'en_proceso']).neq('categoria', 'Desaparecidos')),
    },
    {
      cond: flags.busqueda,
      base: { etiqueta: 'Casos por revisar', sub: 'con seguimiento vencido', icono: 'buscar', tinte: '#cffafe', color: '#0e7490', href: '/busqueda?vista=revisar' },
      contar: async () => { try { const { data } = await supabase.rpc('resumen_busqueda'); return data?.[0] ? Number(data[0].vencidos ?? 0) : null; } catch { return null; } },
    },
    {
      cond: flags.enlace,
      base: { etiqueta: 'Coincidencias por gestionar', sub: 'en tu cola de contacto', icono: 'whatsapp', tinte: '#dcfce7', color: '#16a34a', href: '/busqueda/enlace' },
      contar: async () => { try { const { data } = await supabase.rpc('listar_cola_enlace'); return (data ?? []).length; } catch { return null; } },
    },
    {
      cond: flags.digitalizacion,
      base: { etiqueta: 'Listados por verificar', sub: 'digitalización', icono: 'imagen', tinte: '#eef2ff', color: 'var(--azul)', href: '/digitalizacion' },
      contar: () => num(supabase.from('listados_digitalizados').select('*', { count: 'exact', head: true }).in('estado', ['por_verificar', 'observado'])),
    },
    {
      cond: flags.envioRedaccion && !conFlujo,
      base: { etiqueta: 'Confirmados por enviar', sub: 'a Redacción', icono: 'cohete', tinte: '#fce7f3', color: '#9d2463', href: '/envio-redaccion' },
      contar: () => num(supabase.from('casos').select('*', { count: 'exact', head: true }).eq('estado', 'confirmado').neq('categoria', 'Desaparecidos')),
    },
    {
      cond: flags.acopio,
      base: { etiqueta: 'Insumos abiertos', sub: 'solicitados · en gestión · en ruta', icono: 'camion', tinte: '#fef9c3', color: '#a16207', href: '/insumos' },
      contar: () => num(supabase.from('solicitudes_insumo').select('*', { count: 'exact', head: true }).in('estado', ['solicitado', 'en_gestion', 'en_ruta'])),
    },
    {
      cond: flags.captacion,
      base: { etiqueta: 'Oportunidades por investigar', sub: 'en investigación', icono: 'enlace', tinte: '#eef2ff', color: 'var(--azul)', href: '/captacion' },
      contar: () => num(supabase.from('oportunidades').select('*', { count: 'exact', head: true }).eq('estado', 'investigacion')),
    },
    {
      cond: flags.contenido,
      base: { etiqueta: 'Piezas en producción', sub: 'sin publicar', icono: 'video', tinte: '#fef9c3', color: '#a16207', href: '/contenido' },
      contar: () => num(supabase.from('piezas_contenido').select('*', { count: 'exact', head: true }).neq('etapa', 'publicado')),
    },
    {
      cond: flags.gestionCasos && !flags.verificacion && !flags.admin,
      base: { etiqueta: 'Mis casos abiertos', sub: 'en proceso', icono: 'documento', tinte: '#eef2ff', color: 'var(--azul)', href: '/casos' },
      contar: () => num(supabase.from('casos').select('*', { count: 'exact', head: true }).eq('creado_por', userId).in('estado', ['pendiente', 'en_proceso'])),
    },
  ];

  const activos = cands.filter((c) => c.cond);
  const valores = await Promise.all(activos.map((c) => c.contar()));
  return activos
    .map((c, i) => (valores[i] === null ? null : { ...c.base, valor: valores[i] as number }))
    .filter((k): k is KpiRol => k !== null)
    .slice(0, 4);
}
