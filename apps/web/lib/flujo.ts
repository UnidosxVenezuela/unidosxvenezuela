import type { PasoFlujo } from '@/components/FlujoTrabajo';

/**
 * Conteos del flujo de trabajo (casos + piezas de contenido) y los pasos para la
 * tira `FlujoTrabajo`. Fuente única usada por el panel, Verificación y Contenido.
 * La RLS limita lo que cada rol ve; los conteos reflejan eso.
 */
export type ConteoFlujo = {
  enProceso: number; confirmado: number; redaccion: number;
  diseno: number; video: number; redes: number; publicado: number;
};

export async function contarFlujo(supabase: any): Promise<ConteoFlujo> {
  const cc = (e: string) => supabase.from('casos').select('*', { count: 'exact', head: true }).eq('estado', e);
  const pp = (e: string) => supabase.from('piezas_contenido').select('*', { count: 'exact', head: true }).eq('etapa', e);
  const [a, b, r, d, v, re, pu] = await Promise.all([
    cc('en_proceso'), cc('confirmado'), pp('redaccion'), pp('diseno'), pp('video'), pp('redes'), pp('publicado'),
  ]);
  return {
    enProceso: a.count ?? 0, confirmado: b.count ?? 0, redaccion: r.count ?? 0,
    diseno: d.count ?? 0, video: v.count ?? 0, redes: re.count ?? 0, publicado: pu.count ?? 0,
  };
}

export function pasosFlujo(f: ConteoFlujo): PasoFlujo[] {
  return [
    { etiqueta: 'Verificación', valor: f.enProceso, icono: 'ok', color: '#a16207', tinte: '#fef9c3', href: '/casos?estado=en_proceso' },
    { etiqueta: 'Confirmados', valor: f.confirmado, icono: 'ok', color: '#16a34a', tinte: '#dcfce7', href: '/casos?estado=confirmado' },
    { etiqueta: 'Redacción', valor: f.redaccion, icono: 'documento', color: 'var(--azul)', tinte: '#eef2ff', href: '/contenido' },
    { etiqueta: 'Diseño / Video', valor: f.diseno + f.video, icono: 'imagen', color: '#9d2463', tinte: '#fce7f3', href: '/contenido' },
    { etiqueta: 'Redes', valor: f.redes, icono: 'tablon', color: '#0e7490', tinte: '#cffafe', href: '/contenido' },
    { etiqueta: 'Publicado', valor: f.publicado, icono: 'cohete', color: '#16a34a', tinte: '#dcfce7', href: '/contenido' },
  ];
}
