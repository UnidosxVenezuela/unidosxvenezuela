import Link from 'next/link';
import { ETIQUETA_ESTADO_CASO, ESTADOS_CASO, hrefSeguro } from '@/lib/constantes';
import Icono from '@/components/Icono';
import EstadoCaso from '@/components/EstadoCaso';
import Avatar from '@/components/Avatar';
import BadgeCategoria from '@/components/BadgeCategoria';
import { cambiarEstadoCaso, actualizarCaso } from './actions';

const EXPLICA_ESTADO: Record<string, string> = {
  en_proceso: 'Ya hay una persona verificando el caso. Nadie más debe revisarlo.',
  confirmado: 'La información fue validada y está lista para Redacción de Contenido.',
  falso: 'La información es falsa, antigua o el caso ya fue resuelto. No continúa en el flujo.',
};

/**
 * Cuerpo del caso, reutilizado por la página /casos/[id] y por el panel lateral
 * (drawer) en /casos?caso=ID. `volver` define a dónde regresan los formularios.
 */
export default function DetalleCaso({ caso, perfiles, historial, volver, cerrarHref }: {
  caso: any; perfiles: any[]; historial: any[]; volver: string; cerrarHref: string;
}) {
  const nombres = new Map<string, string>((perfiles ?? []).map((p: any) => [p.id, p.nombre_completo]));
  const waFuente = hrefSeguro(caso.fuente_url);

  const describir = (accion: string, meta: any) => {
    if (accion === 'casos:insert') return 'Caso creado';
    if (accion === 'casos:update') return meta?.estado ? `Actualizado · estado: ${ETIQUETA_ESTADO_CASO[meta.estado as keyof typeof ETIQUETA_ESTADO_CASO] ?? meta.estado}` : 'Caso actualizado';
    return accion;
  };

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="muted" style={{ fontSize: '.8rem' }}>Caso #{String(caso.numero).padStart(5, '0')}</div>
          <h2 style={{ margin: '2px 0' }}>{caso.titulo}</h2>
          <EstadoCaso estado={caso.estado} />
        </div>
        <Link href={cerrarHref} className="btn" style={{ minHeight: 34, padding: '4px 10px' }} aria-label="Cerrar">✕</Link>
      </div>

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <p style={{ marginTop: 0 }}>{caso.descripcion || <span className="muted">Sin descripción</span>}</p>
        <div className="grid grid-2">
          <div><strong>Categoría:</strong> {caso.categoria ? <BadgeCategoria>{caso.categoria}</BadgeCategoria> : '—'}</div>
          <div><strong>Publicación:</strong> {caso.fecha_publicacion ? new Date(caso.fecha_publicacion + 'T00:00:00').toLocaleDateString('es-VE') : '—'}</div>
          <div style={{ gridColumn: '1 / -1' }}><strong>Fuente:</strong> {waFuente ? <a href={waFuente} target="_blank" rel="noopener noreferrer">{caso.fuente || 'Ver fuente'} ↗</a> : (caso.fuente || '—')}</div>
          <div className="fila" style={{ gap: 6 }}>
            <strong>Asignado a:</strong>
            {caso.asignado_a ? <><Avatar nombre={nombres.get(caso.asignado_a)} size={22} /> {nombres.get(caso.asignado_a) ?? '—'}</> : <span className="muted">Sin asignar</span>}
          </div>
        </div>
      </div>

      <form action={cambiarEstadoCaso} className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> Estado del caso</h3>
        <input type="hidden" name="caso_id" value={caso.id} />
        <input type="hidden" name="volver" value={volver} />
        <select name="estado" className="input" defaultValue={caso.estado} style={{ width: '100%' }}>
          {ESTADOS_CASO.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_CASO[e]}</option>)}
        </select>
        <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Guardar estado</button>
      </form>

      <form action={actualizarCaso} className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Asignación y notas</h3>
        <input type="hidden" name="caso_id" value={caso.id} />
        <input type="hidden" name="volver" value={volver} />
        <div className="campo">
          <label>Asignar a (verificador)</label>
          <select name="asignado_a" className="input" defaultValue={caso.asignado_a ?? ''} style={{ width: '100%' }}>
            <option value="">Sin asignar</option>
            {(perfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
          </select>
        </div>
        <div className="campo">
          <label>Notas / observaciones</label>
          <textarea name="notas" className="input" rows={3} defaultValue={caso.notas ?? ''} />
        </div>
        <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>Guardar</button>
      </form>

      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="historial" size={16} /> Historial de cambios</h3>
        {(historial ?? []).length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin movimientos.</p> : (
          <ul className="timeline">
            {(historial ?? []).map((h: any) => (
              <li key={h.id}>
                <div style={{ fontWeight: 600 }}>{describir(h.accion, h.metadata)}</div>
                <div className="muted" style={{ fontSize: '.8rem' }}>
                  {new Date(h.creado_en).toLocaleString('es-VE')}{h.actor_id ? ' · por ' + (nombres.get(h.actor_id) ?? '—') : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="filtro" size={16} /> Estados del caso</h3>
        <div className="leyenda">
          {ESTADOS_CASO.map((e) => (
            <div key={e} className="leyenda-fila">
              <EstadoCaso estado={e} />
              <span className="muted">{EXPLICA_ESTADO[e]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
