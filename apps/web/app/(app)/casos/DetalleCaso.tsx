import { fechaCorta, fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { ETIQUETA_ESTADO_CASO, ESTADOS_CASO, hrefSeguro } from '@/lib/constantes';
import Icono from '@/components/Icono';
import EstadoCaso from '@/components/EstadoCaso';
import Avatar from '@/components/Avatar';
import BadgeCategoria from '@/components/BadgeCategoria';
import BotonConfirmar from '@/components/BotonConfirmar';
import Pill from '@/components/Pill';
import { cambiarEstadoCaso, actualizarCaso, eliminarCaso } from './actions';

const EXPLICA_ESTADO: Record<string, string> = {
  en_proceso: 'El equipo de Verificación está revisando el caso.',
  confirmado: 'La información fue validada; el equipo de Envío a Redacción lo tomará.',
  falso: 'La información es falsa, antigua o el caso ya fue resuelto. No continúa en el flujo.',
  enviado_redaccion: 'El caso fue enviado a Redacción: el flujo de verificación terminó.',
};

/**
 * Cuerpo del caso, reutilizado por la página /casos/[id] y por el panel lateral
 * (drawer) en /casos?caso=ID. `volver` define a dónde regresan los formularios.
 */
export default function DetalleCaso({ caso, perfiles, historial, volver, cerrarHref, puedeEditar = true, esAdmin = false }: {
  caso: any; perfiles: any[]; historial: any[]; volver: string; cerrarHref: string; puedeEditar?: boolean; esAdmin?: boolean;
}) {
  const nombres = new Map<string, string>((perfiles ?? []).map((p: any) => [p.id, p.nombre_completo]));
  const avatares = new Map<string, string | null>((perfiles ?? []).map((p: any) => [p.id, p.avatar_url]));
  const waFuente = hrefSeguro(caso.fuente_url);
  const etiquetaEstado = (e?: string) => (e ? (ETIQUETA_ESTADO_CASO[e as keyof typeof ETIQUETA_ESTADO_CASO] ?? e) : '');

  // Texto largo para la línea de tiempo del historial.
  const describir = (accion: string, meta: any) => {
    if (accion === 'casos:insert') return 'Caso creado';
    if (accion === 'casos:delete') return 'Caso eliminado';
    if (accion === 'casos:update') {
      switch (meta?.estado) {
        case 'confirmado': return 'Confirmado';
        case 'falso': return 'Descartado (falso / resuelto)';
        case 'enviado_redaccion': return 'Enviado a Redacción';
        default: return meta?.estado ? `Actualizado · estado: ${etiquetaEstado(meta.estado)}` : 'Notas / datos actualizados';
      }
    }
    return accion;
  };

  // Texto corto de lo que hizo cada persona (resumen de participantes).
  const accionCorta = (accion: string, meta: any): string => {
    if (accion === 'casos:insert') return 'Creó el caso';
    if (accion === 'casos:delete') return 'Eliminó el caso';
    if (accion === 'casos:update') {
      switch (meta?.estado) {
        case 'confirmado': return 'Confirmó';
        case 'falso': return 'Descartó';
        case 'enviado_redaccion': return 'Envió a Redacción';
        case 'en_proceso': return 'Reabrió / actualizó';
        default: return 'Actualizó';
      }
    }
    return accion;
  };

  // Quién ha intervenido: el creador + cada actor del historial, con lo que hizo.
  const participantes = new Map<string, { acciones: string[] }>();
  const sumar = (actorId: string | null | undefined, etiqueta: string) => {
    if (!actorId) return;
    const p = participantes.get(actorId) ?? { acciones: [] };
    if (!p.acciones.includes(etiqueta)) p.acciones.push(etiqueta);
    participantes.set(actorId, p);
  };
  if (caso.creado_por) sumar(caso.creado_por, 'Creó el caso');
  for (const h of (historial ?? [])) sumar(h.actor_id, accionCorta(h.accion, h.metadata));

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
          <div><strong>Publicación:</strong> {caso.fecha_publicacion ? fechaCorta(caso.fecha_publicacion + 'T00:00:00') : '—'}</div>
          <div style={{ gridColumn: '1 / -1' }}><strong>Fuente:</strong> {waFuente ? <a href={waFuente} target="_blank" rel="noopener noreferrer">{caso.fuente || 'Ver fuente'} ↗</a> : (caso.fuente || '—')}</div>
          <div style={{ gridColumn: '1 / -1' }}><strong>Creado por:</strong> {caso.creado_por ? (nombres.get(caso.creado_por) ?? '—') : '—'}{caso.creado_en ? ' · ' + fechaHora(caso.creado_en) : ''}</div>
        </div>
        {(caso.adjuntos ?? []).length > 0 && (
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {(caso.adjuntos as any[]).map((a) => a.href ? (
              <a key={a.id} className="adjunto-chip" href={a.href} target="_blank" rel="noopener noreferrer">
                <Icono nombre="documento" size={15} /> {a.nombre}
              </a>
            ) : null)}
          </div>
        )}
      </div>

      {participantes.size > 0 && (
        <div className="tarjeta">
          <h3 className="aside-titulo"><Icono nombre="grupos" size={16} /> Quién ha intervenido</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {[...participantes.entries()].map(([actorId, p]) => (
              <li key={actorId} className="fila" style={{ gap: 10, alignItems: 'center' }}>
                <Avatar nombre={nombres.get(actorId) ?? 'Usuario'} url={avatares.get(actorId) ?? null} size={30} />
                <div>
                  <div style={{ fontWeight: 600 }}>{nombres.get(actorId) ?? 'Usuario'}</div>
                  <div className="fila" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {p.acciones.map((a) => <Pill key={a} tono="neutra" punto={false}>{a}</Pill>)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {puedeEditar && caso.estado === 'enviado_redaccion' && (
        <div className="tarjeta" style={{ borderColor: 'var(--azul)' }}>
          <p className="muted" style={{ margin: 0 }}>Este caso ya fue <strong>enviado a Redacción</strong>: el flujo de verificación terminó y su estado no se cambia desde aquí.</p>
        </div>
      )}
      {puedeEditar && caso.estado !== 'enviado_redaccion' ? (
        <>
          <form action={cambiarEstadoCaso} className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> Estado del caso</h3>
            <input type="hidden" name="caso_id" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <select name="estado" className="input" defaultValue={caso.estado} style={{ width: '100%' }}>
              {ESTADOS_CASO.filter((e) => e !== 'enviado_redaccion').map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_CASO[e]}</option>)}
            </select>
            <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Guardar estado</button>
          </form>

          <form action={actualizarCaso} className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="documento" size={16} /> Notas</h3>
            <input type="hidden" name="caso_id" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="campo">
              <label>Notas / observaciones</label>
              <textarea name="notas" className="input" rows={3} defaultValue={caso.notas ?? ''} />
            </div>
            <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>Guardar</button>
          </form>
        </>
      ) : (
        <div className="tarjeta">
          <p className="muted" style={{ margin: 0 }}>Enviaste este caso para verificación. El equipo de Verificación decidirá si se confirma o se descarta.</p>
        </div>
      )}

      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="historial" size={16} /> Historial de cambios</h3>
        {(historial ?? []).length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin movimientos.</p> : (
          <ul className="timeline">
            {(historial ?? []).map((h: any) => (
              <li key={h.id}>
                <div style={{ fontWeight: 600 }}>{describir(h.accion, h.metadata)}</div>
                <div className="muted" style={{ fontSize: '.8rem' }}>
                  {fechaHora(h.creado_en)}{h.actor_id ? ' · por ' + (nombres.get(h.actor_id) ?? '—') : ''}
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

      {esAdmin && (
        <form action={eliminarCaso} className="tarjeta" style={{ borderColor: '#fecaca' }}>
          <h3 className="aside-titulo" style={{ color: 'var(--critica)' }}><Icono nombre="basura" size={16} /> Eliminar caso</h3>
          <input type="hidden" name="caso_id" value={caso.id} />
          <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>Solo un administrador puede borrar un caso. Esta acción no se puede deshacer.</p>
          <BotonConfirmar
            mensaje={'¿Eliminar definitivamente el caso "' + caso.titulo + '"? Esta acción no se puede deshacer.'}
            className="btn btn-peligro" style={{ width: '100%' }}>
            <Icono nombre="basura" size={16} /> Eliminar caso
          </BotonConfirmar>
        </form>
      )}
    </div>
  );
}
