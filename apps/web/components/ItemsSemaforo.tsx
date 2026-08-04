import Icono from './Icono';
import Pill, { tonoDeClase } from './Pill';
import FlujoProgreso from './FlujoProgreso';
import BotonConfirmar from './BotonConfirmar';
import AportesItem, { BarraCobertura, pctTerceros, type AporteItem, type OpcionCapacidad } from './AportesItem';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_ITEM, claseEstadoItem, cantidadItem, TRANSICIONES_ITEM, siguienteEstadoItem } from '@/lib/constantes';
import { pasoDeItem, resumenItems, resumenCobertura } from '@/lib/flujo';

export type ItemSemaforo = {
  id: string;
  orden?: number | null;
  tipo?: string | null;
  descripcion: string;
  cantidad?: number | string | null;
  unidad?: string | null;
  cantidad_texto?: string | null;
  estado?: string | null;
  notas?: string | null;
};

/**
 * Semáforo de PASOS por ÍTEM (0220): una barra de avance por cada cosa que hace falta,
 * más una barra agregada arriba. Es lo que permite ver, desde CUALQUIER área, que el agua
 * ya va en ruta mientras las medicinas siguen sin conseguirse.
 *
 * Solo presentación (Server Component puro): la barra es el mismo `FlujoProgreso` que usa
 * el resto de la plataforma —sin tocarlo— para que el avance se lea igual en todas partes.
 *
 * Es de SOLO LECTURA salvo que se le pase `alAvanzar`: esa Server Action llega como prop
 * (no se importa aquí) para que el componente siga siendo compartido y quien lo usa decida
 * si además de mostrar, deja mover. Mover el semáforo es de Logística: la RPC
 * `avanzar_item` revalida el permiso y la transición, así que estos botones solo evitan
 * ofrecer lo imposible.
 *
 * Desde 0221 cada ítem muestra además su CUMPLIMIENTO —«4 de 5 colchones — 80 %», quién
 * aportó cuánto y si lo cubrió un tercero— vía `AportesItem`. Ese bloque se ve SIEMPRE
 * (Redacción necesita saber que algo ya lo cubrió otra ONG para dejar de difundirlo); lo
 * que depende de las acciones que se pasen es poder escribir en él.
 */
export default function ItemsSemaforo({
  items = [], titulo = 'Avance por ítem', nota, alAvanzar, volver = '', compacto = false,
  aportes = [], verFull = false, alAportar, alTercero, alQuitarAporte, capacidades = [],
}: {
  items?: ItemSemaforo[];
  titulo?: string;
  nota?: string;
  alAvanzar?: (formData: FormData) => void | Promise<void>;
  volver?: string;
  compacto?: boolean;
  aportes?: AporteItem[];
  verFull?: boolean;
  alAportar?: (formData: FormData) => void | Promise<void>;
  alTercero?: (formData: FormData) => void | Promise<void>;
  alQuitarAporte?: (formData: FormData) => void | Promise<void>;
  /** Capacidad comprometida con margen HOY (0224), para descontarla al registrar el aporte. */
  capacidades?: OpcionCapacidad[];
}) {
  if (items.length === 0) return null;
  const lista = [...items].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const r = resumenItems(lista);
  const cob = resumenCobertura(lista, aportes);
  const porItem = new Map<string, AporteItem[]>();
  for (const a of aportes) {
    const arr = porItem.get(a.item_id);
    if (arr) arr.push(a); else porItem.set(a.item_id, [a]);
  }

  const textoCantidad = (i: ItemSemaforo) => {
    const n = cantidadItem(i.cantidad);
    if (n) return n + (i.unidad ? ' ' + i.unidad : '');
    return (i.cantidad_texto ?? '').trim();
  };

  return (
    <div className="tarjeta" style={{ marginTop: 12 }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="aside-titulo" style={{ margin: 0 }}><Icono nombre="caja" size={16} /> {titulo}</h3>
        <span className="muted" style={{ fontSize: '.82rem' }}>{r.cumplidos} de {r.total} {r.total === 1 ? 'ítem' : 'ítems'}</span>
      </div>
      {nota && <p className="muted" style={{ fontSize: '.82rem', margin: '4px 0 0' }}>{nota}</p>}

      {/* `r.total` cuenta solo los ítems VIVOS (los cancelados quedan fuera, igual que en
          public.cobertura_items_caso). Con todo el desglose cancelado la barra no tiene
          segmentos que pintar: se muestra el texto y ya. */}
      {r.total > 0 && (
        <div style={{ marginTop: 8 }}>
          <FlujoProgreso paso={r.cumplidos} total={r.total} completo={r.completo} etiqueta={r.etiqueta} />
        </div>
      )}
      {/* Cobertura AGREGADA por cantidad (0221): «3 de 5 ítems» no es lo mismo que «80 %
          de lo pedido». Las dos lecturas hacen falta y se muestran juntas. */}
      {cob.pct !== null && (
        <BarraCobertura pct={cob.pct} pctTercero={pctTerceros(cob.cubiertoTercero, cob.pedido)}
          etiqueta={cob.etiqueta} aria="Cobertura del desglose por cantidad" />
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 10 }}>
        {lista.map((i) => {
          const p = pasoDeItem(i);
          const cant = textoCantidad(i);
          const estado = i.estado ?? 'pendiente';
          const sig = siguienteEstadoItem(estado);
          const permitidas = TRANSICIONES_ITEM[estado] ?? [];
          const otras = permitidas.filter((e) => e !== sig);
          return (
            <li key={i.id} style={{ borderTop: '1px solid var(--borde)', paddingTop: 8 }}>
              <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: '.95rem' }}>{cant ? cant + ' · ' : ''}{i.descripcion}</strong>
                  <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    <span className="insignia">{ETIQUETA_TIPO_INSUMO[i.tipo ?? 'otro'] ?? i.tipo}</span>
                    <Pill tono={tonoDeClase(claseEstadoItem(estado))}>{ETIQUETA_ESTADO_ITEM[estado] ?? estado}</Pill>
                  </div>
                  {i.notas && <div className="muted" style={{ fontSize: '.82rem', marginTop: 2 }}>{i.notas}</div>}
                </div>
              </div>

              <div style={{ marginTop: 6 }}>
                <FlujoProgreso paso={p.paso} total={p.total} fuera={p.fuera} completo={p.completo} etiqueta={p.etiqueta} compacto={compacto} />
              </div>

              {/* Cumplimiento del ítem (0221): cuánto de cuánto, quién aportó y si lo
                  cubrió un tercero. Se ve desde todas las áreas; escribir es de Logística. */}
              <AportesItem
                item={i} aportes={porItem.get(i.id) ?? []} verFull={verFull} volver={volver}
                alAportar={alAportar} alTercero={alTercero} alQuitar={alQuitarAporte}
                capacidades={capacidades} />


              {alAvanzar && permitidas.length > 0 && (
                <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {sig && permitidas.includes(sig) && (
                    <form action={alAvanzar}>
                      <input type="hidden" name="item_id" value={i.id} />
                      <input type="hidden" name="estado" value={sig} />
                      <input type="hidden" name="volver" value={volver} />
                      <button className="btn btn-primario" style={{ minHeight: 30, padding: '1px 10px', fontSize: '.8rem' }} type="submit">
                        <Icono nombre="flecha" size={14} /> {ETIQUETA_ESTADO_ITEM[sig] ?? sig}
                      </button>
                    </form>
                  )}
                  {otras.map((e) => (
                    <form key={e} action={alAvanzar}>
                      <input type="hidden" name="item_id" value={i.id} />
                      <input type="hidden" name="estado" value={e} />
                      <input type="hidden" name="volver" value={volver} />
                      {e === 'cancelado' || e === 'no_disponible' ? (
                        <BotonConfirmar
                          mensaje={e === 'cancelado'
                            ? '¿Cancelar «' + i.descripcion + '»? Sale del desglose activo.'
                            : '¿Marcar «' + i.descripcion + '» como no cubierto? Queda a la vista de todas las áreas para priorizar su difusión.'}
                          className="btn" style={{ minHeight: 30, padding: '1px 10px', fontSize: '.8rem' }}>
                          {ETIQUETA_ESTADO_ITEM[e] ?? e}
                        </BotonConfirmar>
                      ) : (
                        <button className="btn" style={{ minHeight: 30, padding: '1px 10px', fontSize: '.8rem' }} type="submit">
                          {ETIQUETA_ESTADO_ITEM[e] ?? e}
                        </button>
                      )}
                    </form>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
