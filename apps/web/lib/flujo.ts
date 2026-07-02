import type { PasoFlujo } from '@/components/FlujoTrabajo';

/**
 * Flujo de casos (acortado): Verificación → Confirmados → Enviado a Redacción.
 * La producción posterior (redacción/diseño/redes) se coordina dentro de cada
 * grupo. La RLS limita lo que cada rol ve; los conteos reflejan eso.
 */
export type ConteoFlujo = { enProceso: number; confirmado: number; enviado: number };

export async function contarFlujo(supabase: any): Promise<ConteoFlujo> {
  const cc = (e: string) => supabase.from('casos').select('*', { count: 'exact', head: true }).eq('estado', e);
  const [a, b, c] = await Promise.all([cc('en_proceso'), cc('confirmado'), cc('enviado_redaccion')]);
  return { enProceso: a.count ?? 0, confirmado: b.count ?? 0, enviado: c.count ?? 0 };
}

export function pasosFlujo(f: ConteoFlujo): PasoFlujo[] {
  return [
    { etiqueta: 'Verificación', valor: f.enProceso, icono: 'ok', color: '#a16207', tinte: '#fef9c3', href: '/casos?estado=en_proceso' },
    { etiqueta: 'Confirmados', valor: f.confirmado, icono: 'ok', color: '#16a34a', tinte: '#dcfce7', href: '/casos?estado=confirmado' },
    { etiqueta: 'Envío a Redacción', valor: f.enviado, icono: 'documento', color: 'var(--azul)', tinte: '#eef2ff', href: '/envio-redaccion' },
  ];
}
