import type { PasoFlujo } from '@/components/FlujoTrabajo';
import type { EstadoCaso } from '@unidos/types';
import { ETIQUETA_ESTADO_ITEM, ESTADOS_ITEM_FUERA, cantidadItem } from '@/lib/constantes';

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
 * `falso` sale del flujo (no es un paso). Una solicitud PUBLICADA (0166) o RESUELTA
 * cuenta como el Paso 5 (flujo terminado), aunque su estado siga en «enviado_redaccion»:
 * así los casos «solo redes» no se quedan clavados en el Paso 4 al publicarse.
 */
export const PASOS_CASO: EstadoCaso[] = ['pendiente', 'en_proceso', 'confirmado', 'enviado_redaccion', 'resuelto'];

export function pasoDeCaso(caso: { estado?: EstadoCaso | string | null; publicado_en?: string | null }): { paso: number; total: number; fuera: boolean; completo: boolean; etiqueta: string } {
  const total = PASOS_CASO.length;
  const estado = (caso?.estado ?? 'pendiente') as EstadoCaso;
  if (estado === 'falso') return { paso: 0, total, fuera: true, completo: false, etiqueta: 'Salió del flujo' };
  if (estado === 'desestimado') return { paso: 0, total, fuera: true, completo: false, etiqueta: 'Desestimada' };
  // Publicada (hecho ortogonal al estado, 0166) o resuelta = flujo terminado (Paso 5).
  if (estado === 'resuelto' || caso?.publicado_en) return { paso: total, total, fuera: false, completo: true, etiqueta: 'Finalizada' };
  const i = PASOS_CASO.indexOf(estado);
  const paso = i >= 0 ? i + 1 : 1;
  return { paso, total, fuera: false, completo: false, etiqueta: `Paso ${paso} de ${total}` };
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

/**
 * Semáforo de PASOS de un ÍTEM del desglose (0218 + 0220), en 4 pasos:
 *   Pendiente → En gestión → En ruta → Cubierto.
 * `no_disponible` y `cancelado` NO son pasos: son salidas del flujo, igual que
 * `falso`/`desestimado` en `pasoDeCaso` — la barra los pinta en rojo (`fuera`).
 *
 * Es el MISMO componente y la misma lectura que el resto de la plataforma
 * (`<FlujoProgreso paso total etiqueta fuera completo />`), para que el avance de un ítem
 * se lea igual desde Logística, desde el detalle de la solicitud y desde Redacción.
 *
 * Espejo de `public.pasos_item()` (0220). NO se apoya en `ESTADOS_INSUMO`: ese array
 * arrastra un bug conocido (le faltan dos de los seis estados).
 */
export const PASOS_ITEM = ['pendiente', 'en_gestion', 'en_ruta', 'cumplido'];

export function pasoDeItem(item: { estado?: string | null }): { paso: number; total: number; fuera: boolean; completo: boolean; etiqueta: string } {
  const total = PASOS_ITEM.length;
  const estado = item?.estado ?? 'pendiente';
  if (ESTADOS_ITEM_FUERA.includes(estado)) {
    return { paso: 0, total, fuera: true, completo: false, etiqueta: ETIQUETA_ESTADO_ITEM[estado] ?? estado };
  }
  const i = PASOS_ITEM.indexOf(estado);
  const paso = i >= 0 ? i + 1 : 1;
  const completo = estado === 'cumplido';
  return {
    paso, total, fuera: false, completo,
    etiqueta: completo ? 'Cubierto ✓' : `Paso ${paso} de ${total} · ${ETIQUETA_ESTADO_ITEM[estado] ?? estado}`,
  };
}

/**
 * Resumen del desglose completo para una tarjeta o una cabecera: cuántos ítems hay,
 * cuántos ya están cubiertos y cuántos salieron del flujo. Sirve para pintar UNA barra
 * agregada donde no cabe una por ítem (el tablero de /insumos).
 */
/**
 * CUMPLIMIENTO de un ítem (0221): cuánto de cuánto se cubrió, qué parte la puso un
 * tercero y cuánto falta. Espejo en la app de `public.item_cumplimiento()` y de las
 * columnas `cubierto`/`pct` de `items_de_caso()`.
 *
 * `pct` es null —no 0— cuando el ítem no tiene cantidad numérica (los heredados del texto
 * libre, §2.6 del análisis): sin denominador no hay porcentaje que enseñar, y un «0 %»
 * ahí sería mentira. En ese caso manda el estado del semáforo.
 *
 * `porTercero` es la distinción que se pidió: si TODO lo cubierto vino de fuera, el ítem
 * ya no requiere gestión nuestra y hay que poder verlo de un vistazo.
 */
export type AporteItem = { item_id: string; cantidad?: number | string | null; origen?: string | null; quien?: string | null; perfil_id?: string | null; nota?: string | null; creado_en?: string | null; id?: string };

export function cumplimientoItem(
  item: { cantidad?: number | string | null; unidad?: string | null; estado?: string | null },
  aportes: AporteItem[] = [],
): { pedido: number | null; cubierto: number; cubiertoTercero: number; falta: number | null; pct: number | null; pctTercero: number | null; medible: boolean; porTercero: boolean; hayTerceros: boolean; completo: boolean; etiqueta: string } {
  const num = (v: number | string | null | undefined) => {
    const n = typeof v === 'number' ? v : Number(v ?? NaN);
    return Number.isFinite(n) ? n : 0;
  };
  const pedidoN = item?.cantidad === null || item?.cantidad === undefined || item?.cantidad === '' ? null : num(item.cantidad);
  const medible = pedidoN !== null && pedidoN > 0;
  const cubierto = aportes.reduce((a, x) => a + num(x.cantidad), 0);
  const cubiertoTercero = aportes.filter((x) => x.origen === 'tercero').reduce((a, x) => a + num(x.cantidad), 0);
  const pct = medible ? Math.min(100, Math.round((cubierto / (pedidoN as number)) * 1000) / 10) : null;
  const pctTercero = medible ? Math.min(100, Math.round((cubiertoTercero / (pedidoN as number)) * 1000) / 10) : null;
  const falta = medible ? Math.max((pedidoN as number) - cubierto, 0) : null;
  const completo = item?.estado === 'cumplido' || (medible && cubierto >= (pedidoN as number));
  const hayTerceros = cubiertoTercero > 0;
  // «Lo cubrió un tercero» = todo lo que hay cubierto vino de fuera (y hay algo cubierto).
  const porTercero = hayTerceros && cubiertoTercero >= cubierto;
  const un = item?.unidad ? ' ' + item.unidad : '';
  const etiqueta = medible
    ? `${cantidadItem(cubierto)} de ${cantidadItem(pedidoN)}${un} — ${pct}%`
    : cubierto > 0
      ? `${cantidadItem(cubierto)}${un} registrado${cubierto === 1 ? '' : 's'}`
      : 'Sin cantidad medible';
  return { pedido: pedidoN, cubierto, cubiertoTercero, falta, pct, pctTercero, medible, porTercero, hayTerceros, completo, etiqueta };
}

/** Cobertura AGREGADA del desglose, para una tarjeta o una cabecera (espejo de
 *  `public.cobertura_items_caso()`). Los ítems cancelados quedan fuera: ya no se piden. */
export function resumenCobertura(
  items: { id: string; cantidad?: number | string | null; estado?: string | null }[],
  aportes: AporteItem[] = [],
): { pedido: number; cubierto: number; cubiertoTercero: number; pct: number | null; medibles: number; conTercero: number; etiqueta: string } {
  const vivos = items.filter((i) => (i.estado ?? 'pendiente') !== 'cancelado');
  let pedido = 0, cubierto = 0, cubiertoTercero = 0, medibles = 0, conTercero = 0;
  for (const i of vivos) {
    const suyos = aportes.filter((a) => a.item_id === i.id);
    const c = cumplimientoItem(i, suyos);
    if (c.hayTerceros) conTercero++;
    if (!c.medible) continue;
    medibles++;
    pedido += c.pedido as number;
    cubierto += Math.min(c.cubierto, c.pedido as number);
    cubiertoTercero += Math.min(c.cubiertoTercero, c.pedido as number);
  }
  const pct = pedido > 0 ? Math.min(100, Math.round((cubierto / pedido) * 1000) / 10) : null;
  const etiqueta = pct === null
    ? 'Sin cantidades medibles'
    : `${pct}% de lo pedido cubierto${conTercero > 0 ? ` · ${conTercero} por terceros` : ''}`;
  return { pedido, cubierto, cubiertoTercero, pct, medibles, conTercero, etiqueta };
}

/**
 * Los ítems CANCELADOS quedan fuera del recuento: ya no se piden, igual que en
 * `resumenCobertura` y —esto es lo importante— igual que en `public.cobertura_items_caso()`
 * (0221/0222), que los excluye con `estado <> 'cancelado'`.
 *
 * No es cosmético: `/insumos/[id]` decide con este recuento si ofrece la entrega normal o
 * la ENTREGA PARCIAL, y quien manda de verdad es la base (`gate_entrega_completa` +
 * `entregar_solicitud_insumo`). Si aquí se contara un ítem cancelado, un desglose que la
 * base considera cubierto al 100 % se le presentaría a Logística como incompleto, con un
 * diálogo que avisa de que el caso NO se dará por resuelto… cuando la RPC lo registra como
 * entrega COMPLETA y el caso sí se resuelve. Los dos lados tienen que contar lo mismo.
 */
export function resumenItems(items: { estado?: string | null }[]): { total: number; cumplidos: number; fuera: number; activos: number; completo: boolean; etiqueta: string } {
  const vivos = items.filter((i) => (i.estado ?? 'pendiente') !== 'cancelado');
  const total = vivos.length;
  const cumplidos = vivos.filter((i) => (i.estado ?? 'pendiente') === 'cumplido').length;
  const fuera = vivos.filter((i) => ESTADOS_ITEM_FUERA.includes(i.estado ?? 'pendiente')).length;
  const activos = total - cumplidos - fuera;
  const completo = total > 0 && cumplidos === total;
  const etiqueta = total === 0
    ? 'Sin desglose'
    : completo
      ? `Desglose cubierto ✓ · ${total} ${total === 1 ? 'ítem' : 'ítems'}`
      : `${cumplidos} de ${total} ${total === 1 ? 'ítem cubierto' : 'ítems cubiertos'}${fuera > 0 ? ` · ${fuera} sin cubrir` : ''}`;
  return { total, cumplidos, fuera, activos, completo, etiqueta };
}
