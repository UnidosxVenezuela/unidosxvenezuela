import Pill from './Pill';
import Icono from './Icono';
import { fechaHora } from '@/lib/fechas';
import {
  AREAS_SIGUIENTE, ETIQUETA_AREA_SIGUIENTE, ETIQUETA_ESTADO_INFO, TONO_ESTADO_INFO, cuantoFalta,
} from '@/lib/gestion';
import { pedirInfo, responderInfo, cerrarInfo } from '@/app/(app)/gestion-casos/actions';

/**
 * Solicitudes de información de un caso (0240).
 *
 * Es la «autoridad para solicitar información» de la propuesta, con sus cinco campos: qué
 * dato, a quién, por qué, para cuándo y qué desbloquea. Distinta de «Requiere información
 * adicional» (0142), que devuelve el caso a quien lo reportó: esto le pide algo concreto a
 * cualquier área sin mover el caso de sitio.
 *
 * Responder y cerrar son pasos distintos a propósito: si responder cerrara la petición,
 * «me contestaron algo que no sirve» no tendría dónde quedar registrado.
 */
export default function SolicitudesInfo({
  caso, solicitudes = [], puedePedir = false, miId, volver, personas = [],
}: {
  caso: any;
  solicitudes?: any[];
  puedePedir?: boolean;
  miId?: string;
  volver: string;
  personas?: { id: string; nombre: string }[];
}) {
  if (caso.categoria === 'Desaparecidos') return null;

  const abiertas = solicitudes.filter((s) => s.estado === 'abierta');
  const vencidas = abiertas.filter((s) => s.vence_en && new Date(s.vence_en).getTime() < Date.now());
  const cerradas = solicitudes.filter((s) => s.estado === 'cerrada');

  return (
    <div className="tarjeta" style={{ marginTop: 12 }}>
      <h3 className="aside-titulo" style={{ marginTop: 0 }}>
        <span className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
          <Icono nombre="documento" size={16} /> Información pedida
          {vencidas.length > 0 && <Pill tono="critica" punto={false}>{vencidas.length} sin llegar</Pill>}
        </span>
      </h3>

      {vencidas.length > 0 && (
        <p className="muted" style={{ fontSize: '.84rem', marginTop: 0 }}>
          Mientras haya una petición vencida sin responder, el caso aparece como <strong>bloqueado</strong> en Control.
        </p>
      )}

      {solicitudes.length === 0 ? (
        <p className="muted" style={{ fontSize: '.86rem', margin: '4px 0' }}>
          Nadie ha pedido nada todavía en este caso.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {solicitudes.filter((s) => s.estado !== 'cerrada').map((s) => {
            const f = cuantoFalta(s.vence_en);
            // Puede responder quien la recibe; la interfaz ofrece el formulario a todo el
            // que ve la fila, y la RPC decide de verdad. Si no le toca, el mensaje lo dice.
            const mia = s.responsable_id === miId;
            return (
              <div key={s.id} style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: 10 }}>
                <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <Pill tono={TONO_ESTADO_INFO[s.estado as keyof typeof TONO_ESTADO_INFO] ?? 'neutra'} punto={false}>
                    {ETIQUETA_ESTADO_INFO[s.estado as keyof typeof ETIQUETA_ESTADO_INFO] ?? s.estado}
                  </Pill>
                  {s.area && <Pill tono="neutra" punto={false}>{ETIQUETA_AREA_SIGUIENTE[s.area] ?? s.area}</Pill>}
                  {mia && <Pill tono="info" punto={false}>Te toca a ti</Pill>}
                  {f && s.estado === 'abierta' && (
                    <Pill tono={f.vencido ? 'critica' : 'neutra'} punto={false}>{f.texto}</Pill>
                  )}
                </div>

                <div style={{ fontSize: '.9rem', marginTop: 6 }}><strong>{s.dato}</strong></div>
                {s.motivo && <div className="muted" style={{ fontSize: '.84rem' }}>Por qué: {s.motivo}</div>}
                {s.resultado_esperado && (
                  <div className="muted" style={{ fontSize: '.84rem' }}>Desbloquea: {s.resultado_esperado}</div>
                )}
                <div className="muted" style={{ fontSize: '.76rem', marginTop: 4 }}>
                  Lo pidió {s.solicitante_sello} · {fechaHora(s.creado_en)}
                </div>

                {s.respuesta && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--borde)' }}>
                    <div style={{ fontSize: '.88rem' }}><strong>Respuesta:</strong> {s.respuesta}</div>
                    <div className="muted" style={{ fontSize: '.76rem' }}>{fechaHora(s.respondida_en)}</div>
                  </div>
                )}

                {s.estado === 'abierta' && (
                  <form action={responderInfo} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="volver" value={volver} />
                    <div className="fila" style={{ gap: 6, alignItems: 'flex-end' }}>
                      <div className="campo crece" style={{ marginBottom: 0 }}>
                        <label htmlFor={'r-' + s.id}>Responder</label>
                        <input id={'r-' + s.id} name="respuesta" className="input" required maxLength={2000}
                          placeholder="El dato, o dónde está" />
                      </div>
                      <button className="btn" type="submit">Enviar</button>
                    </div>
                  </form>
                )}

                {s.estado === 'respondida' && puedePedir && (
                  <form action={cerrarInfo} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="volver" value={volver} />
                    <div className="fila" style={{ gap: 6, alignItems: 'flex-end' }}>
                      <div className="campo crece" style={{ marginBottom: 0 }}>
                        <label htmlFor={'c-' + s.id}>Cerrarla (opcional: una nota)</label>
                        <input id={'c-' + s.id} name="nota" className="input" maxLength={1000}
                          placeholder="Sirve / no sirve, y por qué" />
                      </div>
                      <button className="btn" type="submit">Dar por cerrada</button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cerradas.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: '.86rem' }} className="muted">
            {cerradas.length} cerrada{cerradas.length === 1 ? '' : 's'}
          </summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {cerradas.map((s) => (
              <div key={s.id} className="muted" style={{ fontSize: '.82rem' }}>
                <strong style={{ color: 'var(--texto)' }}>{s.dato}</strong>
                {s.respuesta ? ' — ' + s.respuesta : ' — sin respuesta'}
                {s.nota_cierre ? ' · ' + s.nota_cierre : ''}
              </div>
            ))}
          </div>
        </details>
      )}

      {puedePedir && (
        <details style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--borde)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' }}>Pedir un dato o una evidencia</summary>
          <form action={pedirInfo} style={{ marginTop: 10 }}>
            <input type="hidden" name="caso" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="campo">
              <label htmlFor={'d-' + caso.id}>¿Qué hace falta?</label>
              <input id={'d-' + caso.id} name="dato" className="input" required maxLength={500}
                placeholder="Ej. Foto del acta de entrega firmada" />
            </div>
            <div className="campo">
              <label htmlFor={'m-' + caso.id}>¿Por qué? (opcional)</label>
              <input id={'m-' + caso.id} name="motivo" className="input" maxLength={1000}
                placeholder="Ej. Sin eso no se puede cerrar el caso" />
            </div>
            <div className="campo">
              <label htmlFor={'re-' + caso.id}>¿Qué desbloquea? (opcional)</label>
              <input id={'re-' + caso.id} name="resultado" className="input" maxLength={1000}
                placeholder="Ej. Poder confirmar la entrega y cerrar" />
            </div>
            <div className="fila" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="campo" style={{ marginBottom: 0, minWidth: 200 }}>
                <label htmlFor={'a-' + caso.id}>¿A qué área?</label>
                <select id={'a-' + caso.id} name="area" className="input" required defaultValue="">
                  <option value="" disabled>Elige un área…</option>
                  {AREAS_SIGUIENTE.map((a) => (
                    <option key={a} value={a}>{ETIQUETA_AREA_SIGUIENTE[a] ?? a}</option>
                  ))}
                </select>
              </div>
              {/* Persona concreta, opcional. El área sola reparte pero no compromete a
                  nadie; con nombre, el aviso le llega a quien tiene que traerlo y no a
                  veinte personas que van a suponer que lo hace otro. */}
              <div className="campo" style={{ marginBottom: 0, minWidth: 200 }}>
                <label htmlFor={'p-' + caso.id}>¿A alguien en concreto? (opcional)</label>
                <select id={'p-' + caso.id} name="responsable" className="input" defaultValue="">
                  <option value="">A quien lleve el área</option>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="campo" style={{ marginBottom: 0, minWidth: 200 }}>
                <label htmlFor={'v-' + caso.id}>¿Para cuándo?</label>
                <input id={'v-' + caso.id} name="vence" type="datetime-local" className="input" />
                <small className="muted">En blanco, según la urgencia del caso.</small>
              </div>
              <button className="btn btn-primario" type="submit">Pedir</button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
