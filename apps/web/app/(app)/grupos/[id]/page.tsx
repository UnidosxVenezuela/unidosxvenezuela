import { fechaHora } from '@/lib/fechas';
import { urlFirmada } from '@/lib/storage';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esCoordinacion, esAdministrador, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { etiquetaArea, hrefSeguro, ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, ETIQUETA_ROL, ROLES_CADENA_CONTENIDO, clasePrioridad, claseEstado, RANGO_PRIORIDAD } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import Icono from '@/components/Icono';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import BotonConfirmar from '@/components/BotonConfirmar';
import Pill, { tonoDeClase } from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import Avatar from '@/components/Avatar';
import FijarAnuncio from './FijarAnuncio';
import { agregarMiembro, quitarMiembro, asignarLider, guardarWhatsappGrupo, programarReunion, desfijarMensaje, banearMiembro, desbanearMiembro, cambiarVisibilidadGrupo, asignarRolesContenido, eliminarGrupo } from '../actions';

export default async function GrupoDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const grupoId = params.id;

  const { data: grupo } = await supabase.from('grupos')
    .select('id, nombre, area, descripcion, lider_id, whatsapp, abierto').eq('id', grupoId).single();

  if (!grupo) {
    return <div className="tarjeta"><h2>Grupo no encontrado</h2><Link href="/grupos">Volver</Link></div>;
  }

  const [{ data: miembrosRaw }, { data: reunionesRaw }, { data: todosPerfiles }, { data: fijadosRaw }, { data: tareasRaw }, { data: baneadosRaw }] = await Promise.all([
    supabase.from('miembros_grupo')
      .select('perfil_id, rol_en_grupo, perfiles(nombre_completo, rol, avatar_url, roles_extra)').eq('grupo_id', grupoId),
    supabase.from('reuniones')
      .select('id, titulo, inicio, duracion_min').eq('grupo_id', grupoId)
      .order('inicio', { ascending: false }),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('mensajes_fijados')
      .select('id, contenido, creado_en, adjunto_path, adjunto_tipo, adjunto_nombre, perfiles(nombre_completo)')
      .eq('grupo_id', grupoId).order('creado_en', { ascending: false }),
    supabase.from('tareas')
      .select('id, titulo, estado, prioridad').eq('grupo_id', grupoId)
      .not('estado', 'in', '(completada,cancelada)'),
    supabase.from('miembros_baneados')
      .select('perfil_id, perfiles(nombre_completo)').eq('grupo_id', grupoId),
  ]);
  const miembros = (miembrosRaw ?? []) as any[];
  const reuniones = (reunionesRaw ?? []) as any[];
  const fijados = (fijadosRaw ?? []) as any[];
  const baneados = (baneadosRaw ?? []) as any[];
  // Solo pendientes por completar, ordenadas por prioridad (crítica primero).
  const tareas = ((tareasRaw ?? []) as any[])
    .sort((a, b) => RANGO_PRIORIDAD[a.prioridad as keyof typeof RANGO_PRIORIDAD] - RANGO_PRIORIDAD[b.prioridad as keyof typeof RANGO_PRIORIDAD]);

  const puedeGestionar = esCoordinacion(perfil) || grupo.lider_id === user!.id;
  const soyMiembro = miembros.some((m) => m.perfil_id === user!.id);
  // El coordinador (miembro) publica en su grupo: tareas y anuncios fijados,
  // sin gestionar miembros ni el grupo. La RLS (0056) lo hace cumplir.
  const puedePublicar = puedeGestionar || (soyMiembro && rolesDe(perfil).includes('coordinador'));

  // Privacidad del grupo: quien NO es miembro (ni coordinación/líder) no entra al
  // detalle ni ve el WhatsApp. Para grupos abiertos, primero debe unirse desde la
  // lista. La RLS restringe además a nivel de datos.
  if (!soyMiembro && !puedeGestionar) {
    redirect('/grupos?ok=' + encodeURIComponent('Únete al grupo para ver su información y su WhatsApp.'));
  }
  // ¿A quién puede un líder sumar al flujo de contenido? A voluntarios (no a
  // otros mandos) o a sí mismo. La autorización real la impone la RLS/función.
  const MANDOS: Rol[] = ['admin', 'coordinador', 'lider_grupo', 'lider_plataforma_aliada'];
  const esAsignable = (m: any) =>
    m.perfil_id === user!.id ||
    (!MANDOS.includes(m.perfiles?.rol) && !((m.perfiles?.roles_extra ?? []) as Rol[]).some((r) => MANDOS.includes(r)));
  const idsMiembros = new Set(miembros.map((m) => m.perfil_id));
  const idsBaneados = new Set(baneados.map((b) => b.perfil_id));
  const candidatos = (todosPerfiles ?? []).filter((p: any) => !idsMiembros.has(p.id) && !idsBaneados.has(p.id));
  const liderNombre = (todosPerfiles ?? []).find((p: any) => p.id === grupo.lider_id)?.nombre_completo;
  const waHref = hrefSeguro(grupo.whatsapp);
  const ahora = Date.now();

  // URLs firmadas de los adjuntos (bucket privado).
  const firmas = new Map<string, string | null>();
  await Promise.all(fijados.filter((m) => m.adjunto_path).map(async (m) => {
    firmas.set(m.id, await urlFirmada(supabase, 'grupos', m.adjunto_path, 3600));
  }));

  // El enlace de videollamada solo se trae (vía RPC) si la reunión está activa ahora.
  const activas = reuniones.filter((r) => {
    const ini = new Date(r.inicio).getTime();
    return ahora >= ini && ahora <= ini + r.duracion_min * 60000;
  });
  const enlaces = new Map<string, string | null>();
  await Promise.all(activas.map(async (r) => {
    const { data: enl } = await supabase.rpc('enlace_reunion_si_activa', { p_reunion: r.id });
    enlaces.set(r.id, hrefSeguro(enl as string | null));
  }));

  return (
    <div>
      <RealtimeRefrescar tabla="reuniones" filtro={'grupo_id=eq.' + grupoId} />
      <RealtimeRefrescar tabla="mensajes_fijados" filtro={'grupo_id=eq.' + grupoId} />
      <Link href="/grupos" className="muted">← Grupos</Link>

      {/* Cabecera */}
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <h1 style={{ margin: 0 }}>{grupo.nombre}</h1>
        <span className="fila" style={{ gap: 6 }}>
          {!grupo.abierto && <Pill tono="aviso" punto={false}>Privado</Pill>}
          <BadgeCategoria>{etiquetaArea(grupo.area)}</BadgeCategoria>
        </span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>{grupo.descripcion || 'Sin descripción'}</p>
      <div className="fila muted" style={{ gap: 5, marginTop: 4, fontSize: '.9rem' }}>
        <Icono nombre="usuario" size={15} />
        {grupo.lider_id
          ? <>Líder del grupo: <strong style={{ color: 'var(--texto)' }}>{liderNombre || '—'}</strong></>
          : <span>Sin líder asignado</span>}
      </div>
      <div className="fila" style={{ marginTop: 4 }}>
        {waHref && (
          <a className="btn btn-acento" href={waHref} target="_blank" rel="noopener noreferrer">
            <Icono nombre="whatsapp" /> WhatsApp del grupo
          </a>
        )}
        <Link className="btn" href={'/grupos/' + grupoId + '/pizarra'}>
          <Icono nombre="pizarra" /> Pizarra
        </Link>
      </div>

      {esCoordinacion(perfil) && !soyMiembro && (
        <div className="aviso-superv" role="note">
          <Icono nombre="ojo" size={18} />
          <span>Estás viendo este grupo como <strong>coordinación</strong>: tienes acceso para <strong>supervisar</strong> y gestionar aunque no seas miembro.</span>
        </div>
      )}

      <div className={puedePublicar ? 'grupo-grid' : undefined} style={{ marginTop: 16 }}>
        {/* ── Columna principal: contenido del grupo ── */}
        <div className="grupo-main">
          {/* Anuncios fijados */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="tablon" size={20} /> Anuncios fijados</h2>
          {fijados.length === 0 ? (
            <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Sin anuncios fijados.</p></div>
          ) : fijados.map((m) => {
            const firma = firmas.get(m.id) ?? null;
            return (
              <div key={m.id} className="tarjeta anuncio">
                <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{m.contenido}</div>
                  {puedeGestionar && (
                    <form action={desfijarMensaje}>
                      <input type="hidden" name="grupo_id" value={grupoId} />
                      <input type="hidden" name="mensaje_id" value={m.id} />
                      <BotonConfirmar mensaje="¿Quitar este anuncio fijado?" className="btn btn-peligro" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Quitar anuncio">
                        <Icono nombre="basura" size={15} />
                      </BotonConfirmar>
                    </form>
                  )}
                </div>
                {m.adjunto_path && firma && (
                  <div>
                    {m.adjunto_tipo === 'imagen'
                      ? <a href={firma} target="_blank" rel="noopener noreferrer"><img className="anuncio-img" src={firma} alt={m.adjunto_nombre || 'imagen'} /></a>
                      : <a className="adjunto-chip" href={firma} target="_blank" rel="noopener noreferrer">
                          <Icono nombre="documento" size={18} /> {m.adjunto_nombre || 'Archivo'}
                        </a>}
                    {/* Etiqueta de autoría bajo cada foto/documento compartido */}
                    <div className="muted fila" style={{ gap: 4, fontSize: '.78rem', marginTop: 4 }}>
                      <Icono nombre="usuario" size={12} /> Compartido por <strong style={{ color: 'var(--texto)' }}>{m.perfiles?.nombre_completo || '—'}</strong>
                    </div>
                  </div>
                )}
                <div className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
                  {m.perfiles?.nombre_completo || '—'} · {fechaHora(m.creado_en)}
                </div>
              </div>
            );
          })}

          {/* Tareas del grupo */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="tareas" size={20} /> Tareas del grupo</h2>
          <div className="tarjeta">
            {tareas.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Este grupo no tiene tareas todavía.</p>
            ) : (
              <div className="tabla-scroll"><table>
                <thead><tr><th>Tarea</th><th>Prioridad</th><th>Estado</th></tr></thead>
                <tbody>
                  {tareas.map((t) => (
                    <tr key={t.id}>
                      <td><Link href={'/tareas/' + t.id}>{t.titulo}</Link></td>
                      <td><Pill tono={tonoDeClase(clasePrioridad(t.prioridad))} punto={false}>{ETIQUETA_PRIORIDAD[t.prioridad as keyof typeof ETIQUETA_PRIORIDAD] ?? t.prioridad}</Pill></td>
                      <td><Pill tono={tonoDeClase(claseEstado(t.estado))}>{ETIQUETA_ESTADO[t.estado as keyof typeof ETIQUETA_ESTADO] ?? t.estado}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <div className="fila" style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <Link className="muted" href={'/tareas?grupo=' + grupoId}>Ver todas →</Link>
              {puedePublicar && <Link className="btn" href={'/tareas/nueva?grupo=' + grupoId}><Icono nombre="mas" size={16} /> Nueva tarea</Link>}
            </div>
          </div>

          {/* Videollamadas */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="video" size={20} /> Videollamadas</h2>
          {reuniones.length === 0 ? (
            <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>No hay reuniones programadas.</p></div>
          ) : reuniones.map((r) => {
            const ini = new Date(r.inicio).getTime();
            const activa = ahora >= ini && ahora <= ini + r.duracion_min * 60000;
            const h = enlaces.get(r.id) ?? null;
            return (
              <div key={r.id} className="tarjeta">
                <div className="fila" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{r.titulo}</strong>
                    <div className="muted" style={{ fontSize: '.85rem' }}>
                      {fechaHora(r.inicio)} · {r.duracion_min} min
                      {activa && <span style={{ marginLeft: 8 }}><Pill tono="ok">En curso</Pill></span>}
                    </div>
                  </div>
                  {activa && h
                    ? <a className="btn btn-primario" href={h} target="_blank" rel="noopener noreferrer"><Icono nombre="video" /> Unirse</a>
                    : <button className="btn" disabled style={{ opacity: 0.6 }}><Icono nombre="video" /> Unirse</button>}
                </div>
              </div>
            );
          })}

          {/* Miembros */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="grupos" size={20} /> Miembros ({miembros.length})</h2>
          <div className="tarjeta">
            <div className="tabla-scroll"><table>
              <thead><tr><th>Nombre</th><th>En grupo</th>{puedeGestionar && <th></th>}</tr></thead>
              <tbody>
                {miembros.map((m) => (
                  <tr key={m.perfil_id}>
                    <td>
                      <span className="celda-persona">
                        <Avatar nombre={m.perfiles?.nombre_completo} url={m.perfiles?.avatar_url} size={26} />
                        {m.perfiles?.nombre_completo || '—'}
                        {grupo.lider_id === m.perfil_id && <Pill tono="ok" punto={false}>Líder</Pill>}
                      </span>
                    </td>
                    <td>{m.rol_en_grupo}</td>
                    {puedeGestionar && (
                      <td className="fila">
                        {grupo.lider_id !== m.perfil_id && (
                          <form action={asignarLider}>
                            <input type="hidden" name="grupo_id" value={grupoId} />
                            <input type="hidden" name="perfil_id" value={m.perfil_id} />
                            <button className="btn" style={{ minHeight: 36, padding: '4px 10px' }}>Hacer líder</button>
                          </form>
                        )}
                        <form action={quitarMiembro}>
                          <input type="hidden" name="grupo_id" value={grupoId} />
                          <input type="hidden" name="perfil_id" value={m.perfil_id} />
                          <BotonConfirmar mensaje={'¿Quitar a ' + (m.perfiles?.nombre_completo || 'esta persona') + ' del grupo?'} className="btn btn-peligro" style={{ minHeight: 36, padding: '4px 10px' }}>Quitar</BotonConfirmar>
                        </form>
                        {grupo.lider_id !== m.perfil_id && (
                          <form action={banearMiembro}>
                            <input type="hidden" name="grupo_id" value={grupoId} />
                            <input type="hidden" name="perfil_id" value={m.perfil_id} />
                            <BotonConfirmar mensaje={'¿Vetar a ' + (m.perfiles?.nombre_completo || 'esta persona') + ' del grupo? No podrá volver a unirse hasta que lo desveten.'} className="btn btn-peligro" style={{ minHeight: 36, padding: '4px 10px' }}>Vetar</BotonConfirmar>
                          </form>
                        )}
                        {esAsignable(m) && (
                          <details className="roles-extra" style={{ flexBasis: '100%' }}>
                            <summary>Roles de contenido</summary>
                            <form action={asignarRolesContenido} style={{ marginTop: 8 }}>
                              <input type="hidden" name="grupo_id" value={grupoId} />
                              <input type="hidden" name="perfil_id" value={m.perfil_id} />
                              <div style={{ display: 'grid', gap: 4 }}>
                                {ROLES_CADENA_CONTENIDO.map((r) => (
                                  <label key={r} className="fila" style={{ gap: 6, fontWeight: 500 }}>
                                    <input type="checkbox" name="roles" value={r} defaultChecked={((m.perfiles?.roles_extra ?? []) as string[]).includes(r)} style={{ width: 'auto', minHeight: 0 }} />
                                    {ETIQUETA_ROL[r]}
                                  </label>
                                ))}
                              </div>
                              <button className="btn" style={{ minHeight: 32, padding: '4px 10px', marginTop: 8 }}>Guardar</button>
                            </form>
                          </details>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {miembros.length === 0 && <tr><td colSpan={3} className="muted">Sin miembros todavía.</td></tr>}
              </tbody>
            </table></div>
          </div>

          {puedeGestionar && baneados.length > 0 && (
            <>
              <h2 className="fila" style={{ gap: 6 }}><Icono nombre="usuario" size={20} /> Vetados ({baneados.length})</h2>
              <div className="tarjeta">
                {baneados.map((b) => (
                  <div key={b.perfil_id} className="fila" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--borde)', padding: '8px 0' }}>
                    <span>{b.perfiles?.nombre_completo || '—'}</span>
                    <form action={desbanearMiembro}>
                      <input type="hidden" name="grupo_id" value={grupoId} />
                      <input type="hidden" name="perfil_id" value={b.perfil_id} />
                      <button className="btn" style={{ minHeight: 32, padding: '2px 12px' }}>Quitar veto</button>
                    </form>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Columna derecha: publicar (líder/admin/coordinador) + gestión (líder/admin) ── */}
        {puedePublicar && (
          <aside className="grupo-aside">
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="tablon" size={16} /> Fijar anuncio</h3>
              <FijarAnuncio grupoId={grupoId} />
            </div>

            {puedeGestionar && (<>
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="whatsapp" size={16} /> WhatsApp del grupo</h3>
              <form action={guardarWhatsappGrupo}>
                <input type="hidden" name="grupo_id" value={grupoId} />
                <input name="whatsapp" className="input" type="url" defaultValue={grupo.whatsapp ?? ''}
                  placeholder="https://chat.whatsapp.com/…" style={{ width: '100%' }} />
                <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Guardar</button>
              </form>
            </div>

            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="video" size={16} /> Programar videollamada</h3>
              <form action={programarReunion}>
                <input type="hidden" name="grupo_id" value={grupoId} />
                <div className="campo"><label>Título</label><input name="titulo" className="input" placeholder="Coordinación diaria" required /></div>
                <div className="campo"><label>Enlace (Meet, Zoom…)</label><input name="enlace" className="input" type="url" placeholder="https://meet.google.com/…" required /></div>
                <div className="campo"><label>Inicio</label><input name="inicio" className="input" type="datetime-local" required /></div>
                <div className="campo"><label>Duración (min)</label><input name="duracion_min" className="input" type="number" min={1} max={1440} defaultValue={60} /></div>
                <button className="btn btn-primario" style={{ width: '100%' }}><Icono nombre="video" size={16} /> Programar</button>
              </form>
            </div>

            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="mas" size={16} /> Agregar miembro</h3>
              <form action={agregarMiembro}>
                <input type="hidden" name="grupo_id" value={grupoId} />
                <select name="perfil_id" className="input" required defaultValue="" style={{ width: '100%' }}>
                  <option value="" disabled>Selecciona una persona…</option>
                  {candidatos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
                </select>
                <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Agregar</button>
              </form>
            </div>

            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Líder del grupo</h3>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>
                {grupo.lider_id ? <>Actual: <strong>{liderNombre || '—'}</strong></> : 'Sin líder asignado.'}
              </p>
              <form action={asignarLider}>
                <input type="hidden" name="grupo_id" value={grupoId} />
                <select name="perfil_id" className="input" required defaultValue={grupo.lider_id ?? ''} style={{ width: '100%' }}>
                  <option value="" disabled>Elige a la persona…</option>
                  {(todosPerfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
                </select>
                <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Asignar como líder</button>
              </form>
            </div>

            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="grupos" size={16} /> Visibilidad</h3>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>
                {grupo.abierto ? 'Abierto: cualquiera lo ve y puede unirse.' : 'Privado: solo lo ven sus miembros; alta por invitación.'}
              </p>
              <form action={cambiarVisibilidadGrupo}>
                <input type="hidden" name="grupo_id" value={grupoId} />
                <input type="hidden" name="abierto" value={(!grupo.abierto).toString()} />
                <BotonConfirmar
                  mensaje={grupo.abierto
                    ? '¿Hacer este grupo privado? Dejará de ser visible para quienes no son miembros.'
                    : '¿Hacer este grupo abierto? Cualquiera podrá verlo y unirse.'}
                  className="btn" style={{ width: '100%' }}>
                  {grupo.abierto ? 'Hacer privado' : 'Hacer abierto'}
                </BotonConfirmar>
              </form>
            </div>

            {esAdministrador(perfil) && (
              <div className="tarjeta">
                <h3 className="aside-titulo"><Icono nombre="basura" size={16} /> Eliminar grupo</h3>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>
                  Borra el grupo y su contenido (miembros, anuncios, reuniones, pizarra). Las tareas se conservan sin grupo. No se puede deshacer.
                </p>
                <form action={eliminarGrupo}>
                  <input type="hidden" name="grupo_id" value={grupoId} />
                  <BotonConfirmar
                    mensaje={'¿ELIMINAR el grupo "' + grupo.nombre + '"? Esta acción no se puede deshacer.'}
                    className="btn btn-peligro" style={{ width: '100%' }}>
                    Eliminar grupo
                  </BotonConfirmar>
                </form>
              </div>
            )}
            </>)}
          </aside>
        )}
      </div>
    </div>
  );
}
