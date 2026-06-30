import Link from 'next/link';
import {
  ETIQUETA_ETAPA, ETAPAS_CONTENIDO, ETIQUETA_DESTINO, DESTINOS, claseEtapa, siguienteEtapa, hrefSeguro,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import Avatar from '@/components/Avatar';
import SubirPiezaArchivo from './SubirPiezaArchivo';
import { guardarRedaccion, guardarEnlacePieza, asignarPieza, avanzarEtapa } from './actions';

const EXPLICA_ETAPA: Record<string, string> = {
  redaccion: 'Se redacta el contenido y la descripción, y se elige el destino (Diseño o Video).',
  diseno: 'Se crea la pieza gráfica (1080×1350 posts · 1080×1920 historias).',
  video: 'Se edita el video o reel con el contenido recibido.',
  redes: 'Se publica la pieza final con su descripción en la red correspondiente.',
  publicado: 'La pieza ya fue publicada. Fin del flujo.',
};

/** Cuerpo de una pieza de contenido para el panel lateral en /contenido?pieza=ID. */
export default function DetallePieza({ pieza, perfiles, historial, volver, cerrarHref, puedeEtapa, nombres, avatares }: {
  pieza: any; perfiles: any[]; historial: any[]; volver: string; cerrarHref: string; puedeEtapa: boolean;
  nombres: Map<string, string>; avatares: Map<string, string | null>;
}) {
  const etapa = pieza.etapa as string;
  const sig = siguienteEtapa(pieza.etapa, pieza.destino ?? null);
  const etiquetaAvanzar = etapa === 'redaccion'
    ? (pieza.destino ? 'Enviar a ' + ETIQUETA_DESTINO[pieza.destino as keyof typeof ETIQUETA_DESTINO] : 'Elegí el destino para avanzar')
    : etapa === 'redes' ? 'Marcar como publicado' : sig ? 'Enviar a ' + ETIQUETA_ETAPA[sig] : null;

  const describir = (accion: string) => {
    if (accion === 'piezas_contenido:insert') return 'Pieza creada (Redacción)';
    if (accion === 'piezas_contenido:update') return 'Pieza actualizada';
    if (accion === 'piezas_contenido:delete') return 'Pieza eliminada';
    return accion;
  };

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="muted" style={{ fontSize: '.8rem' }}>Pieza de contenido</div>
          <h2 style={{ margin: '2px 0' }}>{pieza.titulo}</h2>
          <Pill tono={tonoDeClase(claseEtapa(pieza.etapa))}>{ETIQUETA_ETAPA[pieza.etapa as keyof typeof ETIQUETA_ETAPA]}</Pill>
        </div>
        <Link href={cerrarHref} className="btn" style={{ minHeight: 34, padding: '4px 10px' }} aria-label="Cerrar">✕</Link>
      </div>

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <div className="grid grid-2">
          <div><strong>Destino:</strong> {pieza.destino ? ETIQUETA_DESTINO[pieza.destino as keyof typeof ETIQUETA_DESTINO] : <span className="muted">Sin definir</span>}</div>
          <div className="fila" style={{ gap: 6 }}>
            <strong>Asignado a:</strong>
            {pieza.asignado_a ? <><Avatar nombre={nombres.get(pieza.asignado_a)} url={avatares.get(pieza.asignado_a)} size={22} /> {nombres.get(pieza.asignado_a) ?? '—'}</> : <span className="muted">Sin asignar</span>}
          </div>
          {pieza.caso_id && <div style={{ gridColumn: '1 / -1' }}><strong>Caso de origen:</strong> <Link href={'/casos/' + pieza.caso_id}>Ver caso ↗</Link></div>}
          {pieza.adjunto_url && (
            <div style={{ gridColumn: '1 / -1' }}><strong>Archivo:</strong> <a href={pieza.adjunto_url} target="_blank" rel="noopener noreferrer">{pieza.adjunto_nombre || 'Abrir archivo'} ↗</a></div>
          )}
          {pieza.enlace_pieza && hrefSeguro(pieza.enlace_pieza) && (
            <div style={{ gridColumn: '1 / -1' }}><strong>Enlace:</strong> <a href={hrefSeguro(pieza.enlace_pieza)!} target="_blank" rel="noopener noreferrer">Abrir entregable ↗</a></div>
          )}
        </div>
      </div>

      {/* Contenido y descripción: editable en Redacción; referencia en el resto */}
      <form action={guardarRedaccion} className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="documento" size={16} /> Contenido y descripción</h3>
        <input type="hidden" name="pieza_id" value={pieza.id} />
        <input type="hidden" name="volver" value={volver} />
        <div className="campo">
          <label>Contenido (para el diseño o el video)</label>
          <textarea name="contenido" className="input" rows={4} defaultValue={pieza.contenido ?? ''} readOnly={!(puedeEtapa && etapa === 'redaccion')} />
        </div>
        <div className="campo">
          <label>Descripción (copy para redes)</label>
          <textarea name="descripcion" className="input" rows={3} defaultValue={pieza.descripcion ?? ''} readOnly={!(puedeEtapa && etapa === 'redaccion')} />
        </div>
        {puedeEtapa && etapa === 'redaccion' && (
          <>
            <div className="campo">
              <label>Destino</label>
              <select name="destino" className="input" defaultValue={pieza.destino ?? ''}>
                <option value="">Elegir…</option>
                {DESTINOS.map((d) => <option key={d} value={d}>{ETIQUETA_DESTINO[d]}</option>)}
              </select>
            </div>
            <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>Guardar redacción</button>
          </>
        )}
      </form>

      {/* Entregable final: archivo subido o enlace, en Diseño / Video */}
      {puedeEtapa && (etapa === 'diseno' || etapa === 'video') && (
        <div className="tarjeta">
          <h3 className="aside-titulo"><Icono nombre="documento" size={16} /> Entregable final</h3>
          <SubirPiezaArchivo piezaId={pieza.id} urlActual={pieza.adjunto_url} nombreActual={pieza.adjunto_nombre} />
          <form action={guardarEnlacePieza} style={{ marginTop: 12 }}>
            <input type="hidden" name="pieza_id" value={pieza.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="campo">
              <label>…o pegá un enlace (Drive, Figma, WeTransfer…)</label>
              <input name="enlace_pieza" className="input" type="url" defaultValue={pieza.enlace_pieza ?? ''} placeholder="https://…" />
            </div>
            <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>Guardar enlace</button>
          </form>
        </div>
      )}

      {/* Asignación + avanzar etapa */}
      {puedeEtapa && etapa !== 'publicado' && (
        <div className="tarjeta">
          <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Asignación y avance</h3>
          <form action={asignarPieza}>
            <input type="hidden" name="pieza_id" value={pieza.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="campo">
              <label>Asignar a</label>
              <select name="asignado_a" className="input" defaultValue={pieza.asignado_a ?? ''} style={{ width: '100%' }}>
                <option value="">Sin asignar</option>
                {(perfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
              </select>
            </div>
            <button className="btn" type="submit" style={{ width: '100%' }}>Guardar asignación</button>
          </form>
          <form action={avanzarEtapa} style={{ marginTop: 10 }}>
            <input type="hidden" name="pieza_id" value={pieza.id} />
            <input type="hidden" name="volver" value={volver} />
            <button className="btn btn-acento" type="submit" style={{ width: '100%' }} disabled={etapa === 'redaccion' && !pieza.destino}>
              <Icono nombre="ok" size={16} /> {etiquetaAvanzar}
            </button>
          </form>
        </div>
      )}

      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="historial" size={16} /> Historial</h3>
        {(historial ?? []).length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin movimientos.</p> : (
          <ul className="timeline">
            {(historial ?? []).map((h: any) => (
              <li key={h.id}>
                <div style={{ fontWeight: 600 }}>{describir(h.accion)}</div>
                <div className="muted" style={{ fontSize: '.8rem' }}>
                  {new Date(h.creado_en).toLocaleString('es-VE')}{h.actor_id ? ' · por ' + (nombres.get(h.actor_id) ?? '—') : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="filtro" size={16} /> Etapas del flujo</h3>
        <div className="leyenda">
          {ETAPAS_CONTENIDO.map((e) => (
            <div key={e} className="leyenda-fila">
              <Pill tono={tonoDeClase(claseEtapa(e))}>{ETIQUETA_ETAPA[e]}</Pill>
              <span className="muted">{EXPLICA_ETAPA[e]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
