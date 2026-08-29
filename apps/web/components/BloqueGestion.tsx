import Pill from './Pill';
import Icono from './Icono';
import { ETIQUETA_AREA_SIGUIENTE, AREAS_SIGUIENTE, cuantoFalta } from '@/lib/gestion';
import { fechaHora } from '@/lib/fechas';
import { asignarGestor, quitarGestor, fijarSeguimiento } from '@/app/(app)/gestion-casos/actions';

/**
 * Bloque del Gestor Integral de Casos (0239) dentro del detalle de una solicitud.
 *
 * Responde a las dos preguntas que la propuesta pide tener siempre contestadas: QUIÉN
 * responde por este caso y QUÉ TOCA AHORA, para cuándo. Se ve siempre; se edita según el
 * papel de cada quien —el reparto es del líder o administración, la próxima acción es del
 * gestor del caso—.
 *
 * Los casos de Desaparecidos no entran (decisión de la organización): el bloque no se
 * pinta, y la base de datos lo rechaza igualmente si alguien lo intenta por otra vía.
 */
export default function BloqueGestion({
  caso, gestores = [], puedeRepartir = false, soyElGestor = false, nombres, volver,
}: {
  caso: any;
  gestores?: { id: string; nombre: string }[];
  puedeRepartir?: boolean;
  soyElGestor?: boolean;
  nombres?: Map<string, string>;
  volver: string;
}) {
  if (caso.categoria === 'Desaparecidos') return null;

  const f = cuantoFalta(caso.proxima_revision);
  const nombreGestor = caso.gestor_id ? (nombres?.get(caso.gestor_id) ?? 'Asignado') : null;
  const puedeFijar = soyElGestor || puedeRepartir;

  return (
    <div className="tarjeta" style={{ marginTop: 12 }}>
      <h3 className="aside-titulo" style={{ marginTop: 0 }}>
        <span className="fila" style={{ gap: 6 }}><Icono nombre="tareas" size={16} /> Gestión del caso</span>
      </h3>

      {/* Quién responde */}
      <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
        {nombreGestor
          ? <><span className="muted" style={{ fontSize: '.85rem' }}>Responsable:</span>
              <Pill tono="info" punto={false}>{nombreGestor}</Pill>
              {caso.gestor_asignado_en && (
                <span className="muted" style={{ fontSize: '.78rem' }}>desde {fechaHora(caso.gestor_asignado_en)}</span>
              )}</>
          : <Pill tono="critica" punto={false}>Sin responsable</Pill>}
      </div>
      {!nombreGestor && (
        <p className="muted" style={{ fontSize: '.84rem', marginTop: 4 }}>
          Mientras no tenga gestor, nadie responde por este caso y aparece en «Sin responsable».
        </p>
      )}

      {/* Qué toca ahora */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--borde)' }}>
        {caso.proxima_accion ? (
          <>
            <div style={{ fontSize: '.9rem' }}><strong>Ahora toca:</strong> {caso.proxima_accion}</div>
            <div className="fila" style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {caso.area_siguiente && (
                <Pill tono="neutra" punto={false}>{ETIQUETA_AREA_SIGUIENTE[caso.area_siguiente] ?? caso.area_siguiente}</Pill>
              )}
              {f && <Pill tono={f.vencido ? 'alta' : 'ok'} punto={false}>Revisión {f.texto}</Pill>}
            </div>
          </>
        ) : (
          <Pill tono="aviso" punto={false}>Sin próxima acción definida</Pill>
        )}
      </div>

      {/* Repartir: decisión del líder o administración */}
      {puedeRepartir && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--borde)' }}>
          <form action={asignarGestor} className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input type="hidden" name="caso" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="campo" style={{ marginBottom: 0, minWidth: 220 }}>
              <label htmlFor={'g-' + caso.id}>Asignar gestor</label>
              <select id={'g-' + caso.id} name="gestor" className="input" required defaultValue={caso.gestor_id ?? ''}>
                <option value="" disabled>Elige a alguien…</option>
                {gestores.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </div>
            <button className="btn btn-primario" type="submit">Guardar</button>
          </form>
          {gestores.length === 0 && (
            <p className="muted" style={{ fontSize: '.82rem', marginTop: 6 }}>
              Todavía no hay nadie con el rol <strong>Gestor de Casos</strong>. Se asigna desde Administración · Usuarios.
            </p>
          )}
          {caso.gestor_id && (
            <form action={quitarGestor} style={{ marginTop: 6 }}>
              <input type="hidden" name="caso" value={caso.id} />
              <input type="hidden" name="volver" value={volver} />
              <button className="btn" type="submit" style={{ minHeight: 32, padding: '3px 10px', fontSize: '.82rem' }}>
                Quitar el gestor
              </button>
            </form>
          )}
        </div>
      )}

      {/* Fijar la próxima acción: trabajo del gestor del caso */}
      {puedeFijar && (
        <details style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--borde)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' }}>
            {caso.proxima_accion ? 'Cambiar la próxima acción' : 'Definir la próxima acción'}
          </summary>
          <form action={fijarSeguimiento} style={{ marginTop: 10 }}>
            <input type="hidden" name="caso" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="campo">
              <label htmlFor={'pa-' + caso.id}>¿Qué toca ahora?</label>
              <input id={'pa-' + caso.id} name="accion" className="input" required maxLength={500}
                defaultValue={caso.proxima_accion ?? ''}
                placeholder="Ej. Confirmar con la familia que el agua llegó" />
            </div>
            <div className="fila" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="campo" style={{ marginBottom: 0, minWidth: 200 }}>
                <label htmlFor={'ar-' + caso.id}>¿Quién responde?</label>
                <select id={'ar-' + caso.id} name="area" className="input" defaultValue={caso.area_siguiente ?? ''}>
                  <option value="">Sin área concreta</option>
                  {AREAS_SIGUIENTE.map((a) => (
                    <option key={a} value={a}>{ETIQUETA_AREA_SIGUIENTE[a] ?? a}</option>
                  ))}
                </select>
              </div>
              <div className="campo" style={{ marginBottom: 0, minWidth: 200 }}>
                <label htmlFor={'pr-' + caso.id}>Revisar el</label>
                <input id={'pr-' + caso.id} name="proxima" type="datetime-local" className="input" />
                <small className="muted">En blanco, la pone sola según la urgencia.</small>
              </div>
              <button className="btn btn-primario" type="submit">Guardar</button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
