import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica, puedeRegistrarOportunidad, puedeVerOportunidades, puedeVerificar, esAdminVerificacion, esCaptacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ETIQUETA_TIPO_OFERTA, TIPOS_OFERTA, ETIQUETA_ESTADO_OFERTA, ESTADOS_OFERTA, claseEstadoOferta,
  ETIQUETA_TIPO_INSUMO, TIPOS_INSUMO, ETIQUETA_ESTADO_DONACION, ESTADOS_DONACION,
  ETIQUETA_ESTADO_VERIF, claseEstadoVerif,
  ETIQUETA_CLASE_OFERTA, CLASES_OFERTA, EXPLICA_CLASE_OFERTA, ETIQUETA_ORIGEN_OFERTA, ORIGENES_OFERTA,
} from '@/lib/constantes';
import { fechaCorta } from '@/lib/fechas';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import ResaltarNuevos from '@/components/ResaltarNuevos';
import { crearOportunidad } from './actions';
import { cambiarEstadoDonacion, eliminarDonacion } from '../actions';

export default async function OportunidadesPage() {
  const { user, perfil } = await requireUsuario();
  // Entrar a la sección: crean, verifican, supervisan o consultan. Quién DA DE ALTA es
  // más acotado (puedeRegistrar): Verificación entra a verificar, no a crear.
  if (!puedeVerOportunidades(perfil)) redirect('/dashboard');
  const puedeRegistrar = puedeRegistrarOportunidad(perfil);  // SOLO Logística + Recopilación dan de alta
  const esCapt = esCaptacion(perfil);                        // Captación: consulta para alianzas (solo lectura)
  const gestor = puedeLogistica(perfil);
  const esVerif = puedeVerificar(perfil);
  const verTablero = gestor || esVerif || esCapt || esAdminVerificacion(perfil);  // Logística, Verificación (y su admin) y Captación ven todo el tablero
  const supabase = await createClient();

  // Logística, Verificación y Captación ven todas; Recopilación ve solo las que registró.
  // `*` para no romper si la migración 0152 (clase/origen) aún no está aplicada: los
  // campos faltantes simplemente vienen undefined y la tarjeta los omite.
  let query = supabase.from('oportunidades_donacion')
    .select('*')
    .order('creado_en', { ascending: false });
  if (!verTablero) query = query.eq('creado_por', user.id);
  const { data } = await query;
  const ops = (data ?? []) as any[];
  const activas = ops.filter((o) => o.estado !== 'descartada');
  const descartadas = ops.filter((o) => o.estado === 'descartada');
  const porEstado = (e: string) => activas.filter((o) => o.estado === e);

  // Donaciones concretadas (solo Logística): se crean al conectar una oferta con una
  // solicitud; aquí se les da seguimiento (estado) y se pueden borrar.
  let donaciones: any[] = [];
  if (gestor) {
    const { data: dons } = await supabase.from('donaciones')
      .select('id, donante, tipo, descripcion, monto, estado, solicitudes_insumo(titulo)')
      .order('creado_en', { ascending: false });
    donaciones = (dons ?? []) as any[];
  }

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="oportunidades_donacion" />
      <Link href="/insumos" className="muted">← Logística</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Donación-Ofrecimiento</h1>
          <p className="muted sub">
            Registra a quienes ofrecen ayudar —una <strong>donación</strong> (bienes) o un <strong>servicio de ayuda o atención</strong>—,
            empáréjalos con las solicitudes que encajan y lleva el contacto hasta concretarlo.
          </p>
        </div>
        <div className="fila"><BotonActualizar /></div>
      </div>

      {esCapt && !gestor && !esVerif && (
        <p className="muted fila" style={{ gap: 6, fontSize: '.88rem', marginTop: 4 }}>
          <Icono nombre="enlace" size={15} /> Vista de solo lectura para explorar posibles <strong>alianzas, convenios o futuras donaciones</strong>. La gestión y el emparejamiento los lleva Logística.
        </p>
      )}

      {/* Alta de una oferta: la puede registrar Logística y Recopilación (Captación es solo lectura) */}
      {puedeRegistrar && (
      <details className="tarjeta" style={{ maxWidth: 720 }} open={ops.length === 0}>
        <summary className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}>
          <Icono nombre="mas" size={16} /> Registrar un ofrecimiento (donación o servicio)
        </summary>
        <form action={crearOportunidad} style={{ marginTop: 12 }}>
          {/* Qué se ofrece (0152): Donación (bienes) vs Servicio de ayuda o atención. */}
          <div className="campo">
            <label>Tipo de ofrecimiento</label>
            <div className="fila" style={{ gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
              {CLASES_OFERTA.map((c, i) => (
                <label key={c} className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 400 }}>
                  <input type="radio" name="clase" value={c} defaultChecked={i === 0} style={{ width: 'auto', minHeight: 0 }} /> {ETIQUETA_CLASE_OFERTA[c]}
                </label>
              ))}
            </div>
            <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
              <strong>Donación:</strong> {EXPLICA_CLASE_OFERTA.donacion}<br />
              <strong>Servicio de ayuda o atención:</strong> {EXPLICA_CLASE_OFERTA.servicio}
            </p>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Nombre de quien ofrece</label><input name="organizacion" className="input" required placeholder="Empresa · proyecto · persona" maxLength={160} /></div>
            <div className="campo"><label>Quién ofrece <span className="muted">(tipo)</span></label>
              <select name="origen" className="input" defaultValue="">
                <option value="">— Sin especificar —</option>
                {ORIGENES_OFERTA.map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN_OFERTA[o]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Forma <span className="muted">(detalle)</span></label>
              <select name="tipo_oferta" className="input" defaultValue="especie">
                {TIPOS_OFERTA.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_OFERTA[t]}</option>)}
              </select>
            </div>
            <div className="campo"><label>Contacto</label><input name="contacto" className="input" placeholder="Nombre · teléfono · correo" maxLength={200} /></div>
          </div>
          <div className="campo">
            <label>¿Qué tipos de insumo puede cubrir? <span className="muted">(para sugerir coincidencias)</span></label>
            <div className="fila" style={{ gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              {TIPOS_INSUMO.map((t) => (
                <label key={t} className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 400 }}>
                  <input type="checkbox" name="cubre_tipos" value={t} style={{ width: 'auto', minHeight: 0 }} /> {ETIQUETA_TIPO_INSUMO[t]}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Descripción</label><input name="descripcion" className="input" placeholder="Qué ofrece / detalles" maxLength={500} /></div>
            <div className="campo"><label>Monto estimado <span className="muted">(si es dinero)</span></label><input name="monto_estimado" type="number" step="0.01" min="0" className="input" /></div>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Ubicación</label><input name="ubicacion" className="input" placeholder="Ciudad / zona" maxLength={160} /></div>
            <div className="campo"><label>Enlace</label><input name="enlace" className="input" placeholder="Web o red social (opcional)" maxLength={500} /></div>
          </div>
          <BotonEnviar className="btn btn-primario"><Icono nombre="corazon" size={16} /> Registrar oportunidad</BotonEnviar>
        </form>
      </details>
      )}

      {ops.length === 0 ? (
        <EstadoVacio
          icono="corazon"
          titulo="Aún no hay oportunidades"
          texto={puedeRegistrar
            ? 'Registra la primera oferta de ayuda para empezar a conectar donaciones con las solicitudes.'
            : 'Cuando se registren ofrecimientos aparecerán aquí para explorar posibles alianzas.'}
        />
      ) : verTablero ? (
        <>
          <ResaltarNuevos>
            <div className="tablero-insumos" style={{ marginTop: 16 }}>
              {ESTADOS_OFERTA.map((e) => (
                <div key={e} className="tablero-col">
                  <h3 className="fila" style={{ gap: 6, justifyContent: 'space-between' }}>
                    <span>{ETIQUETA_ESTADO_OFERTA[e] ?? e}</span>
                    <span className="insignia">{porEstado(e).length}</span>
                  </h3>
                  {porEstado(e).length === 0 && <p className="muted" style={{ fontSize: '.85rem', margin: '0 4px' }}>—</p>}
                  {porEstado(e).map((o) => <TarjetaOferta key={o.id} o={o} />)}
                </div>
              ))}
            </div>
          </ResaltarNuevos>
          {descartadas.length > 0 && (
            <details className="tarjeta" style={{ marginTop: 16 }}>
              <summary className="muted" style={{ cursor: 'pointer' }}>Descartadas ({descartadas.length})</summary>
              <div className="fila" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {descartadas.map((o) => (
                  <Link key={o.id} href={'/insumos/oportunidades/' + o.id} className="btn btn-sm">{o.organizacion}</Link>
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        // Recopilación: lista de las que registró (lectura).
        <div className="tarjeta" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Las que registraste</h3>
          <div className="tabla-scroll"><table>
            <thead><tr><th>Quién ofrece</th><th>Tipo</th><th>Estado</th></tr></thead>
            <tbody>
              {ops.map((o) => (
                <tr key={o.id}>
                  <td><Link href={'/insumos/oportunidades/' + o.id}><strong>{o.organizacion}</strong></Link>
                    <div className="muted" style={{ fontSize: '.8rem' }}>{o.numero != null ? 'OF-' + String(o.numero).padStart(5, '0') + ' · ' : ''}{o.origen ? (ETIQUETA_ORIGEN_OFERTA[o.origen] ?? o.origen) + ' · ' : ''}{fechaCorta(o.creado_en)}</div></td>
                  <td className="muted">{o.clase ? (ETIQUETA_CLASE_OFERTA[o.clase] ?? o.clase) : (ETIQUETA_TIPO_OFERTA[o.tipo_oferta] ?? o.tipo_oferta)}</td>
                  <td>
                    <Pill tono={tonoDeClase(claseEstadoOferta(o.estado))} punto={false}>{ETIQUETA_ESTADO_OFERTA[o.estado] ?? o.estado}</Pill>
                    <div style={{ marginTop: 4 }}><Pill tono={tonoDeClase(claseEstadoVerif(o.estado_verificacion))} punto={false}>{ETIQUETA_ESTADO_VERIF[o.estado_verificacion] ?? o.estado_verificacion}</Pill></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: 10, marginBottom: 0 }}>
            El equipo de Logística contacta y empareja cada oferta; el de Verificación la verifica.
          </p>
        </div>
      )}

      {/* Donaciones concretadas (Logística): se crean al «Conectar» una oferta con una
          solicitud desde el detalle. Aquí se les sigue el estado y se pueden borrar. */}
      {gestor && (
        <details className="tarjeta" style={{ marginTop: 20 }} open={donaciones.length > 0}>
          <summary className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}>
            <Icono nombre="corazon" size={16} /> Donaciones concretadas ({donaciones.length})
          </summary>
          {donaciones.length === 0 ? (
            <p className="muted" style={{ margin: '10px 0 0', fontSize: '.85rem' }}>
              Aún no hay donaciones. Se crean al <strong>conectar</strong> una oferta con una solicitud desde el detalle de una oportunidad.
            </p>
          ) : (
            <div className="tabla-scroll" style={{ marginTop: 10 }}><table>
              <thead><tr><th>Donante</th><th>Aporte</th><th>Para</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {donaciones.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.donante}</strong><div className="muted" style={{ fontSize: '.8rem' }}>{d.tipo === 'dinero' ? 'Dinero' : 'Especie'}</div></td>
                    <td>{d.tipo === 'dinero' && d.monto != null ? d.monto : (d.descripcion || '—')}</td>
                    <td className="muted">{d.solicitudes_insumo?.titulo || '—'}</td>
                    <td>
                      <form action={cambiarEstadoDonacion} className="fila" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <input type="hidden" name="id" value={d.id} />
                        <select name="estado" defaultValue={d.estado} className="input" style={{ minHeight: 30, padding: '2px 6px', width: 'auto' }}>
                          {ESTADOS_DONACION.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_DONACION[e] ?? e}</option>)}
                        </select>
                        <button className="btn" style={{ minHeight: 30, padding: '2px 8px' }}>OK</button>
                      </form>
                    </td>
                    <td>
                      <form action={eliminarDonacion}>
                        <input type="hidden" name="id" value={d.id} />
                        <BotonConfirmar mensaje="¿Eliminar esta donación?" className="btn btn-peligro" style={{ minHeight: 30, padding: '2px 8px' }}><Icono nombre="basura" size={14} /></BotonConfirmar>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </details>
      )}
    </AnimarEntrada>
  );
}

function TarjetaOferta({ o }: { o: any }) {
  return (
    <Link data-fila href={'/insumos/oportunidades/' + o.id} className="tarjeta insumo-card">
      {o.numero != null && <div className="muted" style={{ fontSize: '.72rem', marginBottom: 2 }}>OF-{String(o.numero).padStart(5, '0')}</div>}
      <div className="fila" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span className="insignia">{o.clase ? (ETIQUETA_CLASE_OFERTA[o.clase] ?? o.clase) : (ETIQUETA_TIPO_OFERTA[o.tipo_oferta] ?? o.tipo_oferta)}</span>
        {o.tipo_oferta === 'dinero' && o.monto_estimado != null && <span className="muted" style={{ fontSize: '.8rem' }}>≈ {o.monto_estimado}</span>}
      </div>
      <strong style={{ display: 'block', margin: '6px 0 2px' }}>{o.organizacion}</strong>
      {(o.origen || o.tipo_oferta) && (
        <div className="muted" style={{ fontSize: '.78rem', marginBottom: 4 }}>
          {[o.origen ? (ETIQUETA_ORIGEN_OFERTA[o.origen] ?? o.origen) : null, ETIQUETA_TIPO_OFERTA[o.tipo_oferta] ?? o.tipo_oferta].filter(Boolean).join(' · ')}
        </div>
      )}
      <Pill tono={tonoDeClase(claseEstadoVerif(o.estado_verificacion))} punto={false}>{ETIQUETA_ESTADO_VERIF[o.estado_verificacion] ?? o.estado_verificacion}</Pill>
      {(o.cubre_tipos ?? []).length > 0 && (
        <div className="fila" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {(o.cubre_tipos as string[]).map((t) => <span key={t} className="insignia" style={{ fontSize: '.72rem' }}>{ETIQUETA_TIPO_INSUMO[t] ?? t}</span>)}
        </div>
      )}
      {o.ubicacion && <div className="muted fila" style={{ gap: 4, fontSize: '.8rem', marginTop: 4 }}><Icono nombre="ubicacion" size={13} /> {o.ubicacion}</div>}
    </Link>
  );
}
