import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import FlujoProgreso from '@/components/FlujoProgreso';
import { TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO, UNIDADES_ITEM, cantidadItem, ETIQUETA_ESTADO_ITEM, claseEstadoItem } from '@/lib/constantes';
import { pasoDeItem } from '@/lib/flujo';
import AportesItem, { BarraCobertura, pctTerceros, type AporteItem } from '@/components/AportesItem';
import { resumenCobertura } from '@/lib/flujo';
import { guardarItemCaso, eliminarItemCaso, reordenarItemsCaso, cancelarItemCaso } from './actions';
import HistorialItem, { type CambioItem } from './HistorialItem';

export type ItemCaso = {
  id: string;
  orden?: number | null;
  tipo?: string | null;
  descripcion: string;
  cantidad?: number | string | null;
  unidad?: string | null;
  cantidad_texto?: string | null;
  notas?: string | null;
  /** Paso del ítem (0220). Si no viene, la barra de avance no se pinta. */
  estado?: string | null;
};

/**
 * Desglose por ÍTEM de lo que necesita una solicitud (0218). Antes, «qué se necesita»
 * era una sola línea de texto libre (`casos.req_cantidad`: «50 cajas de agua y 200
 * raciones»), imposible de medir. Ahora cada necesidad es una fila con cantidad
 * NUMÉRICA + unidad + tipo, que se puede cubrir, derivar y contar por separado.
 *
 * Degradación (los casos anteriores a esta migración NO tienen ítems): si la lista está
 * vacía se muestra el texto libre que ya existía, como referencia, y se invita a
 * desglosarlo. Mismo patrón best-effort que usa `insumos/[id]/page.tsx`.
 *
 * La escritura va por las RPC (`guardar_item_caso` / `eliminar_item_caso` /
 * `reordenar_items_caso`); `puedeGestionar` solo decide si se pinta el editor.
 *
 * Cada ítem muestra además su HISTORIAL de cambios (0219): como el desglose lo mantienen
 * Recopilación, Verificación y Logística a la vez, y lo que se necesita cambia con el
 * tiempo, cada modificación queda registrada (valor anterior → nuevo, quién y cuándo).
 * El historial lo ve todo el equipo, no solo quien puede editar.
 *
 * Y su CUMPLIMIENTO (0221), de solo lectura: cuánto se cubrió de cuánto, quién lo aportó y
 * si lo cubrió un tercero. Registrarlo es trabajo de Logística y se hace en /insumos; aquí
 * se VE, que es lo que necesitan Verificación y Recopilación para saber qué sigue faltando
 * de verdad —y para no volver a pedir lo que ya cubrió otra organización—.
 */
export default function BloqueItemsCaso({ casoId, items = [], reqCantidad, reqTipo, volver, puedeGestionar = false, cambios = [], nombres, aportes = [], verFull = false }: {
  casoId: string;
  items?: ItemCaso[];
  reqCantidad?: string | null;
  reqTipo?: string | null;
  volver: string;
  puedeGestionar?: boolean;
  cambios?: CambioItem[];
  nombres?: Map<string, string>;
  aportes?: AporteItem[];
  verFull?: boolean;
}) {
  // Historial agrupado por ítem, más reciente primero (la consulta ya llega ordenada).
  const cambiosPorItem = new Map<string, CambioItem[]>();
  for (const c of (cambios ?? [])) {
    const arr = cambiosPorItem.get(c.item_id);
    if (arr) arr.push(c); else cambiosPorItem.set(c.item_id, [c]);
  }
  // Aportes agrupados por ítem (0221): cuánto se cubrió y quién lo puso.
  const aportesPorItem = new Map<string, AporteItem[]>();
  for (const a of (aportes ?? [])) {
    const arr = aportesPorItem.get(a.item_id);
    if (arr) arr.push(a); else aportesPorItem.set(a.item_id, [a]);
  }
  const lista = [...items].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const cob = resumenCobertura(lista, aportes ?? []);
  const ids = lista.map((i) => i.id);
  // Orden resultante de mover el ítem `k` una posición arriba/abajo (lo calcula el
  // servidor y viaja en un campo oculto: sin JavaScript de por medio).
  const ordenMovido = (k: number, delta: number) => {
    const arr = [...ids];
    const j = k + delta;
    if (j < 0 || j >= arr.length) return null;
    [arr[k], arr[j]] = [arr[j]!, arr[k]!];
    return arr.join(',');
  };
  const textoCantidad = (i: ItemCaso) => {
    const n = cantidadItem(i.cantidad);
    if (n) return n + (i.unidad ? ' ' + i.unidad : '');
    return (i.cantidad_texto ?? '').trim();
  };

  return (
    <div className="tarjeta" style={{ marginTop: 12, borderColor: 'var(--t-teal-fg)' }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="aside-titulo" style={{ margin: 0 }}><Icono nombre="caja" size={16} /> Qué se necesita · desglose</h3>
        {lista.length > 0 && <span className="muted" style={{ fontSize: '.82rem' }}>{lista.length} {lista.length === 1 ? 'ítem' : 'ítems'}</span>}
      </div>
      <p className="muted" style={{ fontSize: '.82rem', margin: '4px 0 0' }}>
        Una línea por cada cosa que hace falta, con su cantidad. Así Logística puede cubrir lo que consiga y queda claro qué sigue faltando.
      </p>
      {/* Cobertura agregada por cantidad (0221). El tramo en teal es lo que cubrió un
          tercero: no lo pusimos nosotros y ya no hay que gestionarlo. */}
      {cob.pct !== null && (
        <BarraCobertura pct={cob.pct} pctTercero={pctTerceros(cob.cubiertoTercero, cob.pedido)}
          etiqueta={cob.etiqueta} aria="Cobertura del desglose por cantidad" />
      )}

      {lista.length === 0 && (
        (reqCantidad || reqTipo) ? (
          <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--t-teal-bg)', border: '1px solid var(--t-teal-fg)', borderRadius: 8 }}>
            <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {reqTipo && <Pill tono="info" punto={false}>{ETIQUETA_TIPO_INSUMO[reqTipo] ?? reqTipo}</Pill>}
              <span>{reqCantidad || <span className="muted">Sin cantidad indicada</span>}</span>
            </div>
            <p className="muted" style={{ fontSize: '.78rem', margin: '6px 0 0' }}>
              Esta solicitud se registró antes del desglose por ítem: lo de arriba es el texto tal como se escribió.
              {puedeGestionar ? ' Puedes separarlo en ítems abajo (el texto se recalcula solo).' : ''}
            </p>
          </div>
        ) : (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: '.88rem' }}>Todavía no hay ítems en el desglose.</p>
        )
      )}

      {lista.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }}>
          {lista.map((i, k) => {
            const cant = textoCantidad(i);
            const arriba = ordenMovido(k, -1);
            const abajo = ordenMovido(k, 1);
            return (
              <li key={i.id} style={{ borderTop: '1px solid var(--borde)', paddingTop: 8 }}>
                <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: '.95rem' }}>{cant ? cant + ' · ' : ''}{i.descripcion}</strong>
                    <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <Pill tono="info" punto={false}>{ETIQUETA_TIPO_INSUMO[i.tipo ?? 'otro'] ?? i.tipo}</Pill>
                      {/* Paso del ítem (0220). Lo mueve Logística desde /insumos; aquí se
                          VE, para saber qué se consiguió ya y qué sigue faltando. */}
                      {i.estado && <Pill tono={tonoDeClase(claseEstadoItem(i.estado))}>{ETIQUETA_ESTADO_ITEM[i.estado] ?? i.estado}</Pill>}
                      {!cant && <span className="muted" style={{ fontSize: '.8rem' }}>sin cantidad</span>}
                    </div>
                    {i.notas && <div className="muted" style={{ fontSize: '.82rem', marginTop: 2 }}>{i.notas}</div>}
                  </div>
                  {puedeGestionar && (
                    <div className="fila" style={{ gap: 4 }}>
                      {arriba && (
                        <form action={reordenarItemsCaso}>
                          <input type="hidden" name="caso_id" value={casoId} />
                          <input type="hidden" name="volver" value={volver} />
                          <input type="hidden" name="items" value={arriba} />
                          <button className="btn" style={{ minHeight: 30, padding: '1px 8px', fontSize: '.8rem' }} title="Subir" aria-label="Subir el ítem">↑</button>
                        </form>
                      )}
                      {abajo && (
                        <form action={reordenarItemsCaso}>
                          <input type="hidden" name="caso_id" value={casoId} />
                          <input type="hidden" name="volver" value={volver} />
                          <input type="hidden" name="items" value={abajo} />
                          <button className="btn" style={{ minHeight: 30, padding: '1px 8px', fontSize: '.8rem' }} title="Bajar" aria-label="Bajar el ítem">↓</button>
                        </form>
                      )}
                      {/* Quitar. Si el ítem YA DEJÓ RASTRO —aportes anotados o historial de
                          cambios— no se borra: se CANCELA. El DELETE va en cascada sobre
                          sus aportes (0221) y su historial (0219), así que borrar un ítem
                          con «4 de 5 colchones» entregados haría desaparecer esas cuatro
                          entregas y cambiaría la cobertura de la reportería hacia atrás.
                          El ítem cancelado se queda a la vista, con su registro intacto. */}
                      {(() => {
                        const conRastro = (aportesPorItem.get(i.id)?.length ?? 0) > 0
                                       || (cambiosPorItem.get(i.id)?.length ?? 0) > 0;
                        const yaCerrado = i.estado === 'cancelado';
                        if (yaCerrado) return null;
                        return conRastro ? (
                          <form action={cancelarItemCaso}>
                            <input type="hidden" name="caso_id" value={casoId} />
                            <input type="hidden" name="item_id" value={i.id} />
                            <input type="hidden" name="volver" value={volver} />
                            <BotonConfirmar
                              mensaje={'¿Cancelar «' + i.descripcion + '»? No se borra: este ítem ya tiene cosas registradas —aportes o cambios— y esa constancia se conserva. Queda marcado como cancelado.'}
                              className="btn" style={{ minHeight: 30, padding: '1px 8px', fontSize: '.8rem', color: 'var(--critica)' }}
                              title="Cancelar el ítem (conserva lo registrado)">
                              Cancelar
                            </BotonConfirmar>
                          </form>
                        ) : (
                          <form action={eliminarItemCaso}>
                            <input type="hidden" name="caso_id" value={casoId} />
                            <input type="hidden" name="item_id" value={i.id} />
                            <input type="hidden" name="volver" value={volver} />
                            <BotonConfirmar
                              mensaje={'¿Quitar «' + i.descripcion + '» del desglose?'}
                              className="btn" style={{ minHeight: 30, padding: '1px 8px', fontSize: '.8rem', color: 'var(--critica)' }}
                              title="Quitar el ítem">
                              <Icono nombre="basura" size={14} />
                            </BotonConfirmar>
                          </form>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Semáforo de PASOS del ítem (0220): la misma barra que usa el resto de
                    la plataforma, para que el avance se lea igual desde Verificación, desde
                    Logística y desde Redacción. */}
                {i.estado && (() => {
                  const p = pasoDeItem(i);
                  return (
                    <div style={{ marginTop: 6 }}>
                      <FlujoProgreso paso={p.paso} total={p.total} fuera={p.fuera} completo={p.completo} etiqueta={p.etiqueta} />
                    </div>
                  );
                })()}

                {/* Cumplimiento del ítem (0221), de solo lectura: cuánto se cubrió, quién
                    lo puso y si lo cubrió un tercero. Lo registra Logística en /insumos. */}
                <AportesItem item={i} aportes={aportesPorItem.get(i.id) ?? []} verFull={verFull} soloLectura />

                {puedeGestionar && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>Editar este ítem</summary>
                    <FormItem casoId={casoId} volver={volver} item={i} />
                  </details>
                )}

                {/* Qué se cambió en este ítem y quién lo cambió (0219). Solo aparece si
                    hubo cambios: un ítem recién creado no tiene nada que mostrar. */}
                <HistorialItem cambios={cambiosPorItem.get(i.id) ?? []} nombres={nombres} />
              </li>
            );
          })}
        </ul>
      )}

      {puedeGestionar && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
          <strong className="fila" style={{ gap: 6, fontSize: '.9rem' }}><Icono nombre="mas" size={15} /> Añadir un ítem</strong>
          <FormItem casoId={casoId} volver={volver} />
        </div>
      )}

      <datalist id="unidades-item">
        {UNIDADES_ITEM.map((u) => <option key={u} value={u} />)}
      </datalist>
    </div>
  );
}

/** Formulario de alta/edición de un ítem. Sin `item` = alta. */
function FormItem({ casoId, volver, item }: { casoId: string; volver: string; item?: ItemCaso }) {
  const id = (item?.id ?? 'nuevo') + '-';
  return (
    <form action={guardarItemCaso} style={{ marginTop: 6 }}>
      <input type="hidden" name="caso_id" value={casoId} />
      <input type="hidden" name="volver" value={volver} />
      {item && <input type="hidden" name="item_id" value={item.id} />}
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor={id + 'cantidad'}>Cantidad</label>
          <input id={id + 'cantidad'} name="cantidad" className="input" type="number" min={0} step="any"
            inputMode="decimal" placeholder="Ej.: 50" defaultValue={cantidadItem(item?.cantidad)} />
        </div>
        <div className="campo">
          <label htmlFor={id + 'unidad'}>Unidad</label>
          <input id={id + 'unidad'} name="unidad" className="input" list="unidades-item" maxLength={40}
            placeholder="Ej.: cajas · litros · kits" defaultValue={item?.unidad ?? ''} />
        </div>
      </div>
      <div className="campo">
        <label htmlFor={id + 'descripcion'}>¿Qué es? *</label>
        <input id={id + 'descripcion'} name="descripcion" className="input" required maxLength={300}
          placeholder="Ej.: agua potable en botellones de 5 L" defaultValue={item?.descripcion ?? ''} />
      </div>
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor={id + 'tipo'}>Tipo de ayuda</label>
          <select id={id + 'tipo'} name="tipo" className="input" defaultValue={item?.tipo ?? 'otro'}>
            {TIPOS_INSUMO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_INSUMO[t]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor={id + 'notas'}>Nota (opcional)</label>
          <input id={id + 'notas'} name="notas" className="input" maxLength={500}
            placeholder="Detalle útil para Logística" defaultValue={item?.notas ?? ''} />
        </div>
      </div>
      <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>
        <Icono nombre={item ? 'ok' : 'mas'} size={15} /> {item ? 'Guardar cambios del ítem' : 'Añadir al desglose'}
      </button>
    </form>
  );
}
