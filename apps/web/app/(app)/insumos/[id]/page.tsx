import { fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { nombreMostrado } from '@/lib/nombre';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_INSUMO, claseEstadoInsumo, clasePrioridad, ETIQUETA_PRIORIDAD, siguienteEstadoInsumo, TIPOS_VEHICULO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import { cambiarEstadoSolicitud, asignarProveedorSolicitud, crearEnvio, eliminarEnvio, eliminarSolicitud } from '../actions';

export default async function SolicitudPage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  // Módulo de logística: solo admin/logística (igual que la página principal).
  if (!puedeLogistica(perfil)) redirect('/dashboard');
  const gestor = puedeLogistica(perfil);
  const verFull = esAdministrador(perfil);
  const supabase = await createClient();
  const id = params.id;

  const { data: sData } = await supabase.from('solicitudes_insumo')
    .select('id, titulo, tipo, descripcion, cantidad, urgencia, estado, creado_en, proveedor_id, caso_id, puntos_acopio(nombre), proveedores(nombre, contacto), perfiles(nombre_completo)')
    .eq('id', id).single();
  const s: any = sData;
  if (!s) return <div className="tarjeta"><h2>Solicitud no encontrada</h2><Link href="/insumos">Volver a Insumos</Link></div>;

  // Caso de ayuda de origen, si la solicitud fue derivada de un caso (Fase 2). Se
  // obtiene por RPC curada (Logística no lee casos por RLS).
  let origen: { numero: number; titulo: string } | null = null;
  if (s.caso_id) {
    const { data: co } = await supabase.rpc('caso_de_solicitud', { p_caso: s.caso_id });
    origen = ((co as any[]) ?? [])[0] ?? null;
  }

  const [{ data: envios }, { data: proveedores }, { data: perfilesLista }] = await Promise.all([
    supabase.from('envios').select('id, tipo_vehiculo, flete, origen, destino, notas, perfiles!envios_voluntario_id_fkey(nombre_completo)').eq('solicitud_id', id).order('creado_en'),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
  ]);
  const sig = siguienteEstadoInsumo(s.estado);

  return (
    <div>
      <RealtimeRefrescar tabla="envios" filtro={'solicitud_id=eq.' + id} />
      <Link href="/insumos" className="muted">← Insumos</Link>
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
              <div className="fila" style={{ gap: 6, marginTop: 10, padding: '6px 10px', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, fontSize: '.85rem' }}>
                <Icono nombre="ubicacion" size={14} /> Derivado de la solicitud de ayuda del caso <strong style={{ color: 'var(--texto)' }}>#{String(origen.numero).padStart(5, '0')}</strong> — {origen.titulo}
              </div>
            )}
            {s.descripcion && <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{s.descripcion}</p>}
            <div className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>
              {s.puntos_acopio?.nombre && <div className="fila" style={{ gap: 4 }}><Icono nombre="ubicacion" size={14} /> {s.puntos_acopio.nombre}</div>}
              <div>Solicitado por {nombreMostrado(s.perfiles?.nombre_completo, verFull) || '—'} · {fechaHora(s.creado_en)}</div>
            </div>
          </div>

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
                      e.perfiles?.nombre_completo && ('Conductor: ' + nombreMostrado(e.perfiles.nombre_completo, verFull)),
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
                  <div className="campo"><label>Conductor / voluntario</label>
                    <select name="voluntario_id" className="input" defaultValue="">
                      <option value="">— Sin asignar —</option>
                      {(perfilesLista ?? []).map((p: any) => <option key={p.id} value={p.id}>{nombreMostrado(p.nombre_completo, verFull) || p.id}</option>)}
                    </select>
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
              ) : <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Solicitud entregada ✅</p>}
              {s.estado !== 'cancelado' && s.estado !== 'entregado' && (
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

            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="basura" size={16} /> Eliminar</h3>
              <form action={eliminarSolicitud}>
                <input type="hidden" name="id" value={id} />
                <BotonConfirmar mensaje={'¿Eliminar la solicitud "' + s.titulo + '"? No se puede deshacer.'} className="btn btn-peligro" style={{ width: '100%' }}>Eliminar solicitud</BotonConfirmar>
              </form>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
