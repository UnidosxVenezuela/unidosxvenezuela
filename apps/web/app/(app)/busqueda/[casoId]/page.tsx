import Link from 'next/link';
import { fechaHora, fechaCorta } from '@/lib/fechas';
import { nombreMostrado } from '@/lib/nombre';
import {
  ETIQUETA_ESTADO_BUSQUEDA, ESTADOS_BUSQUEDA_CIERRE, claseEstadoBusqueda,
  ETIQUETA_SEXO, SEXOS, RESULTADOS_BUSQUEDA, ETIQUETA_RESULTADO_BUSQUEDA,
  claseResultadoBusqueda, TIPOS_CONTACTO_BUSQUEDA, MIN_FUENTES_BUSQUEDA,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Consejo from '@/components/Consejos';
import { hrefSeguro } from '@/lib/constantes';
import { guardBusqueda, PanelVerificacion } from '../_guard';
import { tomarCasoBusqueda, cambiarEstadoBusqueda, editarFichaBusqueda, agregarBitacoraBusqueda, eliminarBitacoraBusqueda, aprobarCoincidenciaBusqueda, derivarAutoridadBusqueda, actualizarCustodiaNna, reunificarNnaBusqueda, cerrarBusqueda, registrarContactoBusqueda, confirmarCierreBusqueda } from '../actions';

const SELECT =
  '*, caso:casos!busqueda_casos_caso_id_fkey(id, numero, titulo, descripcion, estado, asignado_a, creado_en, ' +
  'asignado:perfiles!casos_asignado_a_fkey(nombre_completo))';

// Transiciones operativas disponibles en Fase 1 (las de cierre/mando llegan en Fase 3).
const OPERATIVOS: { estado: string; etiqueta: string; icono: string }[] = [
  { estado: 'en_revision', etiqueta: 'Marcar en revisión', icono: 'ojo' },
  { estado: 'coincidencia_pendiente', etiqueta: 'Marcar coincidencia pendiente', icono: 'enlace' },
  { estado: 'activo', etiqueta: 'Volver a activo', icono: 'refrescar' },
];

export default async function BusquedaDetallePage({ params }: { params: { casoId: string } }) {
  const g = await guardBusqueda();
  if (!g.identidadOk) return <PanelVerificacion />;
  const { supabase, user, esAdmin } = g;
  const casoId = params.casoId;

  const { data: fData } = await supabase.from('busqueda_casos').select(SELECT).eq('caso_id', casoId).single();
  const f: any = fData;
  if (!f) return (
    <div className="tarjeta"><h2>Caso no encontrado</h2>
      <p className="muted">No existe o no tienes acceso a este caso de búsqueda.</p>
      <Link href="/busqueda">← Desaparecidos</Link></div>
  );

  const cerrado = ESTADOS_BUSQUEDA_CIERRE.includes(f.estado_busqueda);
  const pendienteConfirmacion = f.estado_busqueda === 'cierre_pendiente';
  const asignadoAmi = f.caso?.asignado_a === user.id;
  const nombre = f.caso?.titulo ?? '—';

  // Roles operativos sobre el caso. El ENLACE realiza los pasos de la coincidencia
  // (aprobar, llamada, derivar NNA, custodia, reunificar) y propone el cierre; el
  // MANDO da la segunda confirmación (3B). El asignado/enlace/mando ven la bitácora.
  const { data: esMandoData } = await supabase.rpc('es_mando_busqueda');
  const esMando = esMandoData === true;
  const esEnlace = g.esEnlace;
  const puedeOperar = esEnlace || esMando;
  const puedeAtender = asignadoAmi || esMando || esEnlace;

  // Bitácora + catálogo de fuentes (solo para quien atiende el caso).
  let bitacora: any[] = [];
  let fuentes: any[] = [];
  if (puedeAtender) {
    const [{ data: b }, { data: fu }] = await Promise.all([
      supabase.from('bitacora_busqueda').select('id, contenido, fuente, resultado, tipo, creado_en, autor:perfiles!bitacora_busqueda_autor_id_fkey(nombre_completo)').eq('caso_id', casoId).order('creado_en', { ascending: false }),
      supabase.from('fuentes_verificacion').select('id, nombre, descripcion, url, categoria, para_nna, orden').eq('activo', true).order('orden'),
    ]);
    bitacora = (b ?? []) as any[];
    fuentes = (fu ?? []) as any[];
  }
  // Fuentes ya consultadas (por nombre en la bitácora) → checklist ≥3.
  const consultadas = new Set(bitacora.map((n) => (n.fuente || '').trim()).filter(Boolean));
  const nConsultadas = consultadas.size;

  return (
    <div>
      <RealtimeRefrescar tabla="busqueda_casos" filtro={'caso_id=eq.' + casoId} />
      <Consejo id="busqueda-detalle" titulo="Cómo trabajar este caso">
        Verifícalo contra <strong>≥3 fuentes</strong> y regístralo en la <strong>bitácora</strong>. Si hay coincidencia, márcala <strong>pendiente</strong> — <strong>no contactes a la familia</strong>. El <strong>Enlace</strong> valida, <strong>aprueba</strong> y hace la llamada (adulto) o <strong>deriva a la autoridad</strong> (NNA); al finalizar, el <strong>mando</strong> da la <strong>confirmación final</strong>.
      </Consejo>
      <Link href="/busqueda" className="muted">← Desaparecidos</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, gap: 8, flexWrap: 'wrap' }} className="fila">
          <span className="insignia">{f.codigo}</span> {nombre}
          {f.es_nna && <Pill tono="critica" punto={false}>NNA</Pill>}
        </h1>
        <Pill tono={tonoDeClase(claseEstadoBusqueda(f.estado_busqueda))}>{ETIQUETA_ESTADO_BUSQUEDA[f.estado_busqueda as keyof typeof ETIQUETA_ESTADO_BUSQUEDA]}</Pill>
      </div>

      {f.es_nna && (
        <div className="tarjeta fila" style={{ gap: 10, alignItems: 'flex-start', marginTop: 12, background: '#fef2f2', borderColor: '#fecaca' }}>
          <Icono nombre="avisos" size={18} />
          <p className="muted" style={{ margin: 0 }}>
            <strong>Menor de edad.</strong> La coincidencia nunca se confirma directo a quien pregunta:
            se deriva a la autoridad y se verifica la custodia. Extrema la protección de sus datos.
          </p>
        </div>
      )}

      <div className="grupo-grid" style={{ marginTop: 16 }}>
        <div className="grupo-main">
          <div className="tarjeta">
            <div className="grid grid-2">
              <Dato etq="Edad" val={f.edad != null ? `${f.edad} años` : '—'} />
              <Dato etq="Sexo" val={f.sexo ? (ETIQUETA_SEXO[f.sexo] ?? f.sexo) : '—'} />
              <Dato etq="Última ubicación" val={f.ultima_ubicacion || '—'} />
              <Dato etq="Fuente que verificó" val={f.fuente_verifico || '—'} />
            </div>
            {f.caso?.descripcion && <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{f.caso.descripcion}</p>}
            <div className="muted" style={{ fontSize: '.85rem', marginTop: 10 }}>
              Caso #{String(f.caso?.numero ?? '').padStart(5, '0')} · Registrado {fechaCorta(f.creado_en)}
              {f.caso?.asignado?.nombre_completo && <> · Trabaja: <strong style={{ color: 'var(--texto)' }}>{nombreMostrado(f.caso.asignado.nombre_completo, esAdmin)}</strong></>}
            </div>
          </div>

          {(f.reporta_nombre || f.reporta_telefono) && (
            <div className="tarjeta">
              <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="usuario" size={16} /> Quién reporta</h3>
              <div className="grid grid-2">
                <Dato etq="Nombre" val={f.reporta_nombre || '—'} />
                <Dato etq="Contacto" val={f.reporta_telefono || '—'} />
              </div>
            </div>
          )}

          {/* Editar los datos de la ficha */}
          <details className="tarjeta">
            <summary className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}><Icono nombre="documento" size={16} /> Editar datos de la ficha</summary>
            <form action={editarFichaBusqueda} style={{ marginTop: 12 }}>
              <input type="hidden" name="caso_id" value={casoId} />
              <div className="grid grid-2">
                <div className="campo">
                  <label htmlFor="edad">Edad</label>
                  <input id="edad" name="edad" type="number" min={0} max={130} className="input" defaultValue={f.edad ?? ''} />
                </div>
                <div className="campo">
                  <label htmlFor="sexo">Sexo</label>
                  <select id="sexo" name="sexo" className="input" defaultValue={f.sexo ?? ''}>
                    <option value="">Sin especificar</option>
                    {SEXOS.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
                  </select>
                </div>
              </div>
              <div className="campo">
                <label htmlFor="ultima_ubicacion">Última ubicación</label>
                <input id="ultima_ubicacion" name="ultima_ubicacion" className="input" defaultValue={f.ultima_ubicacion ?? ''} maxLength={200} />
              </div>
              <div className="grid grid-2">
                <div className="campo">
                  <label htmlFor="reporta_nombre">Reporta (nombre)</label>
                  <input id="reporta_nombre" name="reporta_nombre" className="input" defaultValue={f.reporta_nombre ?? ''} maxLength={160} />
                </div>
                <div className="campo">
                  <label htmlFor="reporta_telefono">Reporta (contacto)</label>
                  <input id="reporta_telefono" name="reporta_telefono" className="input" defaultValue={f.reporta_telefono ?? ''} maxLength={40} />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="fuente_verifico">Fuente que verificó</label>
                <input id="fuente_verifico" name="fuente_verifico" className="input" defaultValue={f.fuente_verifico ?? ''} maxLength={160} placeholder="Plataforma donde se verificó" />
              </div>
              <label className="fila" style={{ gap: 8, alignItems: 'center', margin: '4px 0 12px', cursor: 'pointer' }}>
                <input type="checkbox" name="es_nna" defaultChecked={f.es_nna} />
                <span>Es menor de edad (NNA)</span>
              </label>
              <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Guardar datos</BotonEnviar>
            </form>
          </details>

          {puedeAtender ? (
            <>
              {/* Verificación cruzada: checklist de fuentes (≥3) */}
              <h2 className="fila" style={{ gap: 6, marginTop: 8 }}><Icono nombre="ok" size={20} /> Verificación cruzada
                <span className="insignia" style={{ marginLeft: 6, background: nConsultadas >= MIN_FUENTES_BUSQUEDA ? '#dcfce7' : undefined }}>{nConsultadas}/{MIN_FUENTES_BUSQUEDA} fuentes</span>
              </h2>
              <p className="muted" style={{ fontSize: '.82rem', marginTop: -6 }}>
                Verifica el caso contra al menos {MIN_FUENTES_BUSQUEDA} fuentes antes de escalar una coincidencia. Registra cada consulta en la bitácora indicando la fuente.
              </p>
              <div className="tarjeta" style={{ display: 'grid', gap: 6 }}>
                {fuentes.length === 0 && <p className="muted" style={{ margin: 0 }}>No hay fuentes en el catálogo. <Link href="/busqueda/recursos">Ver recursos</Link>.</p>}
                {fuentes.map((s) => {
                  const ok = consultadas.has((s.nombre || '').trim());
                  const href = hrefSeguro(s.url);
                  return (
                    <div key={s.id} className="fila" style={{ gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <span className="fila" style={{ gap: 6 }}>
                        <Icono nombre={ok ? 'ok' : 'chevron'} size={15} />
                        <span style={{ fontWeight: ok ? 700 : 400 }}>{s.nombre}</span>
                        {s.para_nna && <Pill tono="critica" punto={false}>NNA</Pill>}
                      </span>
                      {href && <a className="btn btn-sm" href={href} target="_blank" rel="noopener noreferrer nofollow"><Icono nombre="enlace" size={13} /> Abrir</a>}
                    </div>
                  );
                })}
              </div>

              {/* Bitácora confidencial */}
              <h2 className="fila" style={{ gap: 6 }}><Icono nombre="documento" size={20} /> Bitácora de gestiones</h2>
              <p className="muted" style={{ fontSize: '.82rem', marginTop: -6 }}>
                Registro confidencial. Solo lo ven quien trabaja el caso y el mando del grupo.
              </p>
              {!cerrado && (
                <div className="tarjeta">
                  <form action={agregarBitacoraBusqueda}>
                    <input type="hidden" name="caso_id" value={casoId} />
                    <div className="campo">
                      <label htmlFor="contenido">Nueva nota</label>
                      <textarea id="contenido" name="contenido" className="input" rows={3} required placeholder="Qué se consultó/gestionó y qué se encontró…" />
                    </div>
                    <div className="grid grid-2" style={{ gap: 8 }}>
                      <select name="fuente" className="input" defaultValue="">
                        <option value="">Fuente consultada…</option>
                        {fuentes.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                      </select>
                      <select name="resultado" className="input" defaultValue="">
                        <option value="">Resultado…</option>
                        {RESULTADOS_BUSQUEDA.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
                      </select>
                    </div>
                    <div className="fila" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <select name="tipo" className="input" defaultValue="" style={{ maxWidth: 200 }}>
                        <option value="">Tipo de gestión…</option>
                        {TIPOS_CONTACTO_BUSQUEDA.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <BotonEnviar className="btn btn-primario"><Icono nombre="mas" size={16} /> Guardar nota</BotonEnviar>
                    </div>
                  </form>
                </div>
              )}
              {bitacora.length === 0 ? (
                <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Aún no hay gestiones registradas.</p></div>
              ) : bitacora.map((n) => (
                <div key={n.id} className="tarjeta">
                  <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div className="fila muted" style={{ gap: 6, fontSize: '.82rem', flexWrap: 'wrap' }}>
                      {n.fuente && <span className="insignia">{n.fuente}</span>}
                      {n.resultado && <Pill tono={tonoDeClase(claseResultadoBusqueda(n.resultado))} punto={false}>{ETIQUETA_RESULTADO_BUSQUEDA[n.resultado] ?? n.resultado}</Pill>}
                      {n.tipo && <span>· {n.tipo}</span>}
                      <span>· {nombreMostrado(n.autor?.nombre_completo, esAdmin) || '—'} · {fechaHora(n.creado_en)}</span>
                    </div>
                    <form action={eliminarBitacoraBusqueda}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="caso_id" value={casoId} />
                      <BotonConfirmar mensaje="¿Eliminar esta nota de la bitácora?" className="btn btn-peligro" style={{ minHeight: 30, padding: '2px 8px' }}><Icono nombre="basura" size={14} /></BotonConfirmar>
                    </form>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{n.contenido}</p>
                </div>
              ))}
            </>
          ) : (
            <div className="tarjeta">
              <strong className="fila" style={{ gap: 6 }}><Icono nombre="admin" size={18} /> Bitácora confidencial</strong>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                Para ver y registrar gestiones (verificación cruzada de fuentes) primero <strong>toma el caso</strong>. La bitácora solo la ven quien lo trabaja y el mando del grupo.
              </p>
            </div>
          )}
        </div>

        <aside className="grupo-aside">
          {/* Asignación */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Asignación</h3>
            {f.caso?.asignado_a ? (
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                {asignadoAmi ? 'Estás trabajando este caso.' : <>Lo trabaja <strong>{nombreMostrado(f.caso?.asignado?.nombre_completo, esAdmin)}</strong>.</>}
              </p>
            ) : (
              <form action={tomarCasoBusqueda}>
                <input type="hidden" name="caso_id" value={casoId} />
                <BotonEnviar className="btn btn-primario" style={{ width: '100%' }}><Icono nombre="ok" size={16} /> Tomar este caso</BotonEnviar>
              </form>
            )}
          </div>

          {/* Estado operativo */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="flecha" size={16} /> Estado</h3>
            {cerrado ? (
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Caso cerrado: «{ETIQUETA_ESTADO_BUSQUEDA[f.estado_busqueda as keyof typeof ETIQUETA_ESTADO_BUSQUEDA]}».</p>
            ) : (
              <div className="fila" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                {OPERATIVOS.filter((o) => o.estado !== f.estado_busqueda).map((o) => (
                  <form key={o.estado} action={cambiarEstadoBusqueda}>
                    <input type="hidden" name="caso_id" value={casoId} />
                    <input type="hidden" name="estado_busqueda" value={o.estado} />
                    <BotonEnviar className="btn" style={{ width: '100%' }}><Icono nombre={o.icono} size={15} /> {o.etiqueta}</BotonEnviar>
                  </form>
                ))}
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '.78rem' }}>
                  La aprobación de la coincidencia, la llamada, la derivación de NNA y el cierre los realiza el <strong>Enlace de contacto</strong>; el <strong>mando</strong> da la confirmación final.
                </p>
              </div>
            )}
          </div>

          {/* Enlace de contacto: aprobar, llamada (adulto), derivar/reunificar (NNA), cerrar */}
          {puedeOperar && !pendienteConfirmacion && !cerrado && (
            <div className="tarjeta" style={{ borderColor: '#bfdbfe' }}>
              <h3 className="aside-titulo"><Icono nombre="whatsapp" size={16} /> Enlace de contacto</h3>
              {f.estado_busqueda === 'coincidencia_pendiente' && (
                <form action={aprobarCoincidenciaBusqueda}>
                  <input type="hidden" name="caso_id" value={casoId} />
                  <BotonConfirmar mensaje={f.es_nna ? '¿Aprobar la coincidencia de este menor? Luego lo derivarás a la autoridad.' : '¿Aprobar la coincidencia? Luego harás la llamada de confirmación.'} className="btn btn-primario" style={{ width: '100%' }}><Icono nombre="ok" size={15} /> Aprobar coincidencia</BotonConfirmar>
                </form>
              )}
              {f.estado_busqueda === 'coincidencia_aprobada' && !f.es_nna && (
                <form action={registrarContactoBusqueda}>
                  <input type="hidden" name="caso_id" value={casoId} />
                  <div className="campo" style={{ marginTop: 4 }}>
                    <label htmlFor="resultado">Resultado de la llamada</label>
                    <input id="resultado" name="resultado" className="input" placeholder="Qué se confirmó con la familia…" maxLength={200} />
                  </div>
                  <BotonConfirmar mensaje="¿Registrar la llamada? El caso quedará pendiente de la confirmación final del mando." className="btn btn-primario" style={{ width: '100%' }}><Icono nombre="whatsapp" size={15} /> Registrar llamada</BotonConfirmar>
                </form>
              )}
              {f.estado_busqueda === 'coincidencia_aprobada' && f.es_nna && (
                <form action={derivarAutoridadBusqueda}>
                  <input type="hidden" name="caso_id" value={casoId} />
                  <BotonConfirmar mensaje="¿Derivar este menor a la autoridad? Es el paso obligatorio antes de cualquier reunificación." className="btn btn-primario" style={{ width: '100%' }}><Icono nombre="avisos" size={15} /> Derivar a la autoridad</BotonConfirmar>
                </form>
              )}
              {f.es_nna && (f.estado_busqueda === 'coincidencia_aprobada' || f.estado_busqueda === 'derivado_autoridad') && (
                <>
                  <form action={actualizarCustodiaNna} style={{ marginTop: 10 }}>
                    <input type="hidden" name="caso_id" value={casoId} />
                    <label className="fila" style={{ gap: 6, fontSize: '.85rem' }}><input type="checkbox" name="custodia_verificada" defaultChecked={f.custodia_verificada} style={{ width: 'auto', minHeight: 0 }} /> Custodia verificada</label>
                    <label className="fila" style={{ gap: 6, fontSize: '.85rem', marginTop: 4 }}><input type="checkbox" name="autoridad_notificada" defaultChecked={f.autoridad_notificada} style={{ width: 'auto', minHeight: 0 }} /> Autoridad notificada</label>
                    <BotonEnviar className="btn" style={{ width: '100%', marginTop: 8 }}>Guardar custodia/autoridad</BotonEnviar>
                  </form>
                  {f.estado_busqueda === 'derivado_autoridad' && (
                    <form action={reunificarNnaBusqueda} style={{ marginTop: 8 }}>
                      <input type="hidden" name="caso_id" value={casoId} />
                      <BotonConfirmar mensaje="¿Reunificar al menor? Requiere custodia verificada y autoridad notificada. Quedará pendiente de la confirmación del mando." disabled={!(f.custodia_verificada && f.autoridad_notificada)} className="btn btn-primario" style={{ width: '100%' }}><Icono nombre="ok" size={15} /> Reunificar menor</BotonConfirmar>
                    </form>
                  )}
                </>
              )}
              <details style={{ marginTop: 10 }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: '.85rem' }}>Cerrar el caso (descartar / fallecido)…</summary>
                <form action={cerrarBusqueda} style={{ marginTop: 8 }}>
                  <input type="hidden" name="caso_id" value={casoId} />
                  <select name="estado" className="input" defaultValue="descartado">
                    <option value="descartado">Descartar (falso / duplicado)</option>
                    <option value="encontrado_fallecido">Encontrado sin vida</option>
                  </select>
                  <input name="nota" className="input" placeholder="Nota de cierre (opcional)" style={{ marginTop: 6 }} maxLength={200} />
                  <BotonConfirmar mensaje="¿Proponer el cierre con el estado elegido? Lo confirmará el mando." className="btn btn-peligro" style={{ width: '100%', marginTop: 8 }}>Proponer cierre</BotonConfirmar>
                </form>
              </details>
            </div>
          )}

          {/* Mando: segunda confirmación del cierre (decisión 3B) */}
          {pendienteConfirmacion && (esMando ? (
            <div className="tarjeta" style={{ borderColor: '#fdba74' }}>
              <h3 className="aside-titulo"><Icono nombre="llave" size={16} /> Confirmación del mando</h3>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>
                El Enlace finalizó este caso como <strong>{ETIQUETA_ESTADO_BUSQUEDA[(f.cierre_propuesto ?? '') as keyof typeof ETIQUETA_ESTADO_BUSQUEDA] ?? f.cierre_propuesto ?? 'cerrado'}</strong>. Revisa todo el historial y confirma el cierre real.
              </p>
              <form action={confirmarCierreBusqueda}>
                <input type="hidden" name="caso_id" value={casoId} />
                <input type="hidden" name="aprobar" value="si" />
                <input name="nota" className="input" placeholder="Nota de confirmación (opcional)" maxLength={200} />
                <BotonConfirmar mensaje="¿Confirmar el cierre de este caso? Es la validación final." className="btn btn-primario" style={{ width: '100%', marginTop: 8 }}><Icono nombre="ok" size={15} /> Confirmar cierre</BotonConfirmar>
              </form>
              <form action={confirmarCierreBusqueda} style={{ marginTop: 6 }}>
                <input type="hidden" name="caso_id" value={casoId} />
                <input type="hidden" name="aprobar" value="no" />
                <BotonConfirmar mensaje="¿Rechazar el cierre? El caso vuelve a revisión." className="btn" style={{ width: '100%' }}>Rechazar y devolver a revisión</BotonConfirmar>
              </form>
            </div>
          ) : (
            <div className="tarjeta">
              <p className="muted fila" style={{ margin: 0, gap: 6, fontSize: '.85rem' }}>
                <Icono nombre="reloj" size={15} /> Caso finalizado; <strong>pendiente de la confirmación final del mando</strong>.
              </p>
            </div>
          ))}

          {/* Enlace a Coincidencias */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="enlace" size={16} /> Coincidencias</h3>
            <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>Personas halladas que podrían corresponder a este caso.</p>
            <Link href="/coincidencias" className="btn" style={{ width: '100%' }}><Icono nombre="enlace" size={15} /> Ver coincidencias</Link>
          </div>

          {/* Próxima revisión (SLA de seguimiento) */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="reloj" size={16} /> Seguimiento</h3>
            <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
              Próxima revisión: {f.proxima_revision ? fechaHora(f.proxima_revision) : '—'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Dato({ etq, val }: { etq: string; val: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>{etq}</div>
      <div style={{ fontWeight: 600 }}>{val}</div>
    </div>
  );
}
