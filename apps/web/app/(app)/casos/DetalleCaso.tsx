import { fechaCorta, fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { ETIQUETA_ESTADO_CASO, ESTADOS_CASO, hrefSeguro, ETIQUETA_TIPO_INSUMO, ETIQUETA_PRIORIDAD, ETIQUETA_ESTADO_INSUMO, ETIQUETA_TIPO_LUGAR, TONO_TIPO_LUGAR } from '@/lib/constantes';
import Icono from '@/components/Icono';
import EstadoCaso from '@/components/EstadoCaso';
import Avatar from '@/components/Avatar';
import BadgeCategoria from '@/components/BadgeCategoria';
import BotonConfirmar from '@/components/BotonConfirmar';
import Pill from '@/components/Pill';
import FlujoProgreso from '@/components/FlujoProgreso';
import { pasoDeCaso } from '@/lib/flujo';
import { cambiarEstadoCaso, descartarCaso, actualizarCaso, eliminarCaso, tomarCaso, derivarCasoLogistica, requerirInfoCaso, enviarCasoRedaccion, reubicarCasoOfrecimiento } from './actions';
import FormEditarCaso from './FormEditarCaso';
import { nombreMostrado } from '@/lib/nombre';

const EXPLICA_ESTADO: Record<string, string> = {
  pendiente: 'Todavía no lo ha tomado nadie; está pendiente de revisión.',
  en_proceso: 'Alguien ya lo tomó y lo está revisando.',
  confirmado: 'La información fue validada; el equipo de Envío a Redacción lo tomará.',
  falso: 'La información es falsa, antigua o la solicitud ya fue resuelta. No continúa en el flujo.',
  enviado_redaccion: 'La solicitud fue enviada a Redacción: el flujo de verificación terminó.',
  resuelto: 'La ayuda se entregó (Logística) y la solicitud quedó atendida. Ciclo cerrado.',
};

/**
 * Cuerpo del caso, reutilizado por la página /casos/[id] y por el panel lateral
 * (drawer) en /casos?caso=ID. `volver` define a dónde regresan los formularios.
 */
export default function DetalleCaso({ caso, perfiles, historial, volver, cerrarHref, puedeEditar = true, puedeEditarDatos = false, esAdmin = false, esMandoVerif = false, puedeTomar = false, miId, solicitud = null }: {
  caso: any; perfiles: any[]; historial: any[]; volver: string; cerrarHref: string; puedeEditar?: boolean; puedeEditarDatos?: boolean; esAdmin?: boolean; esMandoVerif?: boolean; puedeTomar?: boolean; miId?: string; solicitud?: any;
}) {
  // Derivación a Logística (Fase 2): un requerimiento CONFIRMADO se convierte en
  // solicitud de insumo. La Verificación (o admin, o el creador) puede derivarlo.
  const esDerivable = caso.es_requerimiento && caso.categoria !== 'Desaparecidos' && (caso.estado === 'confirmado' || caso.estado === 'enviado_redaccion');
  const puedeDerivar = puedeEditar || esAdmin || caso.creado_por === miId;
  const nombres = new Map<string, string>((perfiles ?? []).map((p: any) => [p.id, nombreMostrado(p.nombre_completo, esAdmin)]));
  const avatares = new Map<string, string | null>((perfiles ?? []).map((p: any) => [p.id, p.avatar_url]));
  const waFuente = hrefSeguro(caso.fuente_url);
  const etiquetaEstado = (e?: string) => (e ? (ETIQUETA_ESTADO_CASO[e as keyof typeof ETIQUETA_ESTADO_CASO] ?? e) : '');

  // Checklist de «datos mínimos» del procedimiento de Verificación: ✓ presente / ⚠ falta.
  // Para las solicitudes de ayuda se suman ubicación y tipo de necesidad.
  const chkItems: [string, boolean][] = [
    ['Descripción clara', !!caso.descripcion],
    ['Fuente identificable', !!(caso.fuente || caso.fuente_url)],
    ['Fecha de la información', !!caso.fecha_publicacion],
    ['Contacto / referente', !!caso.contacto],
    ...(caso.es_requerimiento
      ? ([['Ubicación en el mapa', caso.lat != null && caso.lng != null], ['Tipo de necesidad', !!caso.req_tipo]] as [string, boolean][])
      : []),
    ...(caso.punto_tipo
      ? ([['Punto del mapa: existe y está bien ubicado', caso.lat != null && caso.lng != null]] as [string, boolean][])
      : []),
  ];

  // Texto largo para la línea de tiempo del historial.
  const describir = (accion: string, meta: any) => {
    if (accion === 'casos:insert') return 'Solicitud creada';
    if (accion === 'casos:delete') return 'Solicitud eliminada';
    if (accion === 'casos:edicion') return 'Editó los datos de la solicitud';
    if (accion === 'casos:derivado') return 'Derivado a Logística';
    if (accion === 'casos:copia') return 'Redacción copió la información';
    if (accion === 'casos:descarga') return 'Redacción descargó la información';
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
    if (accion === 'casos:insert') return 'Creó la solicitud';
    if (accion === 'casos:delete') return 'Eliminó la solicitud';
    if (accion === 'casos:edicion') return 'Editó los datos';
    if (accion === 'casos:derivado') return 'Derivó a Logística';
    if (accion === 'casos:copia') return 'Copió (Redacción)';
    if (accion === 'casos:descarga') return 'Descargó (Redacción)';
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
  if (caso.creado_por) sumar(caso.creado_por, 'Creó la solicitud');
  for (const h of (historial ?? [])) sumar(h.actor_id, accionCorta(h.accion, h.metadata));

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="muted" style={{ fontSize: '.8rem' }}>Solicitud #{String(caso.numero).padStart(5, '0')}</div>
          <h2 style={{ margin: '2px 0' }}>{caso.titulo}</h2>
          <EstadoCaso estado={caso.estado} />
          {(() => { const p = pasoDeCaso(caso.estado); return <div style={{ maxWidth: 240, marginTop: 8 }}><FlujoProgreso paso={p.paso} total={p.total} etiqueta={p.etiqueta} fuera={p.fuera} /></div>; })()}
          {caso.publicado_en && (
            <div className="fila" style={{ gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <Pill tono="ok" punto={false}>📣 Publicada · {fechaCorta(caso.publicado_en)}</Pill>
              {hrefSeguro(caso.publicacion_url) && (
                <a href={hrefSeguro(caso.publicacion_url)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>ver publicación ↗</a>
              )}
            </div>
          )}
        </div>
        <Link href={cerrarHref} className="btn" style={{ minHeight: 34, padding: '4px 10px' }} aria-label="Cerrar">✕</Link>
      </div>

      {caso.info_requerida && (
        <div className="tarjeta" style={{ marginTop: 12, background: 'var(--pill-aviso-bg)', borderColor: 'var(--ambar-solido)' }}>
          <div className="fila" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Icono nombre="avisos" size={18} />
            <div>
              <strong>Requiere información adicional</strong>
              <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{caso.info_requerida}</p>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '.82rem' }}>Devuelta a quien la reportó (Recopilación) para completarla. Al corregir los datos, el aviso se retira.</p>
            </div>
          </div>
        </div>
      )}

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <p style={{ marginTop: 0 }}>{caso.descripcion || <span className="muted">Sin descripción</span>}</p>
        <div className="grid grid-2">
          <div><strong>Categoría:</strong> {caso.categoria ? <BadgeCategoria>{caso.categoria}</BadgeCategoria> : '—'}</div>
          <div><strong>Publicación:</strong> {caso.fecha_publicacion ? fechaCorta(caso.fecha_publicacion + 'T00:00:00') : '—'}</div>
          <div style={{ gridColumn: '1 / -1' }}><strong>Fuente:</strong> {waFuente ? <a href={waFuente} target="_blank" rel="noopener noreferrer">{caso.fuente || 'Ver fuente'} ↗</a> : (caso.fuente || '—')}</div>
          {(() => {
            const ref = caso.referente; const wa = caso.contacto_whatsapp; const ig = caso.contacto_instagram;
            const waD = wa ? String(wa).replace(/[^\d]/g, '') : '';
            const igH = ig ? String(ig).replace(/^@/, '') : '';
            if (ref || wa || ig) return (
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>Contacto / referente:</strong> {ref || '—'}
                {(wa || igH) && (
                  <span className="fila" style={{ gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                    {wa && <span>WhatsApp:{' '}{waD.length >= 8 ? <a href={'https://wa.me/' + waD} target="_blank" rel="noopener noreferrer">{wa}</a> : wa}</span>}
                    {igH && <span>Instagram:{' '}<a href={'https://instagram.com/' + igH} target="_blank" rel="noopener noreferrer">@{igH}</a></span>}
                  </span>
                )}
              </div>
            );
            return caso.contacto ? <div style={{ gridColumn: '1 / -1' }}><strong>Contacto / referente:</strong> {caso.contacto}</div> : null;
          })()}
          <div style={{ gridColumn: '1 / -1' }}><strong>Creado por:</strong> {caso.creado_por ? (nombres.get(caso.creado_por) ?? '—') : '—'}{caso.creado_en ? ' · ' + fechaHora(caso.creado_en) : ''}</div>
          {caso.asignado_a && (
            <div style={{ gridColumn: '1 / -1' }}>
              <strong>Tomado por:</strong> {nombres.get(caso.asignado_a) ?? '—'}{caso.asignado_a === miId ? ' (tú)' : ''}
            </div>
          )}
        </div>
        {caso.es_requerimiento && (
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10, padding: '8px 10px', background: 'var(--t-teal-bg)', border: '1px solid var(--t-teal-fg)', borderRadius: 8 }}>
            <Icono nombre="ubicacion" size={16} />
            <strong>Solicitud de ayuda</strong>
            {caso.punto_tipo && <Pill tono={TONO_TIPO_LUGAR[caso.punto_tipo] ?? 'info'} punto={false}>Punto: {ETIQUETA_TIPO_LUGAR[caso.punto_tipo] ?? caso.punto_tipo}{caso.punto_temporal ? ' · temporal' : ''}</Pill>}
            {caso.req_tipo && <Pill tono="info" punto={false}>{ETIQUETA_TIPO_INSUMO[caso.req_tipo] ?? caso.req_tipo}</Pill>}
            {caso.req_urgencia && <Pill tono="aviso" punto={false}>{ETIQUETA_PRIORIDAD[caso.req_urgencia as keyof typeof ETIQUETA_PRIORIDAD] ?? caso.req_urgencia}</Pill>}
            {caso.req_cantidad && <span className="muted" style={{ fontSize: '.85rem' }}>· {caso.req_cantidad}</span>}
            {caso.lat != null && caso.lng != null && <span className="muted" style={{ fontSize: '.82rem' }}>· Ubicación marcada en el mapa</span>}
          </div>
        )}
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

      {/* Observaciones de verificación: lo que anota el equipo de Verificación.
          Visibles para TODOS los que abren la solicitud (transparencia). Se agregan
          y editan en el bloque de decisión de verificación (más abajo). */}
      {caso.notas && (
        <div className="tarjeta">
          <h3 className="aside-titulo"><Icono nombre="documento" size={16} /> Observaciones de verificación</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{caso.notas}</p>
        </div>
      )}

      {caso.es_requerimiento && (
        <div className="tarjeta" style={{ borderColor: 'var(--t-teal-fg)' }}>
          <h3 className="aside-titulo"><Icono nombre="camion" size={16} /> Respuesta · Logística</h3>
          {solicitud ? (
            <p className="muted" style={{ margin: 0 }}>
              Derivado a Logística · <strong style={{ color: 'var(--texto)' }}>{ETIQUETA_ESTADO_INSUMO[solicitud.estado] ?? solicitud.estado}</strong>.
              {esAdmin && <> <Link href={'/insumos/' + solicitud.id}>Ver solicitud ↗</Link></>}
            </p>
          ) : esDerivable && puedeDerivar ? (
            <form action={derivarCasoLogistica}>
              <input type="hidden" name="caso_id" value={caso.id} />
              <input type="hidden" name="volver" value={volver} />
              <p className="muted" style={{ margin: '0 0 8px', fontSize: '.9rem' }}>Convierte esta solicitud de ayuda en una tarea de Logística (insumo), enlazada a la solicitud, para coordinar la entrega.</p>
              <button className="btn btn-primario" type="submit"><Icono nombre="camion" size={16} /> Derivar a Logística</button>
            </form>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>Cuando la solicitud esté <strong>confirmada</strong>, la Verificación podrá derivarla a Logística para coordinar la entrega.</p>
          )}
        </div>
      )}

      {/* Derivar / reubicar: reúne las salidas manuales de la solicitud. La derivación a
          Logística vive en su tarjeta (arriba). Aquí: enviar a Redacción (Verificación) y
          reubicar como Donación-Ofrecimiento si en realidad es alguien que OFRECE ayuda. */}
      {puedeDerivar && caso.estado !== 'falso' && (
        <div className="tarjeta">
          <h3 className="aside-titulo"><Icono nombre="flecha" size={16} /> Derivar / reubicar la solicitud</h3>

          {(puedeEditar || esAdmin) && caso.categoria !== 'Desaparecidos' && (
            caso.estado === 'confirmado' ? (
              <form action={enviarCasoRedaccion} style={{ marginBottom: 12 }}>
                <input type="hidden" name="caso_id" value={caso.id} />
                <input type="hidden" name="volver" value={volver} />
                <p className="muted" style={{ margin: '0 0 6px', fontSize: '.85rem' }}>Pásala explícitamente a <strong>Envío a Redacción</strong> para difundirla en redes.</p>
                <button className="btn btn-primario" type="submit" style={{ width: '100%' }}><Icono nombre="cohete" size={16} /> Enviar a Redacción</button>
              </form>
            ) : caso.estado === 'enviado_redaccion' ? (
              <p className="fila" style={{ gap: 6, margin: '0 0 12px', fontSize: '.85rem', color: 'var(--ok-solido)' }}><Icono nombre="ok" size={14} /> Ya enviada a Redacción.</p>
            ) : (
              <p className="muted" style={{ margin: '0 0 12px', fontSize: '.85rem' }}>Cuando esté <strong>confirmada</strong>, podrás enviarla a Redacción desde aquí.</p>
            )
          )}

          <form action={reubicarCasoOfrecimiento}>
            <input type="hidden" name="caso_id" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <label className="muted" style={{ fontSize: '.85rem' }}>¿Esto en realidad es alguien que <strong>ofrece ayuda</strong>? Reubícala como Donación-Ofrecimiento:</label>
            <select name="clase" className="input" defaultValue="donacion" style={{ marginTop: 4 }} aria-label="Qué se ofrece">
              <option value="donacion">Donación (bienes / dinero)</option>
              <option value="servicio">Servicio (acción / atención)</option>
            </select>
            <BotonConfirmar
              mensaje={'¿Reubicar esta solicitud como Donación-Ofrecimiento? La solicitud original quedará descartada, con una nota que enlaza al nuevo ofrecimiento.'}
              className="btn" style={{ width: '100%', marginTop: 6 }}>
              <Icono nombre="corazon" size={15} /> Reubicar como Donación-Ofrecimiento
            </BotonConfirmar>
          </form>
        </div>
      )}

      {puedeEditarDatos && <FormEditarCaso caso={caso} volver={volver} />}

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

      {/* Regresar a verificación (admin y mandos de verificación): aún estando
          finalizada —confirmada, enviada a Redacción, descartada (falso) o resuelta—
          un administrador o un líder/coordinador de verificación puede reabrirla y
          devolverla a verificación si hubo un error. Vuelve a «en proceso» (no dispara
          los triggers de confirmación) y queda registrado en el historial. */}
      {(esAdmin || esMandoVerif) && ['confirmado', 'enviado_redaccion', 'falso', 'resuelto'].includes(caso.estado) && (
        <div className="tarjeta" style={{ borderColor: 'var(--azul)' }}>
          <h3 className="aside-titulo"><Icono nombre="historial" size={16} /> Regresar a verificación</h3>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>
            Esta solicitud ya está <strong>{etiquetaEstado(caso.estado)}</strong>. Si hubo un error, puedes regresarla a <strong>verificación</strong> para revisarla de nuevo. Queda registrado en el historial.
          </p>
          <form action={cambiarEstadoCaso}>
            <input type="hidden" name="caso_id" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <input type="hidden" name="estado" value="en_proceso" />
            <BotonConfirmar
              mensaje={'¿Regresar esta solicitud a verificación? Volverá al flujo para revisarse de nuevo.'}
              className="btn btn-primario" style={{ width: '100%' }}>
              <Icono nombre="historial" size={15} /> Regresar a verificación
            </BotonConfirmar>
          </form>
        </div>
      )}
      {puedeEditar && !esAdmin && !esMandoVerif && caso.estado === 'enviado_redaccion' && (
        <div className="tarjeta" style={{ borderColor: 'var(--azul)' }}>
          <p className="muted" style={{ margin: 0 }}>Esta solicitud ya fue <strong>enviada a Redacción</strong>: el flujo de verificación terminó y su estado no se cambia desde aquí.</p>
        </div>
      )}
      {puedeTomar && caso.estado !== 'enviado_redaccion' && caso.asignado_a !== miId && (
        <form action={tomarCaso} className="tarjeta" style={{ borderColor: caso.asignado_a ? 'var(--aviso, #e6a100)' : 'var(--azul)' }}>
          <input type="hidden" name="caso_id" value={caso.id} />
          <input type="hidden" name="volver" value={volver} />
          <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {caso.asignado_a ? (
              <span style={{ fontSize: '.9rem' }}>
                <Icono nombre="avisos" size={14} /> Ya lo está trabajando <strong>{nombres.get(caso.asignado_a) ?? 'otra persona'}</strong>. Si vas a continuarlo, tómalo tú.
              </span>
            ) : (
              <span className="muted" style={{ fontSize: '.9rem' }}>¿Vas a trabajar esta solicitud? <strong>Tómalo</strong> para dejar constancia de que lo estás verificando.</span>
            )}
            <button className="btn btn-primario" type="submit"><Icono nombre="ok" size={16} /> Tomar solicitud</button>
          </div>
        </form>
      )}
      {puedeEditar && caso.estado !== 'enviado_redaccion' ? (
        <>
          {/* Checklist de verificación (procedimiento del equipo): ¿es real, vigente y
              está completa? Los «datos mínimos» se marcan según los campos presentes. */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> Checklist de verificación</h3>
            <p className="muted" style={{ margin: '0 0 8px', fontSize: '.82rem' }}>¿Es <strong>real</strong>, <strong>vigente</strong> y está <strong>completa</strong>? Si falta algo, usa «Requiere información adicional» en vez de descartar.</p>
            <div className="leyenda">
              {chkItems.map(([et, ok]) => (
                <div key={et} className="leyenda-fila">
                  <Icono nombre={ok ? 'ok' : 'avisos'} size={15} />
                  <span className={ok ? undefined : 'muted'}>{et}{ok ? '' : ' — falta'}</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: '.8rem' }}>
              {caso.es_requerimiento
                ? 'Solicitud de ayuda: confirma quién solicita, qué necesita, la ubicación, el contacto y que la necesidad siga vigente.'
                : 'Información: confirma la fuente, que los datos sean suficientes y que siga vigente antes de confirmar.'}
            </p>
          </div>

          {/* Decisión del verificador: confirmar o descartar, bien visibles. El cambio
              de estado libre queda como opción avanzada. */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> ¿Qué haces con esta solicitud?</h3>
            {caso.punto_tipo && (
              caso.punto_acopio_id ? (
                <p className="fila" style={{ gap: 6, margin: '0 0 8px', fontSize: '.85rem', color: 'var(--ok-solido)' }}>
                  <Icono nombre="ok" size={14} /> Punto creado en el mapa para Logística.{esAdmin && <> <Link href="/mapa">Verlo ↗</Link></>}
                </p>
              ) : (
                <div className="fila" style={{ gap: 6, alignItems: 'flex-start', margin: '0 0 8px', padding: '6px 8px', background: 'var(--tinte-prim)', border: '1px solid var(--borde-f)', borderRadius: 8 }}>
                  <Icono nombre="mapa" size={15} />
                  <span style={{ fontSize: '.85rem' }}>Esta solicitud es un punto (<b>{ETIQUETA_TIPO_LUGAR[caso.punto_tipo] ?? caso.punto_tipo}</b>). Al <b>confirmarla</b>, se creará automáticamente en el mapa para que Logística lo gestione.</span>
                </div>
              )
            )}
            {caso.estado !== 'confirmado' && (
              <form action={cambiarEstadoCaso}>
                <input type="hidden" name="caso_id" value={caso.id} />
                <input type="hidden" name="volver" value={volver} />
                <input type="hidden" name="estado" value="confirmado" />
                <button className="btn btn-acento" type="submit" style={{ width: '100%' }}>
                  <Icono nombre="ok" size={16} /> Confirmar solicitud
                </button>
              </form>
            )}
            {/* Requiere información adicional: devuelve el caso a Recopilación con el
                motivo (no lo descarta). Avisa a quien lo reportó (trigger 0142). */}
            <form action={requerirInfoCaso} style={{ marginTop: 12 }}>
              <input type="hidden" name="caso_id" value={caso.id} />
              <input type="hidden" name="volver" value={volver} />
              <label className="muted" style={{ fontSize: '.85rem' }}>¿Falta un dato o hay contradicciones? Devuélvela a Recopilación indicando qué completar:</label>
              <textarea name="motivo" className="input" rows={2} required maxLength={500}
                placeholder="Qué información falta (contacto, ubicación, vigencia…)" style={{ marginTop: 4 }} />
              <BotonConfirmar
                mensaje={'¿Devolver esta solicitud a Recopilación como «Requiere información adicional»? Se avisará a quien la reportó con el motivo.'}
                className="btn" style={{ width: '100%', marginTop: 6 }}>
                <Icono nombre="avisos" size={15} /> Requiere información adicional
              </BotonConfirmar>
            </form>
            {caso.estado !== 'falso' && (
              <form action={descartarCaso} style={{ marginTop: 12 }}>
                <input type="hidden" name="caso_id" value={caso.id} />
                <input type="hidden" name="volver" value={volver} />
                <label className="muted" style={{ fontSize: '.85rem' }}>¿Es falso, antiguo o duplicado? Descártalo indicando el motivo:</label>
                <textarea name="motivo" className="input" rows={2} required maxLength={500}
                  placeholder="Motivo del descarte…" style={{ marginTop: 4 }} />
                <BotonConfirmar
                  mensaje={'¿Descartar esta solicitud como falsa? Saldrá del flujo de verificación y quedará registrado el motivo.'}
                  className="btn btn-peligro" style={{ width: '100%', marginTop: 6 }}>
                  <Icono nombre="cerrar" size={15} /> Descartar (falso)
                </BotonConfirmar>
              </form>
            )}
            <details style={{ marginTop: 12 }}>
              <summary className="fila" style={{ cursor: 'pointer', fontSize: '.9rem', fontWeight: 700, color: 'var(--critica)', gap: 6 }}><Icono nombre="avisos" size={15} /> Cambiar estado manualmente (avanzado)</summary>
              <form action={cambiarEstadoCaso} style={{ marginTop: 8 }}>
                <input type="hidden" name="caso_id" value={caso.id} />
                <input type="hidden" name="volver" value={volver} />
                <select name="estado" className="input" defaultValue={caso.estado} style={{ width: '100%' }} aria-label="Estado de la solicitud">
                  {ESTADOS_CASO.filter((e) => e !== 'enviado_redaccion').map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_CASO[e]}</option>)}
                </select>
                <button className="btn" type="submit" style={{ width: '100%', marginTop: 8 }}>Guardar estado</button>
              </form>
            </details>
          </div>

          <form action={actualizarCaso} className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="documento" size={16} /> Observaciones de verificación</h3>
            <input type="hidden" name="caso_id" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="campo">
              <label>Observaciones de la verificación <span className="muted">(las verá todo el equipo que abra la solicitud)</span></label>
              <textarea name="notas" className="input" rows={3} defaultValue={caso.notas ?? ''} placeholder="Qué se revisó, con quién se confirmó, hallazgos…" />
            </div>
            <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>Guardar observaciones</button>
          </form>
        </>
      ) : (
        <div className="tarjeta">
          <p className="muted" style={{ margin: 0 }}>Enviaste esta solicitud para verificación. El equipo de Verificación decidirá si se confirma o se descarta.</p>
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
        <h3 className="aside-titulo"><Icono nombre="filtro" size={16} /> Estados de la solicitud</h3>
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
        <form action={eliminarCaso} className="tarjeta" style={{ borderColor: 'var(--critica)' }}>
          <h3 className="aside-titulo" style={{ color: 'var(--critica)' }}><Icono nombre="basura" size={16} /> Eliminar solicitud</h3>
          <input type="hidden" name="caso_id" value={caso.id} />
          <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>Solo un administrador puede borrar una solicitud. Esta acción no se puede deshacer.</p>
          <BotonConfirmar
            mensaje={'¿Eliminar definitivamente la solicitud "' + caso.titulo + '"? Esta acción no se puede deshacer.'}
            className="btn btn-peligro" style={{ width: '100%' }}>
            <Icono nombre="basura" size={16} /> Eliminar solicitud
          </BotonConfirmar>
        </form>
      )}
    </div>
  );
}
