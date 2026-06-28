import Link from 'next/link';
import { requireUsuario, puedeGestionarTareas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, ETIQUETA_CATEGORIA,
  ESTADOS, PRIORIDADES, CATEGORIAS, clasePrioridad, claseEstado,
} from '@/lib/constantes';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Icono from '@/components/Icono';
import { tomarTarea } from './actions';

type SP = { estado?: string; prioridad?: string; grupo?: string; cat?: string; mias?: string };

function Badges({ t }: { t: any }) {
  return (
    <div className="fila" style={{ gap: 6 }}>
      <span className="insignia">{ETIQUETA_CATEGORIA[t.categoria as keyof typeof ETIQUETA_CATEGORIA] ?? t.categoria}</span>
      <span className={'insignia ' + clasePrioridad(t.prioridad)}>{ETIQUETA_PRIORIDAD[t.prioridad as keyof typeof ETIQUETA_PRIORIDAD]}</span>
      <span className={'insignia ' + claseEstado(t.estado)}>{ETIQUETA_ESTADO[t.estado as keyof typeof ETIQUETA_ESTADO]}</span>
    </div>
  );
}

function TablaTareas({ tareas }: { tareas: any[] }) {
  return (
    <div className="tarjeta">
      <table>
        <thead>
          <tr><th>Tarea</th><th>Categoría</th><th>Grupo</th><th>Prioridad</th><th>Estado</th><th>Vence</th></tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <tr key={t.id}>
              <td><Link href={'/tareas/' + t.id}>{t.titulo}</Link></td>
              <td><span className="insignia">{ETIQUETA_CATEGORIA[t.categoria as keyof typeof ETIQUETA_CATEGORIA] ?? t.categoria}</span></td>
              <td>{t.grupos?.nombre ?? '—'}</td>
              <td><span className={'insignia ' + clasePrioridad(t.prioridad)}>{ETIQUETA_PRIORIDAD[t.prioridad as keyof typeof ETIQUETA_PRIORIDAD]}</span></td>
              <td><span className={'insignia ' + claseEstado(t.estado)}>{ETIQUETA_ESTADO[t.estado as keyof typeof ETIQUETA_ESTADO]}</span></td>
              <td>{t.vence_en ? new Date(t.vence_en).toLocaleString('es-VE') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLS = 'id, titulo, descripcion, estado, prioridad, categoria, vence_en, grupo_id, asignado_a, grupos(nombre)';

export default async function TareasPage({ searchParams }: { searchParams: SP }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const gestor = puedeGestionarTareas(perfil?.rol);

  // Tareas abiertas (libre elección) — visibles para todos.
  let qAbiertas = supabase.from('tareas').select(COLS)
    .is('asignado_a', null).eq('estado', 'pendiente').order('creado_en', { ascending: false });
  if (searchParams.cat) qAbiertas = qAbiertas.eq('categoria', searchParams.cat);
  const { data: abiertasData } = await qAbiertas;
  const abiertas = (abiertasData ?? []) as any[];

  // Mis tareas asignadas.
  const { data: miasData } = await supabase.from('tareas').select(COLS)
    .eq('asignado_a', user!.id).order('creado_en', { ascending: false });
  const mias = (miasData ?? []) as any[];

  return (
    <div>
      <RealtimeRefrescar tabla="tareas" />
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>Tareas</h1>
        {gestor && <Link className="btn btn-primario" href="/tareas/nueva"><Icono nombre="mas" /> Nueva tarea</Link>}
      </div>

      {/* Libre elección */}
      <h2>Tareas abiertas <span className="muted" style={{ fontWeight: 400 }}>· tómalas para colaborar</span></h2>
      <form method="get" className="fila" style={{ marginBottom: 12 }}>
        <select name="cat" className="input" defaultValue={searchParams.cat ?? ''} style={{ width: 'auto' }}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
        </select>
        <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
        {searchParams.cat && <Link className="btn" href="/tareas">Limpiar</Link>}
      </form>

      {abiertas.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>No hay tareas abiertas en esta categoría ahora mismo.</p></div>
      ) : (
        <div className="grid grid-2">
          {abiertas.map((t) => (
            <div key={t.id} className="tarjeta">
              <Badges t={t} />
              <h3 style={{ margin: '8px 0 4px' }}><Link href={'/tareas/' + t.id}>{t.titulo}</Link></h3>
              {t.descripcion && <p className="muted" style={{ marginTop: 0 }}>{String(t.descripcion).slice(0, 140)}</p>}
              <form action={tomarTarea}>
                <input type="hidden" name="tarea_id" value={t.id} />
                <button className="btn btn-acento"><Icono nombre="ok" size={16} /> Tomar tarea</button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Mis tareas */}
      <h2>Mis tareas</h2>
      {mias.length === 0 ? (
        <div className="tarjeta vacio">
          <Icono nombre="reloj" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>
            Aún no tienes tareas. Toma una tarea abierta de arriba{gestor ? '' : ' o espera a que la coordinación te asigne una'}.
          </p>
        </div>
      ) : <TablaTareas tareas={mias} />}

      {/* Gestores: vista completa con filtros */}
      {gestor && <GestorTodas searchParams={searchParams} />}
    </div>
  );
}

async function GestorTodas({ searchParams }: { searchParams: SP }) {
  const supabase = await createClient();
  const { data: grupos } = await supabase.from('grupos').select('id, nombre').order('nombre');
  let q = supabase.from('tareas').select(COLS).order('creado_en', { ascending: false });
  if (searchParams.estado) q = q.eq('estado', searchParams.estado);
  if (searchParams.prioridad) q = q.eq('prioridad', searchParams.prioridad);
  if (searchParams.grupo) q = q.eq('grupo_id', searchParams.grupo);
  const { data } = await q;
  const tareas = (data ?? []) as any[];

  return (
    <>
      <h2>Todas las tareas</h2>
      <form method="get" className="tarjeta fila" style={{ gap: 12 }}>
        <select name="estado" className="input" defaultValue={searchParams.estado ?? ''} style={{ width: 'auto' }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
        </select>
        <select name="prioridad" className="input" defaultValue={searchParams.prioridad ?? ''} style={{ width: 'auto' }}>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
        </select>
        <select name="grupo" className="input" defaultValue={searchParams.grupo ?? ''} style={{ width: 'auto' }}>
          <option value="">Todos los grupos</option>
          {(grupos ?? []).map((g: any) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
        <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
        <Link className="btn" href="/tareas">Limpiar</Link>
      </form>
      {tareas.length === 0
        ? <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>No hay tareas con esos filtros.</p></div>
        : <TablaTareas tareas={tareas} />}
    </>
  );
}
