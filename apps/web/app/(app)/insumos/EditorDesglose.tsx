import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import { TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO, UNIDADES_ITEM, cantidadItem, ETIQUETA_ESTADO_ITEM, claseEstadoItem } from '@/lib/constantes';
import { guardarItemCaso, eliminarItemCaso, cancelarItemCaso } from '../casos/actions';

export type ItemAdmin = {
  id: string;
  orden?: number | null;
  tipo?: string | null;
  descripcion: string;
  cantidad?: number | string | null;
  unidad?: string | null;
  notas?: string | null;
  estado?: string | null;
  cubierto?: number | string | null;
  /** Hay aportes o historial: quitar debe CANCELAR, no borrar (0229). */
  tiene_rastro?: boolean | null;
  /** El ítem está en la derivación de esta área (0222). */
  mi_area?: boolean | null;
};

/**
 * EDITOR DEL DESGLOSE desde la pantalla de Logística (0229).
 *
 * Por qué existe: hasta ahora Logística solo podía MOVER el semáforo de cada ítem y
 * anotar aportes (`ItemsSemaforo`). Para agregar, quitar o corregir una línea había que
 * salirse a `/casos/[id]` —y ni siquiera había un enlace—. Pero las necesidades cambian
 * en mitad de la gestión: aparece un gasto de traslado que nadie previó, la familia ya
 * consiguió los colchones por su cuenta, el número real era otro. Ese trabajo ocurre
 * AQUÍ, así que el editor tiene que estar aquí.
 *
 * La base nunca lo impidió: `guardar_item_caso` / `eliminar_item_caso` (0218, 0219) no
 * tienen puerta por estado. Solo faltaba la pantalla.
 *
 * DOS DECISIONES QUE SE VEN EN EL CÓDIGO:
 *
 * 1) Se muestra el desglose COMPLETO, no solo lo que le tocó a Logística. Para editar
 *    hace falta ver el conjunto: si no, se duplican líneas que ya existen en la parte
 *    que se fue a otra área. Los ítems que no son de esta área salen atenuados y
 *    marcados, para que quede claro que su gestión es de otro. La exposición no cambia
 *    nada: `citems_select` (0218) ya enseña el desglose entero a toda cuenta verificada.
 *
 * 2) «Quitar» solo BORRA si el ítem está limpio. Con aportes o historial, CANCELA. El
 *    DELETE cascadea sobre `casos_item_aportes` (0221) y `casos_items_historial` (0219):
 *    borrar un ítem con «4 de 5 colchones» entregados haría desaparecer esas cuatro
 *    entregas y cambiaría la cobertura de la reportería hacia atrás. Un ítem cancelado
 *    se queda a la vista, con su registro intacto.
 */
export default function EditorDesglose({ casoId, items = [], volver, sinRepartir = 0 }: {
  casoId: string;
  items?: ItemAdmin[];
  volver: string;
  sinRepartir?: number;
}) {
  const lista = [...items].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const fuera = lista.filter((i) => i.mi_area === false).length;

  return (
    <details className="tarjeta" style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        <span className="fila" style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
          <Icono nombre="editar" size={15} /> Corregir el desglose
          <span className="muted" style={{ fontWeight: 400, fontSize: '.84rem' }}>
            · agregar, cambiar o quitar líneas
          </span>
        </span>
      </summary>

      <p className="muted" style={{ fontSize: '.84rem', margin: '8px 0 0' }}>
        Se puede en <strong>cualquier momento</strong> de la gestión: las necesidades cambian, y una solicitud
        vieja sin desglose se puede desglosar ahora. Cada cambio queda registrado con quién lo hizo y qué decía antes.
      </p>

      {fuera > 0 && (
        <p className="muted" style={{ fontSize: '.82rem', margin: '6px 0 0' }}>
          Se muestra el desglose completo para no duplicar líneas. Los <strong>{fuera}</strong>{' '}
          {fuera === 1 ? 'ítem atenuado se derivó' : 'ítems atenuados se derivaron'} a otra área: los ves, pero su gestión no es tuya.
        </p>
      )}

      {sinRepartir > 0 && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--t-amber-bg, #fffbe9)', border: '1px solid var(--t-amber-fg, #e9c94e)', borderRadius: 8, fontSize: '.84rem' }}>
          Hay <strong>{sinRepartir}</strong> {sinRepartir === 1 ? 'ítem' : 'ítems'} sin repartir a ninguna área.
          Si {sinRepartir === 1 ? 'es' : 'son'} para ti, ya {sinRepartir === 1 ? 'aparece' : 'aparecen'} abajo;
          si no, avisa a Verificación para que {sinRepartir === 1 ? 'lo derive' : 'los derive'}.
        </div>
      )}

      {lista.length === 0 && (
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '.88rem' }}>
          Esta solicitud todavía no tiene desglose. Añade la primera línea abajo y el texto de siempre se recalcula solo.
        </p>
      )}

      {lista.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }}>
          {lista.map((i) => {
            const ajeno = i.mi_area === false;
            const cerrado = i.estado === 'cancelado' || i.estado === 'cumplido';
            const cant = cantidadItem(i.cantidad);
            return (
              <li key={i.id} style={{ borderTop: '1px solid var(--borde)', paddingTop: 8, opacity: ajeno ? 0.6 : 1 }}>
                <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: '.95rem' }}>
                      {cant ? cant + (i.unidad ? ' ' + i.unidad : '') + ' · ' : ''}{i.descripcion}
                    </strong>
                    <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <Pill tono="info" punto={false}>{ETIQUETA_TIPO_INSUMO[i.tipo ?? 'otro'] ?? i.tipo}</Pill>
                      {i.estado && <Pill tono={tonoDeClase(claseEstadoItem(i.estado))}>{ETIQUETA_ESTADO_ITEM[i.estado] ?? i.estado}</Pill>}
                      {ajeno && <span className="muted" style={{ fontSize: '.78rem' }}>de otra área</span>}
                    </div>
                    {i.notas && <div className="muted" style={{ fontSize: '.82rem', marginTop: 2 }}>{i.notas}</div>}
                  </div>
                  {!cerrado && (
                    i.tiene_rastro ? (
                      <form action={cancelarItemCaso}>
                        <input type="hidden" name="caso_id" value={casoId} />
                        <input type="hidden" name="item_id" value={i.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <BotonConfirmar
                          mensaje={'¿Cancelar «' + i.descripcion + '»?\n\nNo se borra: este ítem ya tiene cosas registradas (aportes o cambios) y esa constancia se conserva. Queda marcado como cancelado.'}
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
                    )
                  )}
                </div>
                <details style={{ marginTop: 6 }}>
                  <summary className="muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>Corregir este ítem</summary>
                  <FormItemLog casoId={casoId} volver={volver} item={i} />
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ marginTop: 12, borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
        <strong className="fila" style={{ gap: 6, fontSize: '.9rem' }}><Icono nombre="mas" size={15} /> Añadir un ítem</strong>
        <p className="muted" style={{ fontSize: '.8rem', margin: '2px 0 0' }}>
          Lo que añadas aquí entra en tu parte del caso, así que lo seguirás viendo en esta pantalla.
        </p>
        <FormItemLog casoId={casoId} volver={volver} />
      </div>

      <datalist id="unidades-item-log">
        {UNIDADES_ITEM.map((u) => <option key={u} value={u} />)}
      </datalist>
    </details>
  );
}

/** Alta/edición de un ítem desde Logística. Sin `item` = alta. */
function FormItemLog({ casoId, volver, item }: { casoId: string; volver: string; item?: ItemAdmin }) {
  const id = 'log-' + (item?.id ?? 'nuevo') + '-';
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
          <input id={id + 'unidad'} name="unidad" className="input" list="unidades-item-log" maxLength={40}
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
            placeholder="Detalle útil para quien lo consiga" defaultValue={item?.notas ?? ''} />
        </div>
      </div>
      <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>
        <Icono nombre={item ? 'ok' : 'mas'} size={15} /> {item ? 'Guardar cambios del ítem' : 'Añadir al desglose'}
      </button>
    </form>
  );
}
