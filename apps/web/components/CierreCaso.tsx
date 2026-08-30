import Pill from './Pill';
import Icono from './Icono';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_CRITERIO } from '@/lib/gestion';
import { cerrarCaso, reabrirCaso } from '@/app/(app)/gestion-casos/actions';

/**
 * Cierre documentado y reapertura de un caso (0243).
 *
 * Los criterios los CALCULA la base de datos —no son casillas que alguien tilda—, así que
 * lo que se ve aquí es lo que de verdad hay: desglose, entrega, evidencia, peticiones de
 * información y derivaciones.
 *
 * Se puede cerrar con criterios sin cumplir, y entonces la nota es obligatoria: en una
 * emergencia nadie deja un caso abierto porque falte un papel, pero cerrarlo en silencio no
 * es una opción. Quien decide es la RPC; esto solo evita el error a ciegas.
 */
export default function CierreCaso({
  caso, criterios = [], cierres = [], puedeCerrar = false, volver,
}: {
  caso: any;
  criterios?: { criterio: string; cumplido: boolean; detalle: string }[];
  cierres?: any[];
  puedeCerrar?: boolean;
  volver: string;
}) {
  if (caso.categoria === 'Desaparecidos') return null;

  const estado = String(caso.estado ?? '');
  const cerrable = ['confirmado', 'enviado_redaccion'].includes(estado);
  const resuelto = estado === 'resuelto';
  if (!cerrable && !resuelto) return null;

  const faltan = criterios.filter((c) => !c.cumplido);
  const completo = criterios.length > 0 && faltan.length === 0;
  const ultimoCierre = cierres.find((c) => c.accion === 'cierre');

  return (
    <div className="tarjeta" style={{ marginTop: 12 }}>
      <h3 className="aside-titulo" style={{ marginTop: 0 }}>
        <span className="fila" style={{ gap: 6 }}>
          <Icono nombre="ok" size={16} /> {resuelto ? 'Cierre del caso' : 'Cerrar el caso'}
        </span>
      </h3>

      {/* Los criterios, tal como los ve la base de datos */}
      {criterios.length > 0 && (
        <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
          {criterios.map((c) => (
            <div key={c.criterio} className="fila" style={{ gap: 8, fontSize: '.85rem' }}>
              <Pill tono={c.cumplido ? 'ok' : 'aviso'} punto={false}>
                {c.cumplido ? '✓' : '·'} {ETIQUETA_CRITERIO[c.criterio] ?? c.criterio}
              </Pill>
              <span className="muted">{c.detalle}</span>
            </div>
          ))}
        </div>
      )}

      {resuelto ? (
        <>
          {ultimoCierre && (
            <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>
              Lo cerró <strong style={{ color: 'var(--texto)' }}>{ultimoCierre.actor_sello}</strong> el {fechaHora(ultimoCierre.creado_en)}
              {ultimoCierre.completo ? ', con todos los criterios cumplidos.' : '.'}
              {ultimoCierre.nota && <> Nota: «{ultimoCierre.nota}»</>}
            </p>
          )}
          {puedeCerrar && (
            <details style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--borde)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' }}>Reabrir el caso</summary>
              <p className="muted" style={{ fontSize: '.82rem', margin: '6px 0' }}>
                Vuelve a <strong>confirmado</strong> y a tu cola, con fecha de seguimiento nueva. Se avisa a
                quien lo cerró: deshacer un cierre ajeno en silencio es la forma más rápida de que dos
                personas trabajen contra el mismo caso.
              </p>
              <form action={reabrirCaso}>
                <input type="hidden" name="caso" value={caso.id} />
                <input type="hidden" name="volver" value={volver} />
                <div className="fila" style={{ gap: 6, alignItems: 'flex-end' }}>
                  <div className="campo crece" style={{ marginBottom: 0 }}>
                    <label htmlFor={'rm-' + caso.id}>¿Por qué se reabre?</label>
                    <input id={'rm-' + caso.id} name="motivo" className="input" required maxLength={2000}
                      placeholder="Ej. La familia dice que solo llegó la mitad" />
                  </div>
                  <button className="btn" type="submit">Reabrir</button>
                </div>
              </form>
            </details>
          )}
        </>
      ) : puedeCerrar ? (
        <form action={cerrarCaso}>
          <input type="hidden" name="caso" value={caso.id} />
          <input type="hidden" name="volver" value={volver} />
          {!completo && (
            <div className="campo">
              <label htmlFor={'cn-' + caso.id}>Falta algo. ¿Por qué se cierra igualmente?</label>
              <input id={'cn-' + caso.id} name="nota" className="input" maxLength={2000}
                placeholder="Ej. La familia se mudó y no se pudo tomar la foto" />
              <small className="muted">Con criterios sin cumplir, la nota es obligatoria.</small>
            </div>
          )}
          <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>
            {completo ? 'Cerrar el caso' : 'Cerrar igualmente, con la nota'}
          </button>
        </form>
      ) : (
        <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
          Lo cierra su gestor, su líder o administración.
        </p>
      )}

      {/* Historial: cada cierre y cada reapertura, con su motivo */}
      {cierres.length > 1 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: '.85rem' }} className="muted">
            Historial de cierres y reaperturas ({cierres.length})
          </summary>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {cierres.map((c) => (
              <div key={c.id} className="muted" style={{ fontSize: '.8rem' }}>
                <strong style={{ color: 'var(--texto)' }}>{c.accion === 'cierre' ? 'Cerrado' : 'Reabierto'}</strong>
                {' por '}{c.actor_sello}{' · '}{fechaHora(c.creado_en)}
                {c.nota ? ' — ' + c.nota : ''}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
