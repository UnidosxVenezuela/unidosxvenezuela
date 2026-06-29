import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { etiquetaArea, hrefSeguro, ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, clasePrioridad, claseEstado, RANGO_PRIORIDAD } from '@/lib/constantes';
import Icono from '@/components/Icono';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import BotonConfirmar from '@/components/BotonConfirmar';
import FijarAnuncio from './FijarAnuncio';
import { agregarMiembro, quitarMiembro, asignarLider, guardarWhatsappGrupo, programarReunion, desfijarMensaje, banearMiembro, desbanearMiembro } from '../actions';

export default async function GrupoDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const grupoId = params.id;

  const { data: grupo } = await supabase.from('grupos')
    .select('id, nombre, area, descripcion, lider_id, whatsapp').eq('id', grupoId).single();

  if (!grupo) {
    return <div className="tarjeta"><h2>Grupo no encontrado</h2><Link href="/grupos">Volver</Link></div>;
  }

  const [{ data: miembrosRaw }, { data: reunionesRaw }, { data: todosPerfiles }, { data: fijadosRaw }, { data: tareasRaw }, { data: baneadosRaw }] = await Promise.all([
    supabase.from('miembros_grupo')
      .select('perfil_id, rol_en_grupo, perfiles(nombre_completo, rol)').eq('grupo_id', grupoId),
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

  const puedeGestionar = esCoordinacion(perfil?.rol) || grupo.lider_id === user!.id;
  const idsMiembros = new Set(miembros.map((m) => m.perfil_id));
  const idsBaneados = new Set(baneados.map((b) => b.perfil_id));
  const candidatos = (todosPerfiles ?? []).filter((p: any) => !idsMiembros.has(p.id) && !idsBaneados.has(p.id));
  const waHref = hrefSeguro(grupo.whatsapp);
  const ahora = Date.now();

  // URLs firmadas de los adjuntos (bucket privado).
  const firmas = new Map<string, string | null>();
  await Promise.all(fijados.filter((m) => m.adjunto_path).map(async (m) => {
    const { data } = await supabase.storage.from('grupos').createSignedUrl(m.adjunto_path, 3600);
    firmas.set(m.id, data?.signedUrl ?? null);
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
        <span className="insignia">{etiquetaArea(grupo.area)}</span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>{grupo.descripcion || 'Sin descripción'}</p>
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

      <div className={puedeGestionar ? 'grupo-grid' : undefined} style={{ marginTop: 16 }}>
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
                  m.adjunto_tipo === 'imagen'
                    ? <a href={firma} target="_blank" rel="noopener noreferrer"><img className="anuncio-img" src={firma} alt={m.adjunto_nombre || 'imagen'} /></a>
                    : <a className="adjunto-chip" href={firma} target="_blank" rel="noopener noreferrer">
                        <Icono nombre="documento" size={18} /> {m.adjunto_nombre || 'Archivo'}
                      </a>
                )}
                <div className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
                  {m.perfiles?.nombre_completo || '—'} · {new Date(m.creado_en).toLocaleString('es-VE')}
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
              <table>
                <thead><tr><th>Tarea</th><th>Prioridad</th><th>Estado</th></tr></thead>
                <tbody>
                  {tareas.map((t) => (
                    <tr key={t.id}>
                      <td><Link href={'/tareas/' + t.id}>{t.titulo}</Link></td>
                      <td><span className={'insignia ' + clasePrioridad(t.prioridad)}>{ETIQUETA_PRIORIDAD[t.prioridad as keyof typeof ETIQUETA_PRIORIDAD] ?? t.prioridad}</span></td>
                      <td><span className={'insignia ' + claseEstado(t.estado)}>{ETIQUETA_ESTADO[t.estado as keyof typeof ETIQUETA_ESTADO] ?? t.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="fila" style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <Link className="muted" href={'/tareas?grupo=' + grupoId}>Ver todas →</Link>
              {puedeGestionar && <Link className="btn" href="/tareas/nueva"><Icono nombre="mas" size={16} /> Nueva tarea</Link>}
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
                      {new Date(r.inicio).toLocaleString('es-VE')} · {r.duracion_min} min
                      {activa && <span className="insignia ok" style={{ marginLeft: 8 }}>En curso</span>}
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
            <table>
              <thead><tr><th>Nombre</th><th>En grupo</th>{puedeGestionar && <th></th>}</tr></thead>
              <tbody>
                {miembros.map((m) => (
                  <tr key={m.perfil_id}>
                    <td>
                      {m.perfiles?.nombre_completo || '—'}
                      {grupo.lider_id === m.perfil_id && <span className="insignia ok" style={{ marginLeft: 8 }}>Líder</span>}
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
                      </td>
                    )}
                  </tr>
                ))}
                {miembros.length === 0 && <tr><td colSpan={3} className="muted">Sin miembros todavía.</td></tr>}
              </tbody>
            </table>
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

        {/* ── Columna derecha: gestión (líder/coordinación) ── */}
        {puedeGestionar && (
          <aside className="grupo-aside">
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="tablon" size={16} /> Fijar anuncio</h3>
              <FijarAnuncio grupoId={grupoId} />
            </div>

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
          </aside>
        )}
      </div>
    </div>
  );
}
