import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireUsuario, puedeLogistica, puedeVerOportunidades, puedeVerificar, puedeRegistrarOportunidad, esAdministrador, esAdminVerificacion, esCaptacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import { compromisoVencido, DIAS_COMPROMISO_VENCIDO } from '@/lib/semaforo';
import {
  ETIQUETA_TIPO_OFERTA, ETIQUETA_ESTADO_OFERTA, ESTADOS_OFERTA, claseEstadoOferta,
  ETIQUETA_TIPO_INSUMO, ETIQUETA_CANAL, CANALES, ETIQUETA_RESULTADO, claseResultadoOferta,
  ETIQUETA_ESTADO_DONACION, claseEstadoDonacion, ETIQUETA_PRIORIDAD, clasePrioridad, hrefSeguro,
  ETIQUETA_ESTADO_VERIF, ESTADOS_VERIF, claseEstadoVerif,
  ETIQUETA_CLASE_OFERTA, ETIQUETA_ORIGEN_OFERTA, VERIF_CHECKLIST_OFERTA,
} from '@/lib/constantes';
import { fechaHora, fechaCorta } from '@/lib/fechas';
import { nombreMostrado } from '@/lib/nombre';
import Icono from '@/components/Icono';
import Avatar from '@/components/Avatar';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import {
  cambiarEstadoOportunidad, asignarOportunidad, registrarContactoOportunidad,
  eliminarContactoOportunidad, conectarConSolicitud, eliminarOportunidad, verificarOportunidad,
  requerirInfoOportunidad, eliminarAdjuntoOportunidad, cambiarDisponibilidadServicio,
} from '../actions';
import FormEditarOfrecimiento from '../FormEditarOfrecimiento';
import VerificacionCamposOfrecimiento from '../VerificacionCamposOfrecimiento';
import { registrarTransportistaDesdeOferta } from '../../actions';

const RANGO_URGENCIA: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

// Explicación de cada estado del pipeline de la oportunidad (leyenda de seguimiento).
const EXPLICA_OFERTA: Record<string, string> = {
  nueva: 'Recién registrada; aún sin contactar.',
  contactada: 'Ya se hizo el primer contacto con quien ofrece.',
  en_conversacion: 'En conversación para concretar la ayuda.',
  comprometida: 'Se comprometió a donar; conectada con una solicitud.',
  cumplida: 'La donación se concretó. Ciclo cerrado.',
  descartada: 'No continúa (no se concretó o no aplica).',
};

export default async function OportunidadDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const esCapt = esCaptacion(perfil);  // Captación: consulta para alianzas (solo lectura)
  if (!puedeVerOportunidades(perfil)) redirect('/dashboard');
  const gestor = puedeLogistica(perfil);
  const esVerif = puedeVerificar(perfil);
  const supervisaVerif = esAdminVerificacion(perfil);  // admin de Verificaciones: supervisa (lectura)
  const esAdmin = esAdministrador(perfil);
  const supabase = await createClient();

  const { data: o } = await supabase.from('oportunidades_donacion')
    .select('*, asignado:perfiles!oportunidades_donacion_asignado_a_fkey(nombre_completo), autor:perfiles!oportunidades_donacion_creado_por_fkey(nombre_completo), verificador:perfiles!oportunidades_donacion_verificada_por_fkey(nombre_completo)')
    .eq('id', params.id).maybeSingle();
  if (!o) notFound();
  const oo = o as any;
  // Todo el equipo de Recopilación, Logística, Verificación (y su admin) y Captación ven todas (0161).
  if (!gestor && !esVerif && !esCapt && !supervisaVerif && !puedeRegistrarOportunidad(perfil) && oo.creado_por !== user.id) redirect('/insumos/oportunidades');

  const cubre = (oo.cubre_tipos ?? []) as string[];
  const link = hrefSeguro(oo.enlace);
  const id = oo.id as string;

  // Procedencia (0192): si este ofrecimiento nació de una entidad del CRM de
  // Captación, mostrar el vínculo. Best-effort (RLS: solo Captación/Logística/admin
  // pueden leer la entidad; para el resto queda solo la etiqueta sin enlace).
  let captOrigen: any = null;
  if (oo.captacion_oportunidad_id) {
    const { data: co } = await supabase.from('oportunidades').select('id, titulo').eq('id', oo.captacion_oportunidad_id).maybeSingle();
    captOrigen = co;
  }

  // Bitácora + conexiones ya hechas (todos los que ven la ficha).
  const [{ data: bitac }, { data: cnx }, { data: perfilesData }] = await Promise.all([
    supabase.from('bitacora_oportunidad')
      .select('id, contenido, canal, resultado, creado_en, autor_id, autor:perfiles!bitacora_oportunidad_autor_id_fkey(nombre_completo)')
      .eq('oportunidad_id', id).order('creado_en', { ascending: false }),
    supabase.from('donaciones')
      .select('id, donante, tipo, monto, estado, creado_en, solicitudes_insumo(titulo)')
      .eq('oportunidad_id', id).order('creado_en', { ascending: false }),
    supabase.from('perfiles').select('id, nombre_completo, avatar_url'),
  ]);
  const bitacora = (bitac ?? []) as any[];
  const conexiones = (cnx ?? []) as any[];

  // Adjuntos (imágenes/archivos) del ofrecimiento, con URL firmada (0160). Si la migración
  // aún no se aplicó, la consulta vuelve vacía y no se muestra nada (no rompe).
  const { data: adjRaw } = await supabase.from('oportunidad_adjuntos')
    .select('id, url, nombre, mime, creado_por').eq('oportunidad_id', id).order('creado_en');
  const adjuntos = await Promise.all(((adjRaw as any[]) ?? []).map(async (a) => ({
    ...a, href: await urlFirmada(supabase, 'adjuntos', a.url, 3600),
  })));
  const imagenes = adjuntos.filter((a) => a.href && String(a.mime ?? '').startsWith('image/'));
  const documentos = adjuntos.filter((a) => a.href && !String(a.mime ?? '').startsWith('image/'));
  // ¿Quién puede editar el ofrecimiento? Verificación, Logística o TODO el equipo de
  // Recopilación (0161): el candado de columnas impide tocar estado/verificación.
  const puedeEditarOferta = gestor || esVerif || puedeRegistrarOportunidad(perfil);

  // Verificación por campo (0194): estados por campo (best-effort; si 0194 no está
  // aplicada vuelve vacío y el panel muestra todo «sin revisar»).
  const { data: vcRaw } = await supabase.from('oportunidad_verificacion_campo')
    .select('campo, estado, nota, verificado_por, verificado_en').eq('oportunidad_id', id);
  const estadosVerifCampo: Record<string, any> = {};
  ((vcRaw as any[]) ?? []).forEach((r) => { estadosVerifCampo[r.campo] = r; });
  const nombresVerif = new Map<string, string>(((perfilesData ?? []) as any[]).map((p) => [p.id, nombreMostrado(p.nombre_completo, esAdmin)]));

  // Sugerencias de emparejamiento (solo Logística): solicitudes abiertas cuyo tipo
  // encaja con lo que la oferta puede cubrir (o todas, si no se especificó tipo).
  let sugeridas: any[] = [];
  let gestores: any[] = [];
  if (gestor) {
    const [{ data: sols }, { data: gs }] = await Promise.all([
      supabase.from('solicitudes_insumo').select('id, titulo, tipo, urgencia, estado')
        .neq('estado', 'entregado').neq('estado', 'cancelado').order('creado_en', { ascending: false }),
      supabase.from('perfiles').select('id, nombre_completo').eq('verificado', true)
        .in('rol', ['admin', 'logistica', 'admin_logistica', 'coordinador']).order('nombre_completo'),
    ]);
    const conectadas = new Set(conexiones.map((c) => c.solicitudes_insumo?.titulo).filter(Boolean));
    sugeridas = ((sols ?? []) as any[])
      .filter((s) => cubre.length === 0 || cubre.includes(s.tipo))
      .filter((s) => !conectadas.has(s.titulo))
      .sort((a, b) => (RANGO_URGENCIA[a.urgencia] ?? 9) - (RANGO_URGENCIA[b.urgencia] ?? 9));
    gestores = (gs ?? []) as any[];
  }

  // ¿Este ofrecimiento (de transporte) ya está en el registro de transportistas? (0159)
  let yaTransportista = false;
  if (gestor && oo.tipo_oferta === 'transporte') {
    const { count } = await supabase.from('transportistas_logistica')
      .select('*', { count: 'exact', head: true }).eq('oportunidad_id', id);
    yaTransportista = (count ?? 0) > 0;
  }

  const otrosEstados = [...ESTADOS_OFERTA.filter((e) => e !== oo.estado), 'descartada'];
  // Candado de flujo (0161): sin «Verificada» el pipeline solo permite descartar o volver a «nueva».
  const ofertaVerificada = oo.estado_verificacion === 'verificada';
  const destinosEstado = otrosEstados.filter((e) => ofertaVerificada || e === 'descartada' || e === 'nueva');
  // Guía de verificación según el tipo de ofrecimiento (0152): qué confirmar.
  const checklistVerif = VERIF_CHECKLIST_OFERTA[oo.clase as string] ?? VERIF_CHECKLIST_OFERTA.donacion ?? [];
  const claseLabel = oo.clase ? (ETIQUETA_CLASE_OFERTA[oo.clase] ?? oo.clase) : 'Donación';

  // ── Seguimiento (derivado de los datos existentes; sin auditoría dedicada) ──
  // Quién ha intervenido + línea de tiempo de la oportunidad, con avatares.
  const perfilMap = new Map<string, { nombre: string | null; avatar: string | null }>(
    (perfilesData ?? []).map((p: any) => [p.id, { nombre: p.nombre_completo, avatar: p.avatar_url }])
  );
  const nomP = (idp?: string | null) => (idp ? (nombreMostrado(perfilMap.get(idp)?.nombre, esAdmin) || '—') : '—');
  const avaP = (idp?: string | null) => (idp ? (perfilMap.get(idp)?.avatar ?? null) : null);
  const intervino = new Map<string, string[]>();
  const addInt = (idp: string | null | undefined, etq: string) => {
    if (!idp) return; const a = intervino.get(idp) ?? []; if (!a.includes(etq)) a.push(etq); intervino.set(idp, a);
  };
  addInt(oo.creado_por, 'Registró la oportunidad');
  if (oo.verificada_por) addInt(oo.verificada_por, 'Verificó');
  if (oo.asignado_a) addInt(oo.asignado_a, 'Responsable');
  for (const n of bitacora) addInt(n.autor_id, 'Registró gestiones');
  const eventos: { cuando: string; icono: string; texto: string; quien?: string | null }[] = [];
  if (oo.creado_en) eventos.push({ cuando: oo.creado_en, icono: 'mas', texto: 'Oportunidad registrada', quien: oo.creado_por });
  if (oo.verificada_en) eventos.push({ cuando: oo.verificada_en, icono: 'ok', texto: 'Verificación: ' + (ETIQUETA_ESTADO_VERIF[oo.estado_verificacion] ?? oo.estado_verificacion), quien: oo.verificada_por });
  for (const c of conexiones) if (c.creado_en) eventos.push({ cuando: c.creado_en, icono: 'corazon', texto: 'Donación conectada' + (c.solicitudes_insumo?.titulo ? ' · ' + c.solicitudes_insumo.titulo : ''), quien: null });
  eventos.sort((a, b) => (a.cuando < b.cuando ? 1 : -1));

  return (
    <div>
      <RealtimeRefrescar tabla="oportunidades_donacion" filtro={'id=eq.' + id} />
      <Link href="/insumos/oportunidades" className="muted">← Donación-Ofrecimiento</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, gap: 8, flexWrap: 'wrap' }} className="fila">
          {oo.organizacion}
          <Pill tono={tonoDeClase(claseEstadoOferta(oo.estado))} punto={false}>{ETIQUETA_ESTADO_OFERTA[oo.estado] ?? oo.estado}</Pill>
          <Pill tono={tonoDeClase(claseEstadoVerif(oo.estado_verificacion))} punto={false}>{ETIQUETA_ESTADO_VERIF[oo.estado_verificacion] ?? oo.estado_verificacion}</Pill>
        </h1>
      </div>
      <p className="muted sub">
        {oo.numero != null && <><strong style={{ color: 'var(--texto)' }}>OF-{String(oo.numero).padStart(5, '0')}</strong> · </>}
        {oo.clase ? (ETIQUETA_CLASE_OFERTA[oo.clase] ?? oo.clase) : (ETIQUETA_TIPO_OFERTA[oo.tipo_oferta] ?? oo.tipo_oferta)}
        {oo.origen && <> · {ETIQUETA_ORIGEN_OFERTA[oo.origen] ?? oo.origen}</>} · registrada {fechaCorta(oo.creado_en)}
        {oo.autor?.nombre_completo && <> · por {nombreMostrado(oo.autor.nombre_completo, esAdmin)}</>}
      </p>
      {oo.captacion_oportunidad_id && (
        <p className="muted sub fila" style={{ marginTop: -4, gap: 6, flexWrap: 'wrap' }}>
          <Pill tono="info" punto={false}>Procedente de Captación</Pill>
          {captOrigen
            ? <Link href={'/captacion/' + captOrigen.id} className="fila" style={{ gap: 4 }}><Icono nombre="enlace" size={14} /> {captOrigen.titulo} ↗</Link>
            : <span>entidad del CRM de Captación</span>}
        </p>
      )}

      <div className="grupo-grid" style={{ marginTop: 16 }}>
        <div className="grupo-main">
          {/* Semáforo de vida (0193): compromiso vencido */}
          {compromisoVencido(oo) && (
            <div className="tarjeta" style={{ background: 'color-mix(in srgb, var(--peligro, #ef4444) 8%, transparent)', borderColor: 'var(--peligro, #fca5a5)' }}>
              <div className="fila" style={{ gap: 6 }}><Icono nombre="avisos" size={16} /> <strong>Compromiso sin concretar</strong></div>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '.88rem' }}>Se comprometió hace más de {DIAS_COMPROMISO_VENCIDO} días y aún no se cierra. Retoma el contacto y muévelo a <em>Cumplida</em> o <em>Descartada</em>.</p>
            </div>
          )}
          {oo.info_requerida && (
            <div className="tarjeta" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
              <div className="fila" style={{ gap: 6 }}><Icono nombre="avisos" size={16} /> <strong>Requiere información adicional</strong></div>
              <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{oo.info_requerida}</p>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: '.82rem' }}>Devuelto a quien lo registró (Recopilación) para completarlo. Al editarlo y guardar, el aviso se retira.</p>
            </div>
          )}
          {/* Datos de la oferta */}
          <div className="tarjeta">
            <div className="grid grid-2">
              <Dato etq="Tipo de ofrecimiento" val={oo.clase ? (ETIQUETA_CLASE_OFERTA[oo.clase] ?? oo.clase) : (ETIQUETA_TIPO_OFERTA[oo.tipo_oferta] ?? oo.tipo_oferta)} />
              <Dato etq="Quién ofrece" val={oo.origen ? (ETIQUETA_ORIGEN_OFERTA[oo.origen] ?? oo.origen) : '—'} />
              <Dato etq="Forma" val={ETIQUETA_TIPO_OFERTA[oo.tipo_oferta] ?? oo.tipo_oferta} />
              <Dato etq="Contacto" val={oo.contacto || '—'} />
              <Dato etq="Ubicación" val={oo.ubicacion || '—'} />
              {oo.tipo_oferta === 'dinero' && <Dato etq="Monto estimado" val={oo.monto_estimado != null ? String(oo.monto_estimado) : '—'} />}
            </div>
            {cubre.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>Puede cubrir</div>
                <div className="fila" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {cubre.map((t) => <span key={t} className="insignia">{ETIQUETA_TIPO_INSUMO[t] ?? t}</span>)}
                </div>
              </div>
            )}
            {oo.descripcion && <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{oo.descripcion}</p>}
            {link && <a href={link} target="_blank" rel="noreferrer noopener nofollow" className="fila" style={{ gap: 6, marginTop: 8 }}><Icono nombre="enlace" size={16} /> Abrir enlace</a>}
          </div>

          {/* Disponibilidad del servicio (0168): solo para clase='servicio'. Un servicio
              verificado queda DISPONIBLE de forma permanente; Logística lo da de baja al
              terminar o cuando ya no se requiere (reactivable). */}
          {oo.clase === 'servicio' && (() => {
            const esBaja = (oo.servicio_estado ?? 'activo') === 'baja';
            return (
              <div className="tarjeta">
                <h3 className="aside-titulo fila" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span className="fila" style={{ gap: 6 }}><Icono nombre="reloj" size={16} /> Disponibilidad del servicio</span>
                  <Pill tono={esBaja ? 'neutra' : 'ok'} punto={false}>{esBaja ? 'Dado de baja' : 'Disponible'}</Pill>
                </h3>
                {esBaja ? (
                  <p className="muted" style={{ fontSize: '.86rem', margin: '4px 0 0' }}>
                    {oo.servicio_baja_motivo ? <>Motivo: <strong>{oo.servicio_baja_motivo}</strong>. </> : null}
                    {oo.servicio_baja_en ? <>Dado de baja el {fechaHora(oo.servicio_baja_en)}.</> : null}
                  </p>
                ) : (
                  <p className="muted" style={{ fontSize: '.86rem', margin: '4px 0 0' }}>
                    Este servicio está activo en el <Link href="/insumos/servicios">directorio de servicios</Link>.
                    {oo.estado_verificacion !== 'verificada' && <> Aparecerá como <strong>disponible</strong> cuando Verificación lo confirme.</>}
                  </p>
                )}
                {gestor && (
                  <div style={{ marginTop: 10 }}>
                    {esBaja ? (
                      <form action={cambiarDisponibilidadServicio}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="accion" value="reactivar" />
                        <input type="hidden" name="volver" value={'/insumos/oportunidades/' + id} />
                        <BotonConfirmar mensaje="¿Reactivar este servicio? Volverá al directorio de disponibles."
                          className="btn btn-sm" confirmar="Sí, reactivar"><Icono nombre="refrescar" size={14} /> Reactivar servicio</BotonConfirmar>
                      </form>
                    ) : (
                      <form action={cambiarDisponibilidadServicio}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="accion" value="baja" />
                        <input type="hidden" name="volver" value={'/insumos/oportunidades/' + id} />
                        <input name="motivo" className="input" placeholder="Motivo de la baja (terminó, ya no se requiere…)" maxLength={300} style={{ marginBottom: 6 }} />
                        <BotonEnviar className="btn btn-sm btn-peligro"><Icono nombre="caja" size={14} /> Dar de baja</BotonEnviar>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Imágenes y adjuntos del ofrecimiento (0160) */}
          {adjuntos.length > 0 && (
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="documento" size={16} /> Imágenes y adjuntos</h3>
              {imagenes.length > 0 && (
                <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {imagenes.map((a) => (
                    <div key={a.id} style={{ position: 'relative' }}>
                      <a href={a.href} target="_blank" rel="noopener noreferrer" title={a.nombre}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.href} alt={a.nombre} loading="lazy" style={{ width: 104, height: 104, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--borde)' }} />
                      </a>
                      {(gestor || esVerif || a.creado_por === user.id) && (
                        <form action={eliminarAdjuntoOportunidad} style={{ position: 'absolute', top: 2, right: 2 }}>
                          <input type="hidden" name="adjunto_id" value={a.id} />
                          <input type="hidden" name="oportunidad_id" value={id} />
                          <BotonConfirmar mensaje="¿Eliminar este adjunto?" className="btn btn-peligro" style={{ minHeight: 24, padding: '0 6px', fontSize: '.7rem' }}>✕</BotonConfirmar>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {documentos.length > 0 && (
                <div className="fila" style={{ gap: 8, flexWrap: 'wrap', marginTop: imagenes.length ? 10 : 0 }}>
                  {documentos.map((a) => (
                    <span key={a.id} className="fila" style={{ gap: 4, alignItems: 'center' }}>
                      <a className="adjunto-chip" href={a.href} target="_blank" rel="noopener noreferrer"><Icono nombre="documento" size={15} /> {a.nombre}</a>
                      {(gestor || esVerif || a.creado_por === user.id) && (
                        <form action={eliminarAdjuntoOportunidad}>
                          <input type="hidden" name="adjunto_id" value={a.id} />
                          <input type="hidden" name="oportunidad_id" value={id} />
                          <BotonConfirmar mensaje="¿Eliminar este adjunto?" className="btn btn-peligro" style={{ minHeight: 26, padding: '2px 6px' }}><Icono nombre="basura" size={13} /></BotonConfirmar>
                        </form>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editar el ofrecimiento / agregar imágenes (Verificación · Logística · creador) */}
          {puedeEditarOferta && <FormEditarOfrecimiento oo={oo} />}

          {/* Emparejamiento (Logística) */}
          {gestor && (
            <>
              <h2 className="fila" style={{ gap: 6 }}><Icono nombre="enlace" size={20} /> Emparejar con una solicitud</h2>
              <p className="muted" style={{ fontSize: '.82rem', marginTop: -6 }}>
                Solicitudes abiertas que encajan con lo que esta oferta puede cubrir. Al conectar se crea una donación
                comprometida ligada a la solicitud y la oportunidad avanza a «Comprometida».
              </p>
              {!ofertaVerificada ? (
                <div className="tarjeta vacio"><p className="muted" style={{ margin: 0 }}>🔒 Se podrá emparejar cuando Verificación marque este ofrecimiento como «Verificada».</p></div>
              ) : sugeridas.length === 0 ? (
                <div className="tarjeta vacio"><p className="muted" style={{ margin: 0 }}>No hay solicitudes abiertas que encajen ahora mismo.</p></div>
              ) : (
                <div className="tarjeta"><div className="tabla-scroll"><table>
                  <thead><tr><th>Solicitud</th><th>Tipo</th><th>Urgencia</th><th></th></tr></thead>
                  <tbody>
                    {sugeridas.slice(0, 30).map((s) => (
                      <tr key={s.id}>
                        <td><Link href={'/insumos/' + s.id}>{s.titulo}</Link></td>
                        <td className="muted">{ETIQUETA_TIPO_INSUMO[s.tipo] ?? s.tipo}</td>
                        <td><Pill tono={tonoDeClase(clasePrioridad(s.urgencia))} punto={false}>{ETIQUETA_PRIORIDAD[s.urgencia as keyof typeof ETIQUETA_PRIORIDAD] ?? s.urgencia}</Pill></td>
                        <td>
                          <form action={conectarConSolicitud}>
                            <input type="hidden" name="oportunidad_id" value={id} />
                            <input type="hidden" name="solicitud_id" value={s.id} />
                            <BotonConfirmar mensaje={'¿Conectar esta oferta con «' + s.titulo + '»? Se registrará una donación comprometida.'} className="btn btn-sm btn-primario" style={{ minHeight: 30, padding: '2px 10px' }}><Icono nombre="enlace" size={13} /> Conectar</BotonConfirmar>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div></div>
              )}
            </>
          )}

          {/* Conexiones ya hechas */}
          {conexiones.length > 0 && (
            <>
              <h2 className="fila" style={{ gap: 6 }}><Icono nombre="corazon" size={20} /> Donaciones conectadas</h2>
              <div className="tarjeta"><div className="tabla-scroll"><table>
                <thead><tr><th>Para</th><th>Aporte</th><th>Estado</th></tr></thead>
                <tbody>
                  {conexiones.map((c) => (
                    <tr key={c.id}>
                      <td className="muted">{c.solicitudes_insumo?.titulo || '—'}</td>
                      <td>{c.tipo === 'dinero' && c.monto != null ? c.monto : (c.tipo === 'dinero' ? 'Dinero' : 'Especie')}</td>
                      <td><Pill tono={tonoDeClase(claseEstadoDonacion(c.estado))} punto={false}>{ETIQUETA_ESTADO_DONACION[c.estado] ?? c.estado}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <p className="muted" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>Sigue el estado de cada donación en <Link href="/insumos/oportunidades">Donación-Ofrecimiento</Link>.</p>
              </div>
            </>
          )}

          {/* Bitácora de contacto */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="documento" size={20} /> Bitácora de contacto</h2>
          {(gestor || esVerif) && (
            <div className="tarjeta">
              <form action={registrarContactoOportunidad}>
                <input type="hidden" name="oportunidad_id" value={id} />
                <div className="campo">
                  <label htmlFor="contenido">Nueva gestión</label>
                  <textarea id="contenido" name="contenido" className="input" rows={3} required placeholder="Qué se habló / acordó…" maxLength={2000} />
                </div>
                <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <select name="canal" className="input" defaultValue="" style={{ maxWidth: 180 }}>
                    <option value="">Canal…</option>
                    {CANALES.map((c) => <option key={c} value={c}>{ETIQUETA_CANAL[c]}</option>)}
                  </select>
                  <select name="resultado" className="input" defaultValue="" style={{ maxWidth: 180 }}>
                    <option value="">Resultado…</option>
                    {Object.keys(ETIQUETA_RESULTADO).map((r) => <option key={r} value={r}>{ETIQUETA_RESULTADO[r]}</option>)}
                  </select>
                  <BotonEnviar className="btn btn-primario"><Icono nombre="mas" size={16} /> Guardar gestión</BotonEnviar>
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
                  {n.canal && <span className="insignia">{ETIQUETA_CANAL[n.canal] ?? n.canal}</span>}
                  {n.resultado && <Pill tono={tonoDeClase(claseResultadoOferta(n.resultado))} punto={false}>{ETIQUETA_RESULTADO[n.resultado] ?? n.resultado}</Pill>}
                  <span>· {nombreMostrado(n.autor?.nombre_completo, esAdmin) || '—'} · {fechaHora(n.creado_en)}</span>
                </div>
                {gestor && (
                  <form action={eliminarContactoOportunidad}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="oportunidad_id" value={id} />
                    <BotonConfirmar mensaje="¿Eliminar esta nota de la bitácora?" className="btn btn-peligro" style={{ minHeight: 30, padding: '2px 8px' }}><Icono nombre="basura" size={14} /></BotonConfirmar>
                  </form>
                )}
              </div>
              <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{n.contenido}</p>
            </div>
          ))}

          {/* Quién ha intervenido (derivado: creador, verificador, responsable, autores de bitácora) */}
          {intervino.size > 0 && (
            <>
              <h2 className="fila" style={{ gap: 6 }}><Icono nombre="grupos" size={20} /> Quién ha intervenido</h2>
              <div className="tarjeta">
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                  {[...intervino.entries()].map(([idp, acciones]) => (
                    <li key={idp} className="fila" style={{ gap: 10, alignItems: 'center' }}>
                      <Avatar nombre={nomP(idp)} url={avaP(idp)} size={30} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{nomP(idp)}</div>
                        <div className="fila" style={{ gap: 4, flexWrap: 'wrap' }}>
                          {acciones.map((a) => <Pill key={a} tono="neutra" punto={false}>{a}</Pill>)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Historial / actividad (línea de vida derivada; el detalle de contacto está en la bitácora) */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="historial" size={20} /> Historial / actividad</h2>
          <div className="tarjeta">
            {eventos.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin actividad todavía.</p> : (
              <ul className="timeline">
                {eventos.map((e, i) => (
                  <li key={i}>
                    <div className="fila" style={{ gap: 6, fontWeight: 600 }}><Icono nombre={e.icono} size={15} /> {e.texto}</div>
                    <div className="muted" style={{ fontSize: '.8rem' }}>{fechaHora(e.cuando)}{e.quien ? ' · ' + nomP(e.quien) : ''}</div>
                  </li>
                ))}
              </ul>
            )}
            {bitacora.length > 0 && <p className="muted" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>Las gestiones de contacto están en la <strong>bitácora</strong>, más arriba.</p>}
          </div>

          {/* Estados de la oportunidad (leyenda) */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="filtro" size={20} /> Estados de la oportunidad</h2>
          <div className="tarjeta">
            <div className="leyenda">
              {[...ESTADOS_OFERTA, 'descartada'].map((e) => (
                <div key={e} className="leyenda-fila">
                  <Pill tono={tonoDeClase(claseEstadoOferta(e))} punto={false}>{ETIQUETA_ESTADO_OFERTA[e] ?? e}</Pill>
                  <span className="muted">{EXPLICA_OFERTA[e]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="grupo-aside">
          {/* Verificación de la oferta: la revisa y marca el equipo de Verificación
              (existencia, contacto, canales oficiales). No toca el pipeline de Logística. */}
          <div className="tarjeta" style={{ borderColor: '#bfdbfe' }}>
            <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> Verificación</h3>
            {/* Guía de verificación según el tipo de ofrecimiento (0152). */}
            <details style={{ margin: '0 0 8px' }}>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>Qué confirmar · {claseLabel}</summary>
              <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '.82rem' }}>
                {checklistVerif.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </details>
            <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
              <Pill tono={tonoDeClase(claseEstadoVerif(oo.estado_verificacion))} punto={false}>{ETIQUETA_ESTADO_VERIF[oo.estado_verificacion] ?? oo.estado_verificacion}</Pill>
              {oo.verificada_en && oo.verificador?.nombre_completo && <span className="muted" style={{ fontSize: '.8rem' }}>{nombreMostrado(oo.verificador.nombre_completo, esAdmin)} · {fechaCorta(oo.verificada_en)}</span>}
            </div>
            {oo.nota_verificacion && <p className="muted" style={{ margin: '8px 0 0', fontSize: '.85rem', whiteSpace: 'pre-wrap' }}>{oo.nota_verificacion}</p>}
            {/* Verificación campo por campo (0194): mismo molde que los casos. Al quedar
                todos en verde el ofrecimiento pasa a «Verificada» (candado real). */}
            <VerificacionCamposOfrecimiento oportunidadId={id} clase={oo.clase ?? 'donacion'} estados={estadosVerifCampo}
              volver={'/insumos/oportunidades/' + id} nombres={nombresVerif} puedeVerificar={esVerif} />
            {esVerif && (
              <details style={{ marginTop: 10 }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>Marcar el veredicto de una vez (atajo)</summary>
                <form action={verificarOportunidad} style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={id} />
                  <textarea name="nota" className="input" rows={2} placeholder="Nota de verificación (existencia, contacto, canales oficiales…)" defaultValue={oo.nota_verificacion ?? ''} maxLength={500} />
                  <div className="fila" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
                    <select name="estado" className="input" defaultValue={oo.estado_verificacion} style={{ width: 'auto' }}>
                      {ESTADOS_VERIF.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_VERIF[e]}</option>)}
                    </select>
                    <BotonEnviar className="btn"><Icono nombre="ok" size={15} /> Guardar</BotonEnviar>
                  </div>
                </form>
              </details>
            )}
            {/* Devolver a Recopilación si falta información (0160) */}
            {esVerif && (
              <form action={requerirInfoOportunidad} style={{ marginTop: 12, borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
                <input type="hidden" name="id" value={id} />
                <label className="muted" style={{ fontSize: '.82rem' }}>¿Falta un dato para poder verificar? Devuélvelo a Recopilación indicando qué completar:</label>
                <textarea name="motivo" className="input" rows={2} maxLength={500} placeholder="Qué información falta (contacto, montos, canales oficiales…)" style={{ marginTop: 4 }} />
                <BotonConfirmar mensaje="¿Devolver este ofrecimiento a Recopilación como «Requiere información adicional»? Se avisará a quien lo registró." className="btn" style={{ width: '100%', marginTop: 6 }}>
                  <Icono nombre="avisos" size={15} /> Requiere información adicional
                </BotonConfirmar>
              </form>
            )}
          </div>

          {gestor ? (
            <>
              {/* Estado del pipeline */}
              <div className="tarjeta">
                <h3 className="aside-titulo"><Icono nombre="flecha" size={16} /> Estado</h3>
                {!ofertaVerificada && (
                  <p className="muted" style={{ fontSize: '.8rem', margin: '0 0 10px' }}>
                    🔒 Para <strong>avanzar</strong> este ofrecimiento, Verificación debe marcarlo antes como <strong>«Verificada»</strong>. Mientras tanto solo se puede descartar.
                  </p>
                )}
                <div className="fila" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                  {destinosEstado.map((e) => (
                    <form key={e} action={cambiarEstadoOportunidad}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="estado" value={e} />
                      <input type="hidden" name="volver" value={'/insumos/oportunidades/' + id} />
                      <BotonEnviar className={'btn' + (e === 'descartada' ? ' btn-peligro' : '')} style={{ width: '100%' }}>Mover a {ETIQUETA_ESTADO_OFERTA[e] ?? e}</BotonEnviar>
                    </form>
                  ))}
                </div>
              </div>

              {/* Asignar responsable */}
              <div className="tarjeta">
                <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Responsable</h3>
                <form action={asignarOportunidad}>
                  <input type="hidden" name="id" value={id} />
                  <select name="asignado_a" className="input" defaultValue={oo.asignado_a ?? ''}>
                    <option value="">— Sin asignar —</option>
                    {gestores.map((g) => <option key={g.id} value={g.id}>{nombreMostrado(g.nombre_completo, esAdmin)}</option>)}
                  </select>
                  <BotonEnviar className="btn" style={{ width: '100%', marginTop: 8 }}><Icono nombre="ok" size={15} /> Guardar responsable</BotonEnviar>
                </form>
                {oo.asignado?.nombre_completo && <p className="muted" style={{ margin: '8px 0 0', fontSize: '.82rem' }}>Ahora: <strong>{nombreMostrado(oo.asignado.nombre_completo, esAdmin)}</strong></p>}
              </div>

              {/* Registrar como transportista (ofrecimientos de transporte, 0159) */}
              {oo.tipo_oferta === 'transporte' && (
                <div className="tarjeta">
                  <h3 className="aside-titulo"><Icono nombre="camion" size={16} /> Transportista</h3>
                  {yaTransportista ? (
                    <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>✓ Ya está en el <Link href="/insumos/transportistas">registro de transportistas</Link>; se puede elegir como conductor al hacer un envío.</p>
                  ) : (
                    <>
                      <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>Ofrece transporte. Regístralo para poder elegirlo como <strong>conductor</strong> al hacer un envío.</p>
                      <form action={registrarTransportistaDesdeOferta}>
                        <input type="hidden" name="oportunidad_id" value={id} />
                        <BotonEnviar className="btn btn-primario" style={{ width: '100%' }}><Icono nombre="mas" size={15} /> Registrar como transportista</BotonEnviar>
                      </form>
                    </>
                  )}
                </div>
              )}

              {/* Eliminar */}
              <div className="tarjeta">
                <form action={eliminarOportunidad}>
                  <input type="hidden" name="id" value={id} />
                  <BotonConfirmar mensaje={'¿Eliminar «' + oo.organizacion + '»? No se puede deshacer.'} className="btn btn-peligro" style={{ width: '100%' }}><Icono nombre="basura" size={15} /> Eliminar oportunidad</BotonConfirmar>
                </form>
              </div>
            </>
          ) : esCapt && oo.creado_por !== user.id ? (
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="enlace" size={16} /> Alianzas y convenios</h3>
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                Vista de solo lectura. Usa este contacto para explorar <strong>alianzas, convenios o futuras donaciones</strong>; la gestión y el emparejamiento los lleva Logística.
              </p>
            </div>
          ) : (
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="corazon" size={16} /> {oo.creado_por === user.id ? 'Tu oferta registrada' : 'Registro de Recopilación'}</h3>
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                Recopilación puede <strong>completar o corregir los datos</strong> (Editar). El <strong>estado</strong> lo avanza Logística y la <strong>verificación</strong> la hace el equipo de Verificación. Aquí verás el avance.
              </p>
            </div>
          )}
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
