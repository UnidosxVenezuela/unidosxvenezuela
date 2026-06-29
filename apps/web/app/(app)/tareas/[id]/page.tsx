import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ESTADOS, PRIORIDADES, ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD,
  claseEstado, clasePrioridad, ETIQUETA_TIPO_ADJUNTO, iconoAdjunto, hrefSeguro,
} from '@/lib/constantes';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Icono from '@/components/Icono';
import SubirAdjunto from './SubirAdjunto';
import BotonConfirmar from '@/components/BotonConfirmar';
import { cambiarEstado, actualizarAsignacion, agregarComentario, agregarEnlace, eliminarAdjunto, tomarTarea, liberarTarea } from '../actions';

export default async function TareaDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const id = params.id;

  const { data: tarea } = await supabase.from('tareas').select(
    `id, titulo, descripcion, estado, prioridad, vence_en, lat, lng, grupo_id, asignado_a, cupo, creado_por,
     grupos ( nombre, lider_id ),
     asignado:perfiles!tareas_asignado_a_fkey ( nombre_completo ),
     creador:perfiles!tareas_creado_por_fkey ( nombre_completo )`
  ).eq('id', id).single() as any;

  if (!tarea) {
    return <div className="tarjeta"><h2>Tarea no encontrada</h2><Link href="/tareas">Volver</Link></div>;
  }

  const [{ data: comentarios }, { data: perfiles }, { data: adjuntos }, { data: personasData }] = await Promise.all([
    supabase.from('comentarios_tarea')
      .select('id, contenido, creado_en, autor:perfiles ( nombre_completo )')
      .eq('tarea_id', id).order('creado_en', { ascending: true }),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('adjuntos_tarea')
      .select('id, tipo, clase, url, nombre, mime, creado_por, creado_en')
      .eq('tarea_id', id).order('creado_en', { ascending: true }),
    supabase.from('tarea_personas')
      .select('perfil_id, unido_en, perfiles ( nombre_completo )')
      .eq('tarea_id', id).order('unido_en', { ascending: true }),
  ]);
  const personas = (personasData ?? []) as any[];
  const cupo: number | null = tarea.cupo ?? null;
  const ocupados = personas.length;
  const lleno = ocupados >= (cupo ?? 1);
  const soyParticipante = personas.some((p) => p.perfil_id === user!.id);

  // Firmar URLs de archivos (bucket privado); los enlaces se revalidan en render.
  const adjuntosConUrl = await Promise.all((adjuntos ?? []).map(async (a: any) => {
    if (a.tipo === 'enlace') return { ...a, href: hrefSeguro(a.url) };
    const { data: firma } = await supabase.storage.from('adjuntos').createSignedUrl(a.url, 3600);
    return { ...a, href: firma?.signedUrl ?? null };
  }));

  const puedeEditar =
    esCoordinacion(perfil?.rol) ||
    tarea.asignado_a === user!.id ||
    tarea.creado_por === user!.id ||
    tarea.grupos?.lider_id === user!.id;
  const puedeParticipar = perfil?.rol !== 'observador';

  return (
    <div>
      <RealtimeRefrescar tabla="tareas" filtro={'id=eq.' + id} />
      <RealtimeRefrescar tabla="comentarios_tarea" filtro={'tarea_id=eq.' + id} />
      <RealtimeRefrescar tabla="adjuntos_tarea" filtro={'tarea_id=eq.' + id} />

      <Link href="/tareas" className="muted">← Tareas</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <h1 style={{ margin: 0 }}>{tarea.titulo}</h1>
        <span className={'insignia ' + claseEstado(tarea.estado)}>{ETIQUETA_ESTADO[tarea.estado as keyof typeof ETIQUETA_ESTADO]}</span>
      </div>

      <div className="tarjeta">
        <p>{tarea.descripcion || <span className="muted">Sin descripción</span>}</p>
        <div className="grid grid-2">
          <div><strong>Prioridad:</strong> <span className={'insignia ' + clasePrioridad(tarea.prioridad)}>{ETIQUETA_PRIORIDAD[tarea.prioridad as keyof typeof ETIQUETA_PRIORIDAD]}</span></div>
          <div><strong>Grupo:</strong> {tarea.grupos?.nombre ?? '—'}</div>
          <div><strong>Asignado a:</strong> {tarea.asignado?.nombre_completo ?? 'Sin asignar'}</div>
          <div><strong>Creada por:</strong> {tarea.creador?.nombre_completo ?? '—'}</div>
          <div><strong>Vence:</strong> {tarea.vence_en ? new Date(tarea.vence_en).toLocaleString('es-VE') : '—'}</div>
          <div><strong>Ubicación:</strong> {tarea.lat != null && tarea.lng != null ? tarea.lat + ', ' + tarea.lng : '—'}</div>
        </div>
      </div>

      {/* Personas (cupo) */}
      <div className="tarjeta">
        <div className="fila" style={{ justifyContent: 'space-between' }}>
          <strong className="fila" style={{ gap: 6 }}>
            <Icono nombre="grupos" size={18} /> Personas {cupo ? `${ocupados}/${cupo}` : ocupados}
          </strong>
          {puedeParticipar && (
            soyParticipante ? (
              <form action={liberarTarea}>
                <input type="hidden" name="tarea_id" value={id} />
                <button className="btn" style={{ minHeight: 34, padding: '4px 12px' }}>Salir</button>
              </form>
            ) : lleno ? (
              <span className="insignia">Cupo completo</span>
            ) : (
              <form action={tomarTarea}>
                <input type="hidden" name="tarea_id" value={id} />
                <button className="btn btn-acento" style={{ minHeight: 34, padding: '4px 12px' }}><Icono nombre="ok" size={16} /> Unirme</button>
              </form>
            )
          )}
        </div>
        {personas.length === 0 ? (
          <p className="muted" style={{ margin: '8px 0 0' }}>Nadie se ha unido todavía.</p>
        ) : (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {personas.map((p) => (
              <li key={p.perfil_id}>
                {p.perfiles?.nombre_completo || '—'}
                {tarea.asignado_a === p.perfil_id && <span className="insignia ok" style={{ marginLeft: 8 }}>Responsable</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {puedeEditar && (
        <div className="grid grid-2">
          <form action={cambiarEstado} className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Cambiar estado</h2>
            <input type="hidden" name="tarea_id" value={id} />
            <div className="campo">
              <select name="estado" className="input" defaultValue={tarea.estado}>
                {ESTADOS.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
              </select>
            </div>
            <button className="btn btn-primario" type="submit">Guardar estado</button>
          </form>

          <form action={actualizarAsignacion} className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Asignación y prioridad</h2>
            <input type="hidden" name="tarea_id" value={id} />
            <div className="campo">
              <label>Asignar a</label>
              <select name="asignado_a" className="input" defaultValue={tarea.asignado_a ?? ''}>
                <option value="">Sin asignar</option>
                {(perfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Prioridad</label>
              <select name="prioridad" className="input" defaultValue={tarea.prioridad}>
                {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
              </select>
            </div>
            <button className="btn btn-primario" type="submit">Guardar</button>
          </form>
        </div>
      )}

      {/* Material de la tarea — insumos que aporta quien crea/coordina */}
      <h2 className="fila" style={{ gap: 6 }}><Icono nombre="documento" size={20} /> Material de la tarea</h2>
      <div className="tarjeta">
        {adjuntosConUrl.filter((a: any) => a.clase !== 'entregable').length === 0 && <p className="muted">Sin material adjunto.</p>}
        {adjuntosConUrl.filter((a: any) => a.clase !== 'entregable').map((a: any) => (
          <div key={a.id} className="fila" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--borde)', padding: '8px 0' }}>
            <span className="fila" style={{ gap: 8 }}>
              <Icono nombre={iconoAdjunto(a.tipo)} size={18} />
              {a.href ? <a href={a.href} target="_blank" rel="noopener noreferrer">{a.nombre}</a> : <span>{a.nombre}</span>}
              <span className="muted" style={{ fontSize: '.8rem' }}>{ETIQUETA_TIPO_ADJUNTO[a.tipo as keyof typeof ETIQUETA_TIPO_ADJUNTO]}</span>
            </span>
            {(a.creado_por === user!.id || esCoordinacion(perfil?.rol)) && (
              <form action={eliminarAdjunto}>
                <input type="hidden" name="tarea_id" value={id} />
                <input type="hidden" name="adjunto_id" value={a.id} />
                <BotonConfirmar mensaje={'¿Eliminar "' + a.nombre + '"?'} className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Eliminar"><Icono nombre="basura" size={16} /></BotonConfirmar>
              </form>
            )}
          </div>
        ))}
        {puedeEditar && (
          <div style={{ marginTop: 12 }}>
            <SubirAdjunto tareaId={id} clase="material" etiqueta="Subir material" />
            <form action={agregarEnlace} className="fila" style={{ marginTop: 10 }}>
              <input type="hidden" name="tarea_id" value={id} />
              <input type="hidden" name="clase" value="material" />
              <input name="url" className="input" type="url" placeholder="https://… (enlace al material)" required style={{ maxWidth: 360 }} />
              <input name="nombre" className="input" placeholder="Nombre (opcional)" style={{ maxWidth: 200 }} />
              <button className="btn"><Icono nombre="enlace" size={16} /> Agregar enlace</button>
            </form>
          </div>
        )}
      </div>

      {/* Entregables — lo que sube la persona asignada */}
      <h2 className="fila" style={{ gap: 6 }}><Icono nombre="ok" size={20} /> Entregables</h2>
      <div className="tarjeta">
        {adjuntosConUrl.filter((a: any) => a.clase === 'entregable').length === 0 && <p className="muted">Aún no hay entregables.</p>}
        {adjuntosConUrl.filter((a: any) => a.clase === 'entregable').map((a: any) => (
          <div key={a.id} className="fila" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--borde)', padding: '8px 0' }}>
            <span className="fila" style={{ gap: 8 }}>
              <Icono nombre={iconoAdjunto(a.tipo)} size={18} />
              {a.href ? <a href={a.href} target="_blank" rel="noopener noreferrer">{a.nombre}</a> : <span>{a.nombre}</span>}
              <span className="muted" style={{ fontSize: '.8rem' }}>{ETIQUETA_TIPO_ADJUNTO[a.tipo as keyof typeof ETIQUETA_TIPO_ADJUNTO]}</span>
            </span>
            {(a.creado_por === user!.id || esCoordinacion(perfil?.rol)) && (
              <form action={eliminarAdjunto}>
                <input type="hidden" name="tarea_id" value={id} />
                <input type="hidden" name="adjunto_id" value={a.id} />
                <BotonConfirmar mensaje={'¿Eliminar "' + a.nombre + '"?'} className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Eliminar"><Icono nombre="basura" size={16} /></BotonConfirmar>
              </form>
            )}
          </div>
        ))}
        {puedeParticipar && (soyParticipante || puedeEditar) ? (
          <div style={{ marginTop: 12 }}>
            <SubirAdjunto tareaId={id} clase="entregable" etiqueta="Subir entregable" />
            <form action={agregarEnlace} className="fila" style={{ marginTop: 10 }}>
              <input type="hidden" name="tarea_id" value={id} />
              <input type="hidden" name="clase" value="entregable" />
              <input name="url" className="input" type="url" placeholder="https://… (enlace al entregable)" required style={{ maxWidth: 360 }} />
              <input name="nombre" className="input" placeholder="Nombre (opcional)" style={{ maxWidth: 200 }} />
              <button className="btn"><Icono nombre="enlace" size={16} /> Guardar enlace</button>
            </form>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 8, fontSize: '.85rem' }}>Solo las personas asignadas a la tarea pueden subir entregables.</p>
        )}
      </div>

      <h2>Comentarios ({(comentarios ?? []).length})</h2>
      <div className="tarjeta">
        {(comentarios ?? []).map((c: any) => (
          <div key={c.id} style={{ borderBottom: '1px solid var(--borde)', padding: '8px 0' }}>
            <div className="muted" style={{ fontSize: '.85rem' }}>
              {c.autor?.nombre_completo ?? 'Anónimo'} · {new Date(c.creado_en).toLocaleString('es-VE')}
            </div>
            <div>{c.contenido}</div>
          </div>
        ))}
        {(comentarios ?? []).length === 0 && <p className="muted">Sin comentarios todavía.</p>}

        {puedeParticipar && (
          <form action={agregarComentario} style={{ marginTop: 12 }}>
            <input type="hidden" name="tarea_id" value={id} />
            <div className="campo">
              <textarea name="contenido" className="input" placeholder="Escribe un comentario…" required />
            </div>
            <button className="btn btn-primario" type="submit">Comentar</button>
          </form>
        )}
      </div>
    </div>
  );
}
