import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { etiquetaArea, hrefSeguro } from '@/lib/constantes';
import Icono from '@/components/Icono';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import { agregarMiembro, quitarMiembro, asignarLider, guardarWhatsappGrupo, programarReunion } from '../actions';

export default async function GrupoDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const grupoId = params.id;

  const { data: grupo } = await supabase.from('grupos')
    .select('id, nombre, area, descripcion, lider_id, whatsapp').eq('id', grupoId).single();

  if (!grupo) {
    return <div className="tarjeta"><h2>Grupo no encontrado</h2><Link href="/grupos">Volver</Link></div>;
  }

  const [{ data: miembrosRaw }, { data: reunionesRaw }, { data: todosPerfiles }] = await Promise.all([
    supabase.from('miembros_grupo')
      .select('perfil_id, rol_en_grupo, perfiles(nombre_completo, rol)').eq('grupo_id', grupoId),
    supabase.from('reuniones')
      .select('id, titulo, inicio, duracion_min').eq('grupo_id', grupoId)
      .order('inicio', { ascending: false }),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
  ]);
  const miembros = (miembrosRaw ?? []) as any[];
  const reuniones = (reunionesRaw ?? []) as any[];

  const puedeGestionar = esCoordinacion(perfil?.rol) || grupo.lider_id === user!.id;
  const idsMiembros = new Set(miembros.map((m) => m.perfil_id));
  const candidatos = (todosPerfiles ?? []).filter((p: any) => !idsMiembros.has(p.id));
  const waHref = hrefSeguro(grupo.whatsapp);
  const ahora = Date.now();

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
      <Link href="/grupos" className="muted">← Grupos</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <h1 style={{ margin: 0 }}>{grupo.nombre}</h1>
        <span className="insignia">{etiquetaArea(grupo.area)}</span>
      </div>
      <p className="muted">{grupo.descripcion || 'Sin descripción'}</p>

      {waHref && (
        <a className="btn btn-acento" href={waHref} target="_blank" rel="noopener noreferrer">
          <Icono nombre="whatsapp" /> WhatsApp del grupo
        </a>
      )}

      {/* Reuniones / videollamadas */}
      <h2>Videollamadas</h2>
      {reuniones.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>No hay reuniones programadas.</p></div>
      ) : (
        reuniones.map((r) => {
          const ini = new Date(r.inicio).getTime();
          const fin = ini + r.duracion_min * 60000;
          const activa = ahora >= ini && ahora <= fin;
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
        })
      )}

      {puedeGestionar && (
        <form action={programarReunion} className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Programar videollamada</h3>
          <input type="hidden" name="grupo_id" value={grupoId} />
          <div className="campo"><label>Título</label><input name="titulo" className="input" placeholder="Coordinación diaria" required /></div>
          <div className="campo"><label>Enlace (Google Meet, Zoom…)</label><input name="enlace" className="input" type="url" placeholder="https://meet.google.com/abc-defg-hij" required /></div>
          <div className="grid grid-2">
            <div className="campo"><label>Inicio</label><input name="inicio" className="input" type="datetime-local" required /></div>
            <div className="campo"><label>Duración (min)</label><input name="duracion_min" className="input" type="number" min={1} max={1440} defaultValue={60} /></div>
          </div>
          <button className="btn btn-primario"><Icono nombre="video" /> Programar</button>
        </form>
      )}

      <h2>Miembros ({miembros.length})</h2>
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
                      <button className="btn btn-peligro" style={{ minHeight: 36, padding: '4px 10px' }}>Quitar</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {miembros.length === 0 && <tr><td colSpan={3} className="muted">Sin miembros todavía.</td></tr>}
          </tbody>
        </table>
      </div>

      {puedeGestionar && (
        <>
          <h2>Agregar miembro</h2>
          <form action={agregarMiembro} className="tarjeta fila">
            <input type="hidden" name="grupo_id" value={grupoId} />
            <select name="perfil_id" className="input" required defaultValue="" style={{ maxWidth: 360 }}>
              <option value="" disabled>Selecciona una persona…</option>
              {candidatos.map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
            </select>
            <button className="btn btn-primario" type="submit">Agregar</button>
          </form>

          <h2>WhatsApp del grupo</h2>
          <form action={guardarWhatsappGrupo} className="tarjeta fila">
            <input type="hidden" name="grupo_id" value={grupoId} />
            <input name="whatsapp" className="input" type="url" defaultValue={grupo.whatsapp ?? ''}
              placeholder="https://chat.whatsapp.com/..." style={{ maxWidth: 420 }} />
            <button className="btn btn-primario" type="submit">Guardar</button>
          </form>
        </>
      )}
    </div>
  );
}
