import { fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica, puedeCaptacion, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { nombreMostrado } from '@/lib/nombre';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_INSUMO, claseEstadoInsumo, clasePrioridad, ETIQUETA_PRIORIDAD, siguienteEstadoInsumo, TIPOS_VEHICULO } from '@/lib/constantes';
import { urlFirmada } from '@/lib/storage';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import BotonEnviar from '@/components/BotonEnviar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import InfoSolicitud from '@/components/InfoSolicitudCaso';
import { cambiarEstadoSolicitud, asignarProveedorSolicitud, asignarCentroSolicitud, crearEnvio, eliminarEnvio, eliminarSolicitud, guardarEvidenciaEntrega, registrarNotaSolicitud, eliminarNotaSolicitud } from '../actions';

// WhatsApp: si el contacto trae suficientes dígitos, arma un enlace wa.me.
function waLink(contacto: string | null): string | null {
  const d = ((contacto ?? '').match(/\d/g) ?? []).join('');
  return d.length >= 7 ? 'https://wa.me/' + d : null;
}

export default async function SolicitudPage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  // Logística gestiona. Captación entra en modo CONSULTA (0163): ve la solicitud y deja
  // en la bitácora las empresas/alianzas que puedan ayudar, sin editar ni avanzar nada.
  const gestor = puedeLogistica(perfil);
  const esCapt = !gestor && puedeCaptacion(perfil);
  if (!gestor && !esCapt) redirect('/dashboard');
  const verFull = esAdministrador(perfil);
  const supabase = await createClient();
  const id = params.id;

  const { data: sData } = await supabase.from('solicitudes_insumo')
    .select('id, titulo, tipo, descripcion, cantidad, urgencia, estado, creado_en, proveedor_id, caso_id, entrega_nota, entrega_evidencia_path, puntos_acopio(nombre), proveedores(nombre, contacto), perfiles(nombre_completo)')
    .eq('id', id).single();
  const s: any = sData;
  if (!s) return <div className="tarjeta"><h2>Solicitud no encontrada</h2><Link href="/insumos">Volver a Logística</Link></div>;

  // Bitácora de la solicitud (0163): notas de Logística + referencias de Captación.
  // Si la migración aún no se aplicó, vuelve vacía y la tarjeta muestra «sin notas».
  const { data: bitacRaw } = await supabase.from('bitacora_solicitud')
    .select('id, contenido, creado_en, autor_id, autor:perfiles!bitacora_solicitud_autor_id_fkey(nombre_completo, rol)')
    .eq('solicitud_id', id).order('creado_en', { ascending: false });
  const bitacora = (bitacRaw ?? []) as any[];

  // Caso de ayuda de origen, si la solicitud fue derivada de un caso (Fase 2). Se
  // obtiene por RPC curada (Logística no lee casos por RLS).
  let origen: { numero: number; titulo: string; contacto: string | null; lat: number | null; lng: number | null } | null = null;
  if (s.caso_id) {
    const { data: co } = await supabase.rpc('caso_de_solicitud', { p_caso: s.caso_id });
    origen = ((co as any[]) ?? [])[0] ?? null;
  }

  // Solicitud (caso) COMPLETA para gestionar bien: descripción, observaciones de
  // verificación, datos de la solicitud de ayuda, contacto y —lo más útil para
  // Logística— las imágenes y adjuntos. Con la migración 0156, Logística ya lee el caso
  // y sus adjuntos por RLS; si aún no se aplicó, la consulta vuelve vacía y la tarjeta
  // simplemente no se muestra (la vista sigue funcionando con los datos curados de arriba).
  let casoFull: any = null;
  if (s.caso_id) {
    const { data: cf } = await supabase.from('casos')
      .select('id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, contacto, notas, es_requerimiento, req_tipo, req_cantidad, req_urgencia, lat, lng')
      .eq('id', s.caso_id).maybeSingle();
    casoFull = cf ?? null;
    if (casoFull) {
      const { data: adjRaw } = await supabase.from('casos_adjuntos')
        .select('id, nombre, mime, url, creado_en').eq('caso_id', s.caso_id).order('creado_en');
      casoFull.adjuntos = await Promise.all(((adjRaw as any[]) ?? []).map(async (a) => ({
        id: a.id, nombre: a.nombre, mime: a.mime,
        href: await urlFirmada(supabase, 'adjuntos', a.url, 3600),
      })));
    }
  }

  const [{ data: envios }, { data: proveedores }, { data: transportistas }] = await Promise.all([
    supabase.from('envios').select('id, tipo_vehiculo, flete, origen, destino, notas, transportistas_logistica(nombre), perfiles!envios_voluntario_id_fkey(nombre_completo)').eq('solicitud_id', id).order('creado_en'),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
    supabase.from('transportistas_logistica').select('id, nombre, vehiculo').eq('activo', true).order('nombre'),
  ]);
  const sig = siguienteEstadoInsumo(s.estado);
  const evidenciaUrl = s.entrega_evidencia_path ? await urlFirmada(supabase, 'entregas', s.entrega_evidencia_path, 3600) : null;

  // Sugerencia de centros de acopio cercanos CON existencias (Fase 3), solo para
  // solicitudes derivadas de un caso y aún abiertas. RPC curada por haversine.
  let centros: any[] = [];
  if (s.caso_id && s.estado !== 'entregado' && s.estado !== 'cancelado') {
    const { data: cc } = await supabase.rpc('centros_cercanos_para_solicitud', { p_solicitud: id, p_limite: 5 });
    centros = (cc as any[]) ?? [];
  }

  return (
    <div>
      <RealtimeRefrescar tabla="envios" filtro={'solicitud_id=eq.' + id} />
      <Link href="/insumos" className="muted">← Logística</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <h1 style={{ margin: 0 }}>{s.titulo}</h1>
        <span className="fila" style={{ gap: 6 }}>
          <Pill tono={tonoDeClase(clasePrioridad(s.urgencia))} punto={false}>{ETIQUETA_PRIORIDAD[s.urgencia as keyof typeof ETIQUETA_PRIORIDAD] ?? s.urgencia}</Pill>
          <Pill tono={tonoDeClase(claseEstadoInsumo(s.estado))}>{ETIQUETA_ESTADO_INSUMO[s.estado] ?? s.estado}</Pill>
        </span>
      </div>

      <div className={gestor ? 'grupo-grid' : undefined} style={{ marginTop: 16 }}>
        <div className="grupo-main">
          <div className="tarjeta">
            <div className="fila" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="insignia">{ETIQUETA_TIPO_INSUMO[s.tipo] ?? s.tipo}</span>
              {s.cantidad && <span className="muted">Cantidad: <strong style={{ color: 'var(--texto)' }}>{s.cantidad}</strong></span>}
            </div>
            {origen && (
              <div className="fila" style={{ gap: 6, marginTop: 10, padding: '6px 10px', background: 'var(--t-teal-bg)', border: '1px solid var(--t-teal-fg)', borderRadius: 8, fontSize: '.85rem' }}>
                <Icono nombre="ubicacion" size={14} /> Derivado de la solicitud de ayuda del caso <strong style={{ color: 'var(--texto)' }}>#{String(origen.numero).padStart(5, '0')}</strong> — {origen.titulo}
              </div>
            )}
            {s.descripcion && <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{s.descripcion}</p>}
            <div className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>
              {s.puntos_acopio?.nombre && <div className="fila" style={{ gap: 4 }}><Icono nombre="ubicacion" size={14} /> {s.puntos_acopio.nombre}</div>}
              <div>Solicitado por {nombreMostrado(s.perfiles?.nombre_completo, verFull) || '—'} · {fechaHora(s.creado_en)}</div>
            </div>
          </div>

          {casoFull && (
            <div className="tarjeta">
              <h3 className="aside-titulo" style={{ marginBottom: 4 }}>
                <Icono nombre="documento" size={16} /> Información completa de la solicitud
                {casoFull.numero != null && <span className="muted" style={{ fontWeight: 400 }}> · #{String(casoFull.numero).padStart(5, '0')}</span>}
              </h3>
              <p className="muted" style={{ margin: '0 0 4px', fontSize: '.82rem' }}>Todo lo verificado (observaciones, fuente, contacto e imágenes) para coordinar bien la entrega.</p>
              <InfoSolicitud caso={casoFull} />
            </div>
          )}

          {gestor && origen && (origen.contacto || (origen.lat != null && origen.lng != null)) && (
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="whatsapp" size={16} /> Contacto del solicitante</h3>
              {origen.contacto && (
                <div className="fila" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{origen.contacto}</span>
                  {waLink(origen.contacto) && <a className="btn" style={{ minHeight: 32, padding: '2px 10px' }} href={waLink(origen.contacto)!} target="_blank" rel="noreferrer noopener"><Icono nombre="whatsapp" size={14} /> WhatsApp</a>}
                </div>
              )}
              {origen.lat != null && origen.lng != null && (
                <div className="fila" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: '.85rem' }}><Icono nombre="ubicacion" size={13} /> {origen.lat.toFixed(5)}, {origen.lng.toFixed(5)}</span>
                  <a className="btn" style={{ minHeight: 32, padding: '2px 10px' }} href={'https://www.google.com/maps?q=' + origen.lat + ',' + origen.lng} target="_blank" rel="noreferrer noopener">Ver en mapa ↗</a>
                </div>
              )}
              <p className="muted" style={{ margin: '8px 0 0', fontSize: '.8rem' }}>Confirma las coordenadas exactas con el solicitante antes del traslado.</p>
            </div>
          )}

          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="camion" size={20} /> Envíos</h2>
          {(envios ?? []).length === 0 ? (
            <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Sin envíos registrados todavía.</p></div>
          ) : (envios as any[]).map((e) => (
            <div key={e.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{e.tipo_vehiculo || 'Vehículo'}</strong>
                  <div className="muted" style={{ fontSize: '.85rem' }}>
                    {[
                      (e.transportistas_logistica?.nombre || e.perfiles?.nombre_completo) && ('Conductor: ' + (e.transportistas_logistica?.nombre || nombreMostrado(e.perfiles?.nombre_completo, verFull))),
                      (e.origen || e.destino) && ((e.origen || '?') + ' → ' + (e.destino || '?')),
                      e.flete != null && ('Flete: ' + e.flete),
                    ].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {e.notas && <div className="muted" style={{ fontSize: '.85rem' }}>{e.notas}</div>}
                </div>
                {gestor && (
                  <form action={eliminarEnvio}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="solicitud_id" value={id} />
                    <BotonConfirmar mensaje="¿Quitar este envío?" className="btn btn-peligro" style={{ minHeight: 32, padding: '2px 10px' }}><Icono nombre="basura" size={15} /></BotonConfirmar>
                  </form>
                )}
              </div>
            </div>
          ))}

          {gestor && (
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="mas" size={16} /> Registrar envío</h3>
              <form action={crearEnvio}>
                <input type="hidden" name="solicitud_id" value={id} />
                <div className="grid grid-2">
                  <div className="campo"><label>Conductor / transportista</label>
                    <select name="transportista_id" className="input" defaultValue="">
                      <option value="">— Sin asignar —</option>
                      {(transportistas ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.nombre}{t.vehiculo ? ' · ' + t.vehiculo : ''}</option>)}
                    </select>
                    <p className="muted" style={{ fontSize: '.78rem', margin: '4px 0 0' }}>Solo aparecen los <Link href="/insumos/transportistas">transportistas registrados</Link>. Regístralos ahí o desde un Donación-Ofrecimiento de transporte.</p>
                  </div>
                  <div className="campo"><label>Tipo de vehículo</label>
                    <select name="tipo_vehiculo" className="input" defaultValue="">
                      <option value="">— Elegir —</option>
                      {TIPOS_VEHICULO.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="campo"><label>Origen</label><input name="origen" className="input" /></div>
                  <div className="campo"><label>Destino</label><input name="destino" className="input" /></div>
                  <div className="campo"><label>Flete (costo)</label><input name="flete" type="number" step="0.01" min="0" className="input" /></div>
                </div>
                <div className="campo"><label>Notas</label><input name="notas" className="input" /></div>
                <button className="btn btn-primario" type="submit">Registrar envío</button>
              </form>
            </div>
          )}
          {gestor && s.estado === 'entregado' && (
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> Evidencia de entrega</h3>
              {evidenciaUrl && <img src={evidenciaUrl} alt="Evidencia de entrega" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--borde)', marginBottom: 8 }} />}
              {s.entrega_nota && <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{s.entrega_nota}</p>}
              <form action={guardarEvidenciaEntrega}>
                <input type="hidden" name="id" value={id} />
                <div className="campo"><label>Nota de entrega</label><input name="nota" className="input" defaultValue={s.entrega_nota ?? ''} placeholder="Quién recibió, hora, observaciones…" /></div>
                <div className="campo"><label>Foto (opcional)</label><input name="evidencia" type="file" accept="image/*" className="input" /></div>
                <button className="btn btn-primario" type="submit">Guardar evidencia</button>
              </form>
            </div>
          )}

          {/* Bitácora y referencias (0163): notas de Logística + aliados sugeridos por Captación */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="documento" size={16} /> Bitácora y referencias</h3>
            {esCapt && (
              <p className="muted" style={{ fontSize: '.82rem', margin: '0 0 8px' }}>
                Deja aquí las <strong>empresas, organizaciones o alianzas de Captación</strong> que puedan ayudar a completar esta solicitud; Logística las verá como referencia.
              </p>
            )}
            {(gestor || esCapt) && (
              <form action={registrarNotaSolicitud} style={{ marginBottom: 10 }}>
                <input type="hidden" name="solicitud_id" value={id} />
                <div className="campo">
                  <textarea name="contenido" className="input" rows={2} required maxLength={2000}
                    placeholder={esCapt ? 'Ej.: «Alimentos del Centro» (enviada por Captación) puede donar agua · contacto: …' : 'Nota de gestión…'} />
                </div>
                <BotonEnviar className="btn btn-primario"><Icono nombre="mas" size={15} /> Agregar nota</BotonEnviar>
              </form>
            )}
            {bitacora.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Sin notas todavía.</p>
            ) : bitacora.map((b) => (
              <div key={b.id} style={{ borderTop: '1px solid var(--borde)', padding: '8px 0' }}>
                <div className="fila" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span className="muted" style={{ fontSize: '.78rem' }}>
                    <strong style={{ color: 'var(--texto)' }}>{nombreMostrado(b.autor?.nombre_completo, verFull) || '—'}</strong>
                    {b.autor?.rol === 'captacion' ? ' · Captación' : ''} · {fechaHora(b.creado_en)}
                  </span>
                  {(gestor || b.autor_id === user!.id) && (
                    <form action={eliminarNotaSolicitud}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="solicitud_id" value={id} />
                      <BotonConfirmar mensaje="¿Eliminar esta nota?" className="btn btn-peligro" style={{ minHeight: 26, padding: '0 8px', fontSize: '.75rem' }}>✕</BotonConfirmar>
                    </form>
                  )}
                </div>
                <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{b.contenido}</p>
              </div>
            ))}
          </div>
        </div>

        {gestor && (
          <aside className="grupo-aside">
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="flecha" size={16} /> Estado</h3>
              {sig ? (
                <form action={cambiarEstadoSolicitud}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="estado" value={sig} />
                  <button className="btn btn-primario" style={{ width: '100%' }}>Avanzar a «{ETIQUETA_ESTADO_INSUMO[sig] ?? sig}»</button>
                </form>
              ) : s.estado === 'entregado' ? (
                <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Solicitud entregada ✅</p>
              ) : s.estado === 'cancelado' ? (
                <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Solicitud cancelada.</p>
              ) : null}

              {['solicitado', 'en_gestion', 'en_ruta'].includes(s.estado) && (
                <form action={cambiarEstadoSolicitud} style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="estado" value="no_disponible" />
                  <BotonConfirmar mensaje="¿Marcar que no se pudo cubrir? Redacción ya la está difundiendo en paralelo; ahí se resaltará como prioridad." className="btn" style={{ width: '100%' }}>No se pudo cubrir (prioriza difusión)</BotonConfirmar>
                </form>
              )}

              {s.estado === 'no_disponible' && (
                <div style={{ marginTop: 8 }}>
                  <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>Marcada como <strong style={{ color: 'var(--texto)' }}>no cubierta</strong>: en Redacción se resalta como <strong style={{ color: 'var(--texto)' }}>prioridad de difusión</strong>.</p>
                  <form action={cambiarEstadoSolicitud}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="estado" value="solicitado" />
                    <button className="btn" style={{ width: '100%' }} type="submit">Reactivar (volver a intentar)</button>
                  </form>
                </div>
              )}

              {s.estado !== 'cancelado' && s.estado !== 'entregado' && s.estado !== 'no_disponible' && (
                <form action={cambiarEstadoSolicitud} style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="estado" value="cancelado" />
                  <BotonConfirmar mensaje="¿Cancelar esta solicitud?" className="btn" style={{ width: '100%' }}>Cancelar solicitud</BotonConfirmar>
                </form>
              )}
            </div>

            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Proveedor</h3>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>
                {s.proveedores?.nombre
                  ? <>Actual: <strong style={{ color: 'var(--texto)' }}>{s.proveedores.nombre}</strong>{s.proveedores.contacto ? ' · ' + s.proveedores.contacto : ''}</>
                  : 'Sin proveedor asignado.'}
              </p>
              <form action={asignarProveedorSolicitud}>
                <input type="hidden" name="id" value={id} />
                <select name="proveedor_id" className="input" defaultValue={s.proveedor_id ?? ''} style={{ width: '100%' }}>
                  <option value="">— Ninguno —</option>
                  {(proveedores ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Asignar</button>
              </form>
              <Link href="/insumos/proveedores" className="muted" style={{ fontSize: '.82rem', display: 'inline-block', marginTop: 8 }}>Gestionar proveedores →</Link>
            </div>

            {s.caso_id && centros.length > 0 && (
              <div className="tarjeta">
                <h3 className="aside-titulo"><Icono nombre="ubicacion" size={16} /> Centros cercanos</h3>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: '.82rem' }}>Ordenados por existencias y cercanía a la solicitud de ayuda. Asigna el que la cubrirá.</p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {centros.map((c: any) => (
                    <div key={c.punto_id} className="fila" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="fila" style={{ gap: 6 }}>
                          <strong style={{ fontSize: '.9rem' }}>{c.nombre}</strong>
                          {c.con_stock
                            ? <Pill tono="ok" punto={false}>con stock</Pill>
                            : <Pill tono="neutra" punto={false}>sin stock</Pill>}
                        </div>
                        <div className="muted" style={{ fontSize: '.8rem' }}>~{Math.round(c.distancia_km)} km{c.telefono ? ' · ' + c.telefono : ''}</div>
                      </div>
                      <form action={asignarCentroSolicitud}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="punto_id" value={c.punto_id} />
                        <button className="btn" style={{ minHeight: 32, padding: '2px 10px' }} type="submit">Asignar</button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="basura" size={16} /> Eliminar</h3>
              <form action={eliminarSolicitud}>
                <input type="hidden" name="id" value={id} />
                <BotonConfirmar mensaje={'¿Eliminar la solicitud "' + s.titulo + '"? No se puede deshacer.'} className="btn btn-peligro" style={{ width: '100%' }}>Eliminar solicitud</BotonConfirmar>
              </form>
            </div>
          </aside>
        )}

        {esCapt && (
          <aside className="grupo-aside">
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="ojo" size={16} /> Vista de consulta</h3>
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                El estado, los envíos y la gestión son de <strong>Logística</strong>. Tu aporte desde Captación es la <strong>bitácora</strong>: referencias de aliados que puedan cubrir esta solicitud.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
