import Icono from './Icono';
import Pill, { tonoDeClase } from './Pill';
import { fechaCorta } from '@/lib/fechas';
import {
  ETIQUETA_TIPO_INSUMO, ETIQUETA_PERIODICIDAD, SUFIJO_PERIODICIDAD,
  ETIQUETA_VIGENCIA_CAPACIDAD, claseVigenciaCapacidad, cantidadItem,
} from '@/lib/constantes';

/**
 * Una fila de `public.capacidades_de_proveedor()` (0224), tal cual la devuelve la RPC:
 * la capacidad declarada por Alianzas MÁS el cálculo de la ventana vigente y lo que
 * queda. La app no recalcula nada de esto — la ventana la fija la base.
 */
export type Capacidad = {
  id: string;
  proveedor_id?: string | null;
  proveedor?: string | null;
  proveedor_activo?: boolean | null;
  tipo?: string | null;
  descripcion: string;
  cantidad: number | string;
  unidad?: string | null;
  periodicidad: string;
  puntual?: boolean | null;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  activa?: boolean | null;
  notas?: string | null;
  estado_vigencia?: string | null;
  vigente?: boolean | null;
  caduca_en?: number | null;
  ventana_desde?: string | null;
  ventana_hasta?: string | null;
  usado?: number | string | null;
  restante?: number | string | null;
  pct?: number | string | null;
  usado_total?: number | string | null;
  ultimo_uso?: string | null;
};

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** «50 raciones» / «1 camión» — la unidad es opcional a propósito (0218). */
export function conUnidad(cantidad: number | string | null | undefined, unidad?: string | null): string {
  return cantidadItem(cantidad) + (unidad ? ' ' + unidad : '');
}

/**
 * Cómo se lee un compromiso en una línea: «50 raciones por semana», «100 unidades en
 * total». Es el texto que tiene que coincidir palabra por palabra en las dos pantallas
 * (Alianzas declara / Logística cuenta con ello) para que signifique lo mismo.
 */
export function frasePeriodicidad(c: Pick<Capacidad, 'cantidad' | 'unidad' | 'periodicidad'>): string {
  return conUnidad(c.cantidad, c.unidad) + ' ' + (SUFIJO_PERIODICIDAD[c.periodicidad] ?? '');
}

/**
 * Las insignias que separan de un vistazo LO PUNTUAL de LO QUE CADUCA de LO RECURRENTE
 * —la distinción que se pidió explícitamente—. Van juntas en un solo sitio para que se
 * pinten igual en Alianzas y en Logística.
 */
export function InsigniasCapacidad({ cap }: { cap: Capacidad }) {
  const esUnica = cap.periodicidad === 'unica';
  const caduca = typeof cap.caduca_en === 'number' ? cap.caduca_en : null;
  const estado = cap.estado_vigencia ?? (cap.activa === false ? 'retirada' : 'vigente');
  return (
    <span className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
      {esUnica
        ? <Pill tono="alta" punto={false}>⏱ Una sola vez</Pill>
        : <Pill tono="info" punto={false}>🔁 {ETIQUETA_PERIODICIDAD[cap.periodicidad] ?? cap.periodicidad}</Pill>}
      {estado !== 'vigente' && (
        <Pill tono={tonoDeClase(claseVigenciaCapacidad(estado))} punto={false}>
          {ETIQUETA_VIGENCIA_CAPACIDAD[estado] ?? estado}
        </Pill>
      )}
      {estado === 'vigente' && caduca !== null && caduca <= 15 && (
        <Pill tono="aviso" punto={false}>
          ⚠ {caduca === 0 ? 'Caduca hoy' : caduca === 1 ? 'Caduca mañana' : 'Caduca en ' + caduca + ' días'}
        </Pill>
      )}
      {estado === 'vigente' && caduca !== null && caduca > 15 && (
        <Pill tono="neutra" punto={false}>Hasta el {fechaCorta(cap.vigencia_hasta)}</Pill>
      )}
    </span>
  );
}

/**
 * LO QUE QUEDA — el dato por el que existe todo esto: «para tener claridad de con qué
 * capacidad de respuesta se cuenta». Se pinta como número grande, no como porcentaje:
 * a Logística no le sirve «80 %», le sirve «quedan 20 raciones esta semana».
 *
 * La barra muestra lo YA CONSUMIDO de la ventana en curso, para que se vea de un vistazo
 * si al aliado le queda margen o está exprimido. Una capacidad no vigente se pinta en
 * gris y con el motivo (caducada / aún no empieza / retirada), nunca como «0 sin más»:
 * «se agotó» y «se acabó el trato» exigen decisiones distintas.
 */
export function RestanteCapacidad({ cap, compacto = false }: { cap: Capacidad; compacto?: boolean }) {
  const vigente = cap.vigente ?? (cap.estado_vigencia ? cap.estado_vigencia === 'vigente' : true);
  const total = num(cap.cantidad);
  const usado = num(cap.usado);
  const restante = num(cap.restante);
  const pct = total > 0 ? Math.min(100, Math.round((usado / total) * 1000) / 10) : 0;
  const estado = cap.estado_vigencia ?? 'vigente';

  if (!vigente) {
    return (
      <div className="cap-hero cap-hero-off">
        <span className="cap-num">—</span>
        <span className="cap-txt">
          {estado === 'pendiente' && cap.vigencia_desde
            ? 'Disponible a partir del ' + fechaCorta(cap.vigencia_desde)
            : estado === 'caducada'
              ? 'El acuerdo terminó el ' + fechaCorta(cap.vigencia_hasta)
              : (ETIQUETA_VIGENCIA_CAPACIDAD[estado] ?? 'No disponible') + ': hoy no se puede contar con esto'}
        </span>
      </div>
    );
  }

  return (
    <div className={'cap-hero' + (restante <= 0 ? ' cap-hero-cero' : '')}>
      <span className="cap-num">{cantidadItem(restante)}</span>
      <span className="cap-txt">
        {restante <= 0 ? 'sin margen' : 'disponibles'}
        {cap.unidad ? ' · ' + cap.unidad : ''}
        {cap.periodicidad !== 'unica' && <> <span className="muted">esta {ETIQUETA_PERIODICIDAD[cap.periodicidad]?.replace('Cada ', '') ?? 'ventana'}</span></>}
      </span>
      {!compacto && (
        <div className="cob-item" style={{ width: '100%' }}>
          <div className="cobertura-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
            aria-label={'Consumido de la capacidad de ' + cap.descripcion}>
            <div className="cobertura-fill capacidad" style={{ width: pct + '%' }} />
          </div>
          <span className="cob-txt">{cantidadItem(usado)} de {conUnidad(total, cap.unidad)} usados</span>
        </div>
      )}
    </div>
  );
}

/**
 * La tarjeta completa de un compromiso. Server Component puro: las acciones (editar,
 * retirar) llegan como `acciones` desde la pantalla que las tenga permitidas, igual que
 * hace `AportesItem` (0221). La autorización real vive en las RPC, no en estos botones.
 */
export default function TarjetaCapacidad({ cap, acciones, conProveedor = false }: {
  cap: Capacidad; acciones?: React.ReactNode; conProveedor?: boolean;
}) {
  const total = num(cap.cantidad);
  const usadoTotal = num(cap.usado_total);
  return (
    <div className={'tarjeta cap-tarjeta' + (cap.vigente === false ? ' cap-off' : '')} style={{ padding: 12 }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          {conProveedor && cap.proveedor && (
            <div className="muted fila" style={{ gap: 4, fontSize: '.78rem' }}>
              <Icono nombre="usuario" size={12} /> {cap.proveedor}
            </div>
          )}
          <strong style={{ fontSize: '.98rem' }}>{cap.descripcion}</strong>
          <div className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>
            {ETIQUETA_TIPO_INSUMO[cap.tipo ?? 'otro'] ?? cap.tipo} · compromiso de {frasePeriodicidad(cap)}
          </div>
        </div>
        <InsigniasCapacidad cap={cap} />
      </div>

      <RestanteCapacidad cap={cap} />

      {(cap.ventana_desde || usadoTotal > 0 || cap.notas) && (
        <div className="muted" style={{ fontSize: '.76rem', marginTop: 6, display: 'grid', gap: 2 }}>
          {cap.ventana_desde && cap.ventana_hasta && (
            <span>Ventana en curso: {fechaCorta(cap.ventana_desde)} → {fechaCorta(cap.ventana_hasta)}</span>
          )}
          {cap.periodicidad === 'unica' && total > 0 && (
            <span>No se renueva: la cantidad es un total que se va agotando.</span>
          )}
          {usadoTotal > 0 && (
            <span>
              Ha aportado {conUnidad(usadoTotal, cap.unidad)} en total
              {cap.ultimo_uso ? ' · última vez el ' + fechaCorta(cap.ultimo_uso) : ''}
            </span>
          )}
          {cap.notas && <span>{cap.notas}</span>}
        </div>
      )}

      {acciones && <div className="fila" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>{acciones}</div>}
    </div>
  );
}
