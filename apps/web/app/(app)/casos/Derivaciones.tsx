import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import { nombreMostrado } from '@/lib/nombre';
import {
  AREAS_DESTINO, ETIQUETA_AREA_DESTINO, DESCRIPCION_AREA_DESTINO,
  PRIORIDADES_DERIVACION, ETIQUETA_PRIORIDAD_DERIVACION,
  ETIQUETA_ESTADO_DERIVACION,
} from '@/lib/constantes';
import { derivarCaso, tomarDerivacion, avanzarDerivacion, cerrarDerivacion } from './actions';

const TONO_EST: Record<string, string> = { sin_tomar: 'neutra', tomada: 'info', en_proceso: 'aviso', cerrada: 'ok' };
const TONO_PRIO: Record<string, string> = { alta: 'critica', media: 'aviso', baja: 'neutra' };

/**
 * Derivación multi-área (Requerimiento Paso 9). Un caso VALIDADO se deriva a una o
 * varias áreas de destino; cada derivación lleva su propio estado operativo y es
 * visible para todas las áreas (Paso 5). La creación la hace Verificación/Coordinación
 * (`puedeDerivar` + `casoValidado`); tomar/avanzar/cerrar solo la propia área (`areasOperables`).
 */
export default function Derivaciones({ caso, derivaciones, perfiles, volver, puedeDerivar = false, casoValidado = false, areasOperables = [], esAdmin = false }: {
  caso: any; derivaciones: any[]; perfiles: any[]; volver: string;
  puedeDerivar?: boolean; casoValidado?: boolean; areasOperables?: string[]; esAdmin?: boolean;
}) {
  const nombres = new Map<string, string>((perfiles ?? []).map((p: any) => [p.id, nombreMostrado(p.nombre_completo, esAdmin)]));
  const lista = (derivaciones ?? []) as any[];
  // No mostrar la tarjeta a quien no deriva ni tiene derivaciones que ver.
  if (!puedeDerivar && lista.length === 0) return null;

  return (
    <div className="tarjeta">
      <h3 className="aside-titulo"><Icono nombre="flecha" size={16} /> Derivar a áreas</h3>

      {/* Seguimiento de las derivaciones existentes (visible para todas las áreas). */}
      {lista.length > 0 ? (
        <div style={{ display: 'grid', gap: 8, marginBottom: puedeDerivar ? 14 : 0 }}>
          {lista.map((d) => {
            const puedeOperar = areasOperables.includes(d.area) && d.estado !== 'cerrada';
            return (
              <div key={d.id} style={{ border: '1px solid var(--borde)', borderRadius: 10, padding: '8px 10px', background: 'var(--sup2)' }}>
                <div className="fila" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ fontSize: '.9rem' }}>{ETIQUETA_AREA_DESTINO[d.area as keyof typeof ETIQUETA_AREA_DESTINO] ?? d.area}</strong>
                  <Pill tono={(TONO_EST[d.estado] ?? 'neutra') as any} punto>{ETIQUETA_ESTADO_DERIVACION[d.estado as keyof typeof ETIQUETA_ESTADO_DERIVACION] ?? d.estado}</Pill>
                  {d.prioridad && <Pill tono={(TONO_PRIO[d.prioridad] ?? 'neutra') as any} punto={false}>Prioridad {ETIQUETA_PRIORIDAD_DERIVACION[d.prioridad as keyof typeof ETIQUETA_PRIORIDAD_DERIVACION] ?? d.prioridad}</Pill>}
                </div>
                {d.accion && <p style={{ margin: '4px 0 0', fontSize: '.86rem' }}>{d.accion}</p>}
                <div className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>
                  {d.responsable_id && nombres.get(d.responsable_id) && <>Responsable sugerido: {nombres.get(d.responsable_id)} · </>}
                  Derivado {fechaHora(d.derivado_en)}
                  {d.tomado_por && nombres.get(d.tomado_por) && <> · Tomada por {nombres.get(d.tomado_por)}</>}
                  {d.estado === 'cerrada' && d.cerrado_en && <> · Cerrada {fechaHora(d.cerrado_en)}{d.motivo_cierre ? ' — ' + d.motivo_cierre : ''}</>}
                </div>
                {d.observaciones && <p className="muted" style={{ margin: '4px 0 0', fontSize: '.8rem', fontStyle: 'italic' }}>Obs.: {d.observaciones}</p>}

                {puedeOperar && (
                  <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {d.estado === 'sin_tomar' && (
                      <form action={tomarDerivacion}>
                        <input type="hidden" name="derivacion_id" value={d.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <button className="btn btn-primario" style={{ minHeight: 32, padding: '2px 10px', fontSize: '.82rem' }}><Icono nombre="ok" size={14} /> Tomar</button>
                      </form>
                    )}
                    {d.estado === 'tomada' && (
                      <form action={avanzarDerivacion}>
                        <input type="hidden" name="derivacion_id" value={d.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <button className="btn" style={{ minHeight: 32, padding: '2px 10px', fontSize: '.82rem' }}><Icono nombre="reloj" size={14} /> Marcar en proceso</button>
                      </form>
                    )}
                    {(d.estado === 'tomada' || d.estado === 'en_proceso') && (
                      <form action={cerrarDerivacion} className="fila" style={{ gap: 4, flexWrap: 'wrap' }}>
                        <input type="hidden" name="derivacion_id" value={d.id} />
                        <input type="hidden" name="volver" value={volver} />
                        <input name="motivo" className="input" placeholder="Motivo de cierre (opcional)" style={{ minHeight: 32, maxWidth: 200, flex: '1 1 160px', fontSize: '.82rem' }} />
                        <BotonConfirmar mensaje="¿Cerrar esta derivación? Marca el trabajo del área como finalizado." className="btn" style={{ minHeight: 32, padding: '2px 10px', fontSize: '.82rem' }}>
                          <Icono nombre="ok" size={14} /> Cerrar
                        </BotonConfirmar>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : puedeDerivar ? (
        <p className="muted" style={{ margin: '0 0 12px', fontSize: '.85rem' }}>Todavía no se derivó a ninguna área.</p>
      ) : null}

      {/* Formulario de derivación — solo Verificación/Coordinación y solo si el caso está Validado. */}
      {puedeDerivar && (
        casoValidado ? (
          <form action={derivarCaso} style={{ borderTop: lista.length > 0 ? '1px solid var(--borde)' : 'none', paddingTop: lista.length > 0 ? 12 : 0 }}>
            <input type="hidden" name="caso_id" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>Derivá esta solicitud Validada a una o varias áreas de destino. Cada área verá su propia tarea y podrá tomarla.</p>

            <div style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
              {AREAS_DESTINO.map((a) => (
                <label key={a} className="fila" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontWeight: 400 }}>
                  <input type="checkbox" name="areas" value={a} style={{ width: 'auto', minHeight: 0, marginTop: 3 }} />
                  <span style={{ fontSize: '.88rem' }}>
                    <strong>{ETIQUETA_AREA_DESTINO[a]}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '.78rem' }}>{DESCRIPCION_AREA_DESTINO[a]}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="grid grid-2" style={{ gap: 8 }}>
              <label className="campo">
                <span className="muted" style={{ fontSize: '.8rem' }}>Prioridad</span>
                <select name="prioridad" className="input" defaultValue="media" style={{ minHeight: 36 }}>
                  {PRIORIDADES_DERIVACION.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD_DERIVACION[p]}</option>)}
                </select>
              </label>
              <label className="campo">
                <span className="muted" style={{ fontSize: '.8rem' }}>Responsable sugerido (opcional)</span>
                <select name="responsable_id" className="input" defaultValue="" style={{ minHeight: 36 }}>
                  <option value="">— Sin asignar —</option>
                  {(perfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{nombres.get(p.id)}</option>)}
                </select>
              </label>
            </div>

            <label className="campo" style={{ marginTop: 8, display: 'block' }}>
              <span className="muted" style={{ fontSize: '.8rem' }}>Acción requerida</span>
              <input name="accion" className="input" placeholder="Qué se espera del área (ej. «Coordinar traslado de 20 kits»)" style={{ minHeight: 36 }} />
            </label>
            <label className="campo" style={{ marginTop: 8, display: 'block' }}>
              <span className="muted" style={{ fontSize: '.8rem' }}>Observaciones internas (opcional)</span>
              <textarea name="observaciones" className="input" rows={2} placeholder="Notas para el área de destino" style={{ resize: 'vertical' }} />
            </label>

            <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 10 }}><Icono nombre="flecha" size={16} /> Derivar a las áreas marcadas</button>
          </form>
        ) : (
          <p className="muted fila" style={{ gap: 6, margin: lista.length > 0 ? '12px 0 0' : 0, fontSize: '.85rem' }}>
            <Icono nombre="llave" size={14} /> Para derivar, la verificación debe estar completa: marca en verde 🟢 todos los campos del semáforo (estado <strong>Validado</strong>).
          </p>
        )
      )}
    </div>
  );
}
