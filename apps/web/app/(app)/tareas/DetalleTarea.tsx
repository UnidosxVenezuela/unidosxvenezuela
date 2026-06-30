import Link from 'next/link';
import {
  ESTADOS, PRIORIDADES, ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, claseEstado, clasePrioridad,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import Avatar from '@/components/Avatar';
import { cambiarEstado, actualizarAsignacion } from './actions';

/**
 * Cuerpo compacto de una tarea para el panel lateral (drawer) en /tareas?tarea=ID.
 * Reúne lo esencial (estado, asignación, personas) y enlaza a la página completa
 * para comentarios, material y entregables. `volver` define a dónde regresan los
 * formularios. La autorización sigue en la RLS; esto es solo presentación.
 */
export default function DetalleTarea({
  tarea, personas, perfiles, puedeEditar, esGestorTarea, tieneEntregables, volver, cerrarHref,
}: {
  tarea: any; personas: any[]; perfiles: any[]; puedeEditar: boolean; esGestorTarea: boolean;
  tieneEntregables: boolean; volver: string; cerrarHref: string;
}) {
  const cupo: number | null = tarea.cupo ?? null;
  const ocupados = personas.length;

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '2px 0' }}>{tarea.titulo}</h2>
          <span className="fila" style={{ gap: 6 }}>
            {tieneEntregables && <span className="insignia ok">Entregado</span>}
            <span className={'insignia ' + claseEstado(tarea.estado)}>{ETIQUETA_ESTADO[tarea.estado as keyof typeof ETIQUETA_ESTADO]}</span>
          </span>
        </div>
        <Link href={cerrarHref} className="btn" style={{ minHeight: 34, padding: '4px 10px' }} aria-label="Cerrar">✕</Link>
      </div>

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <p style={{ marginTop: 0 }}>{tarea.descripcion || <span className="muted">Sin descripción</span>}</p>
        <div className="grid grid-2">
          <div><strong>Prioridad:</strong> <span className={'insignia ' + clasePrioridad(tarea.prioridad)}>{ETIQUETA_PRIORIDAD[tarea.prioridad as keyof typeof ETIQUETA_PRIORIDAD]}</span></div>
          <div><strong>Grupo:</strong> {tarea.grupos?.nombre ?? '—'}</div>
          <div className="fila" style={{ gap: 6 }}>
            <strong>Asignado a:</strong>
            {tarea.asignado_a ? <><Avatar nombre={tarea.asignado?.nombre_completo} size={22} /> {tarea.asignado?.nombre_completo ?? '—'}</> : <span className="muted">Sin asignar</span>}
          </div>
          <div><strong>Personas:</strong> {cupo ? `${ocupados}/${cupo}` : ocupados}</div>
          <div><strong>Vence:</strong> {tarea.vence_en ? new Date(tarea.vence_en).toLocaleString('es-VE') : '—'}</div>
          <div><strong>Ubicación:</strong>{' '}
            {tarea.ubicacion || (tarea.lat != null && tarea.lng != null ? `${tarea.lat}, ${tarea.lng}` : '—')}
          </div>
        </div>
      </div>

      {puedeEditar && (
        <>
          <form action={cambiarEstado} className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> Estado de la tarea</h3>
            <input type="hidden" name="tarea_id" value={tarea.id} />
            <input type="hidden" name="volver" value={volver} />
            <select name="estado" className="input" defaultValue={tarea.estado} style={{ width: '100%' }}>
              {ESTADOS.filter((e) => e !== 'completada' || esGestorTarea).map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
            </select>
            <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Guardar estado</button>
          </form>

          <form action={actualizarAsignacion} className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Asignación y prioridad</h3>
            <input type="hidden" name="tarea_id" value={tarea.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="campo">
              <label>Asignar a</label>
              <select name="asignado_a" className="input" defaultValue={tarea.asignado_a ?? ''} style={{ width: '100%' }}>
                <option value="">Sin asignar</option>
                {(perfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Prioridad</label>
              <select name="prioridad" className="input" defaultValue={tarea.prioridad} style={{ width: '100%' }}>
                {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
              </select>
            </div>
            <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>Guardar</button>
          </form>
        </>
      )}

      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="grupos" size={16} /> Personas {cupo ? `${ocupados}/${cupo}` : ocupados}</h3>
        {personas.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nadie se ha unido todavía.</p> : (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {personas.map((p: any) => (
              <li key={p.perfil_id} className="fila" style={{ gap: 8 }}>
                <Avatar nombre={p.perfiles?.nombre_completo} size={22} />
                {p.perfiles?.nombre_completo || '—'}
                {tarea.asignado_a === p.perfil_id && <span className="insignia ok">Responsable</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href={'/tareas/' + tarea.id} className="btn" style={{ width: '100%' }}>
        <Icono nombre="enlace" size={16} /> Ver tarea completa (comentarios, material y entregables)
      </Link>
    </div>
  );
}
