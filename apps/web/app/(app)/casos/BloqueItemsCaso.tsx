import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import { TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO, UNIDADES_ITEM, cantidadItem } from '@/lib/constantes';
import { guardarItemCaso, eliminarItemCaso, reordenarItemsCaso } from './actions';

export type ItemCaso = {
  id: string;
  orden?: number | null;
  tipo?: string | null;
  descripcion: string;
  cantidad?: number | string | null;
  unidad?: string | null;
  cantidad_texto?: string | null;
  notas?: string | null;
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
 */
export default function BloqueItemsCaso({ casoId, items = [], reqCantidad, reqTipo, volver, puedeGestionar = false }: {
  casoId: string;
  items?: ItemCaso[];
  reqCantidad?: string | null;
  reqTipo?: string | null;
  volver: string;
  puedeGestionar?: boolean;
}) {
  const lista = [...items].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
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
                      <form action={eliminarItemCaso}>
                        <input type="hidden" name="caso_id" value={casoId} />
                        <input type="hidden" name="item_id" value={i.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <BotonConfirmar
                          mensaje={'¿Quitar «' + i.descripcion + '» del desglose?'}
                          className="btn" style={{ minHeight: 30, padding: '1px 8px', fontSize: '.8rem', color: 'var(--critica)' }}>
                          <Icono nombre="basura" size={14} />
                        </BotonConfirmar>
                      </form>
                    </div>
                  )}
                </div>

                {puedeGestionar && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>Editar este ítem</summary>
                    <FormItem casoId={casoId} volver={volver} item={i} />
                  </details>
                )}
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
