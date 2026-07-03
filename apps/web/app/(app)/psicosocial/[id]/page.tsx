import { fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedePsicosocial, esCoordPsicosocial, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { nombreMostrado } from '@/lib/nombre';
import {
  ETIQUETA_TIPO_APOYO, ETIQUETA_ESTADO_ACOMP, claseEstadoAcomp, siguienteEstadoAcomp,
  clasePrioridad, ETIQUETA_PRIORIDAD, PRIORIDADES, TIPOS_CONTACTO_PSICO,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import {
  asignarAcompanamiento, tomarAcompanamiento, cambiarEstadoAcomp, cerrarAcompanamiento,
  actualizarRiesgo, agregarBitacora, eliminarBitacora, eliminarAcompanamiento,
} from '../actions';

export default async function AcompanamientoPage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  // Solo el equipo psicosocial ve un caso. El admin (supervisión) no entra aquí.
  if (!puedePsicosocial(perfil)) redirect('/psicosocial');
  const supabase = await createClient();
  const id = params.id;

  const { data: cData } = await supabase.from('acompanamientos')
    .select('id, numero, persona, contacto, tipo, motivo, riesgo, estado, asignado_a, notas_cierre, creado_en, cerrado_en, asignado:perfiles!acompanamientos_asignado_a_fkey(nombre_completo), creador:perfiles!acompanamientos_creado_por_fkey(nombre_completo)')
    .eq('id', id).single();
  const c: any = cData;
  if (!c) return <div className="tarjeta"><h2>Caso no encontrado</h2><p className="muted">No existe o no tienes acceso a este acompañamiento confidencial.</p><Link href="/psicosocial">← Apoyo Psicosocial</Link></div>;

  const coord = esCoordPsicosocial(perfil);
  const esAsignado = c.asignado_a === user!.id;
  const puedeAtender = coord || esAsignado;         // ve bitácora, anota, gestiona
  const cerrado = c.estado === 'cerrado' || c.estado === 'cancelado';
  const sig = siguienteEstadoAcomp(c.estado);

  // Bitácora + equipo (solo para quien atiende).
  let bitacora: any[] = [];
  let equipo: any[] = [];
  if (puedeAtender) {
    const [{ data: b }, { data: eq }] = await Promise.all([
      supabase.from('bitacora_psicosocial')
        .select('id, contenido, tipo_contacto, creado_en, perfiles(nombre_completo)')
        .eq('acompanamiento_id', id).order('creado_en', { ascending: false }),
      coord ? supabase.rpc('profesionales_psicosocial') : Promise.resolve({ data: [] as any[] }),
    ]);
    bitacora = (b ?? []) as any[];
    equipo = (eq ?? []) as any[];
  }

  return (
    <div>
      <RealtimeRefrescar tabla="bitacora_psicosocial" filtro={'acompanamiento_id=eq.' + id} />
      <Link href="/psicosocial" className="muted">← Apoyo Psicosocial</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }} className="fila">
          <span className="insignia" style={{ marginRight: 8 }}>PS-{c.numero}</span> {c.persona}
        </h1>
        <span className="fila" style={{ gap: 6 }}>
          <Pill tono={tonoDeClase(clasePrioridad(c.riesgo))} punto={false}>Riesgo {ETIQUETA_PRIORIDAD[c.riesgo as keyof typeof ETIQUETA_PRIORIDAD] ?? c.riesgo}</Pill>
          <Pill tono={tonoDeClase(claseEstadoAcomp(c.estado))}>{ETIQUETA_ESTADO_ACOMP[c.estado as keyof typeof ETIQUETA_ESTADO_ACOMP] ?? c.estado}</Pill>
        </span>
      </div>

      <div className={puedeAtender ? 'grupo-grid' : undefined} style={{ marginTop: 16 }}>
        <div className="grupo-main">
          <div className="tarjeta">
            <div className="fila" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="insignia">{ETIQUETA_TIPO_APOYO[c.tipo as keyof typeof ETIQUETA_TIPO_APOYO] ?? c.tipo}</span>
              {c.contacto && <span className="muted fila" style={{ gap: 4 }}><Icono nombre="whatsapp" size={14} /> {c.contacto}</span>}
            </div>
            {c.motivo && <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{c.motivo}</p>}
            <div className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>
              Registrado por {nombreMostrado(c.creador?.nombre_completo, esAdministrador(perfil)) || '—'} · {fechaHora(c.creado_en)}
              {c.asignado?.nombre_completo && <> · Atiende: <strong style={{ color: 'var(--texto)' }}>{nombreMostrado(c.asignado.nombre_completo, esAdministrador(perfil))}</strong></>}
            </div>
            {c.estado === 'cerrado' && c.notas_cierre && (
              <div className="tarjeta" style={{ marginTop: 12, background: '#f0fdf4' }}>
                <strong className="fila" style={{ gap: 6 }}><Icono nombre="ok" size={16} /> Cierre</strong>
                <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{c.notas_cierre}</p>
              </div>
            )}
          </div>

          {puedeAtender ? (
            <>
              <h2 className="fila" style={{ gap: 6 }}><Icono nombre="documento" size={20} /> Bitácora confidencial</h2>
              <p className="muted" style={{ fontSize: '.82rem', marginTop: -6 }}>
                Notas de acompañamiento. Solo las ven el profesional asignado y la coordinación psicosocial.
              </p>

              {!cerrado && (
                <div className="tarjeta">
                  <form action={agregarBitacora}>
                    <input type="hidden" name="acompanamiento_id" value={id} />
                    <div className="campo">
                      <label htmlFor="contenido">Nueva nota</label>
                      <textarea id="contenido" name="contenido" className="input" rows={3} required
                        placeholder="Qué se conversó, cómo está la persona, acuerdos y próximos pasos…" />
                    </div>
                    <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <select name="tipo_contacto" className="input" defaultValue="" style={{ maxWidth: 200 }}>
                        <option value="">Tipo de contacto…</option>
                        {TIPOS_CONTACTO_PSICO.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button className="btn btn-primario" type="submit"><Icono nombre="mas" size={16} /> Guardar nota</button>
                    </div>
                  </form>
                </div>
              )}

              {bitacora.length === 0 ? (
                <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Aún no hay notas en la bitácora.</p></div>
              ) : bitacora.map((n) => (
                <div key={n.id} className="tarjeta">
                  <div className="fila" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <div className="muted" style={{ fontSize: '.82rem' }}>
                      {n.tipo_contacto && <span className="insignia" style={{ marginRight: 6 }}>{n.tipo_contacto}</span>}
                      {nombreMostrado(n.perfiles?.nombre_completo, esAdministrador(perfil)) || '—'} · {fechaHora(n.creado_en)}
                    </div>
                    <form action={eliminarBitacora}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="acompanamiento_id" value={id} />
                      <BotonConfirmar mensaje="¿Eliminar esta nota de la bitácora?" className="btn btn-peligro" style={{ minHeight: 30, padding: '2px 8px' }}><Icono nombre="basura" size={14} /></BotonConfirmar>
                    </form>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{n.contenido}</p>
                </div>
              ))}
            </>
          ) : (
            <div className="tarjeta">
              <strong className="fila" style={{ gap: 6 }}><Icono nombre="admin" size={18} /> Caso confidencial</strong>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                Registraste esta solicitud y puedes ver su estado. Por confidencialidad, las notas
                de acompañamiento solo las ven el profesional asignado y la coordinación psicosocial.
              </p>
            </div>
          )}
        </div>

        {puedeAtender && (
          <aside className="grupo-aside">
            {/* Estado / avance */}
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="flecha" size={16} /> Estado</h3>
              {cerrado ? (
                <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>{c.estado === 'cerrado' ? 'Caso cerrado ✅' : 'Caso cancelado.'}</p>
              ) : (
                <>
                  {sig && sig !== 'cerrado' && (
                    <form action={cambiarEstadoAcomp}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="estado" value={sig} />
                      <button className="btn btn-primario" style={{ width: '100%' }}>Avanzar a «{ETIQUETA_ESTADO_ACOMP[sig] ?? sig}»</button>
                    </form>
                  )}
                  <form action={cerrarAcompanamiento} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={id} />
                    <div className="campo" style={{ marginBottom: 6 }}>
                      <label htmlFor="notas_cierre" style={{ fontSize: '.82rem' }}>Nota de cierre (opcional)</label>
                      <textarea id="notas_cierre" name="notas_cierre" className="input" rows={2} placeholder="Resultado del acompañamiento…" />
                    </div>
                    <BotonConfirmar mensaje="¿Cerrar este acompañamiento?" className="btn" style={{ width: '100%' }}><Icono nombre="ok" size={15} /> Cerrar caso</BotonConfirmar>
                  </form>
                  <form action={cambiarEstadoAcomp} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="estado" value="cancelado" />
                    <BotonConfirmar mensaje="¿Cancelar este caso?" className="btn" style={{ width: '100%' }}>Cancelar caso</BotonConfirmar>
                  </form>
                </>
              )}
            </div>

            {/* Riesgo */}
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="avisos" size={16} /> Nivel de riesgo</h3>
              <form action={actualizarRiesgo}>
                <input type="hidden" name="id" value={id} />
                <select name="riesgo" className="input" defaultValue={c.riesgo} style={{ width: '100%' }}>
                  {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
                </select>
                <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Guardar</button>
              </form>
            </div>

            {/* Asignación */}
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Profesional</h3>
              {coord ? (
                <form action={asignarAcompanamiento}>
                  <input type="hidden" name="id" value={id} />
                  <select name="asignado_a" className="input" defaultValue={c.asignado_a ?? ''} style={{ width: '100%' }}>
                    <option value="">— Sin asignar —</option>
                    {equipo.map((p: any) => <option key={p.id} value={p.id}>{p.nombre || p.id}</option>)}
                  </select>
                  <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Asignar</button>
                </form>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Este caso está asignado a ti.</p>
              )}
            </div>

            {/* Eliminar (solo coordinación psicosocial) */}
            {coord && (
              <div className="tarjeta">
                <h3 className="aside-titulo"><Icono nombre="basura" size={16} /> Eliminar</h3>
                <form action={eliminarAcompanamiento}>
                  <input type="hidden" name="id" value={id} />
                  <BotonConfirmar mensaje={'¿Eliminar el caso PS-' + c.numero + '? Se borrará también su bitácora. No se puede deshacer.'} className="btn btn-peligro" style={{ width: '100%' }}>Eliminar caso</BotonConfirmar>
                </form>
              </div>
            )}
          </aside>
        )}

        {/* Profesional no asignado viendo un caso sin asignar: puede tomarlo. */}
        {!puedeAtender && !c.asignado_a && puedePsicosocial(perfil) && (
          <div className="tarjeta">
            <form action={tomarAcompanamiento}>
              <input type="hidden" name="id" value={id} />
              <button className="btn btn-primario" type="submit" style={{ width: '100%' }}><Icono nombre="ok" size={16} /> Tomar este caso</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
