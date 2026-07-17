import type { PasoFlujo } from '@/components/FlujoTrabajo';
import type { EstadoCaso } from '@unidos/types';

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

/**
 * Camino feliz de una solicitud en 5 pasos, para la barra de progreso «Paso N de 5».
 * `falso` sale del flujo (no es un paso). Devuelve el paso, el total y una etiqueta.
 */
export const PASOS_CASO: EstadoCaso[] = ['pendiente', 'en_proceso', 'confirmado', 'enviado_redaccion', 'resuelto'];

export function pasoDeCaso(estado: EstadoCaso): { paso: number; total: number; fuera: boolean; etiqueta: string } {
  const total = PASOS_CASO.length;
  if (estado === 'falso') return { paso: 0, total, fuera: true, etiqueta: 'Salió del flujo' };
  const i = PASOS_CASO.indexOf(estado);
  const paso = i >= 0 ? i + 1 : 1;
  return { paso, total, fuera: false, etiqueta: `Paso ${paso} de ${total}` };
}

/**
 * Flujo de DIFUSIÓN visto por «Envío a Redacción», en 3 etapas:
 *   1) Por difundir (confirmada, sin enviar)  2) En redacción (enviado_redaccion)
 *   3) Publicada (publicado_en marcado, ortogonal al estado — 0166).
 * «Publicada» manda: una solicitud publicada cuenta como etapa 3 aunque su estado
 * siga en «confirmado» o «enviado_redaccion».
 */
export type EtapaRedaccion = 'por_difundir' | 'en_redaccion' | 'publicada';
export const ETAPAS_REDACCION: EtapaRedaccion[] = ['por_difundir', 'en_redaccion', 'publicada'];
export const ETIQUETA_ETAPA_REDACCION: Record<EtapaRedaccion, string> = {
  por_difundir: 'Por difundir',
  en_redaccion: 'En redacción',
  publicada: 'Publicada',
};

export function etapaRedaccion(caso: { estado?: string | null; publicado_en?: string | null }): EtapaRedaccion {
  if (caso.publicado_en) return 'publicada';
  if (caso.estado === 'enviado_redaccion') return 'en_redaccion';
  return 'por_difundir';
}

export function pasoRedaccion(caso: { estado?: string | null; publicado_en?: string | null }): { paso: number; total: number; completo: boolean; etiqueta: string } {
  const et = etapaRedaccion(caso);
  const paso = ETAPAS_REDACCION.indexOf(et) + 1;
  const completo = et === 'publicada';
  return { paso, total: ETAPAS_REDACCION.length, completo, etiqueta: completo ? 'Publicada ✓' : `Paso ${paso} de ${ETAPAS_REDACCION.length} · ${ETIQUETA_ETAPA_REDACCION[et]}` };
}
