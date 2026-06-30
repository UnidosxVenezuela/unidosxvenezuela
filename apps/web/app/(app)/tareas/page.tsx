import Link from 'next/link';
import { requireUsuario, puedeGestionarTareas, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, ETIQUETA_CATEGORIA,
  ESTADOS, PRIORIDADES, CATEGORIAS, clasePrioridad, claseEstado, RANGO_PRIORIDAD,
} from '@/lib/constantes';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';
import BotonConfirmar from '@/components/BotonConfirmar';
import AnimarEntrada from '@/components/AnimarEntrada';
import Avatar from '@/components/Avatar';
import MenuFila from '@/components/MenuFila';
import Kpi from '@/components/Kpi';
import Pill, { tonoDeClase } from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import DetalleTarea from './DetalleTarea';
import { tomarTarea } from './actions';

type SP = { estado?: string; prioridad?: string; grupo?: string; cat?: string; mias?: string; tarea?: string };

/** Conserva los filtros actuales (sin `tarea` ni el flash `ok`) al construir enlaces del panel lateral. */
const CLAVES_FILTRO: (keyof SP)[] = ['estado', 'prioridad', 'grupo', 'cat', 'mias'];
function filtrosTareas(searchParams: SP): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of CLAVES_FILTRO) { const v = searchParams[k]; if (v) p.set(k, String(v)); }
  return p;
}
function hrefDetalleTarea(searchParams: SP, tareaId: string): string {
  const p = filtrosTareas(searchParams); p.set('tarea', tareaId);
  return '/tareas?' + p.toString();
}

function Badges({ t }: { t: any }) {
  return (
    <div className="fila" style={{ gap: 6 }}>
      <BadgeCategoria>{ETIQUETA_CATEGORIA[t.categoria as keyof typeof ETIQUETA_CATEGORIA] ?? t.categoria}</BadgeCategoria>
      <Pill tono={tonoDeClase(clasePrioridad(t.prioridad))} punto={false}>{ETIQUETA_PRIORIDAD[t.prioridad as keyof typeof ETIQUETA_PRIORIDAD]}</Pill>
      <Pill tono={tonoDeClase(claseEstado(t.estado))}>{ETIQUETA_ESTADO[t.estado as keyof typeof ETIQUETA_ESTADO]}</Pill>
    </div>
  );
}

function TablaTareas({ tareas, conEntregables, hrefDetalle }: {
  tareas: any[]; conEntregables?: Set<string>; hrefDetalle: (id: string) => string;
}) {
  return (
    <div className="tarjeta">
      <table>
        <thead>
          <tr><th>Tarea</th><th>Categoría</th><th>Grupo</th><th>Asignado</th><th>Prioridad</th><th>Estado</th><th>Vence</th><th aria-label="Acciones"></th></tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <tr key={t.id}>
              <td>
                <span className="celda-persona">
                  <Link href={hrefDetalle(t.id)}>{t.titulo}</Link>
                  {conEntregables?.has(t.id) && <Pill tono="ok" punto={false}>Entregado</Pill>}
                </span>
              </td>
              <td><BadgeCategoria>{ETIQUETA_CATEGORIA[t.categoria as keyof typeof ETIQUETA_CATEGORIA] ?? t.categoria}</BadgeCategoria></td>
              <td>{t.grupos?.nombre ?? '—'}</td>
              <td>{t.asignado_a
                ? <span className="celda-persona"><Avatar nombre={t.asignado?.nombre_completo} size={24} /> {t.asignado?.nombre_completo ?? '—'}</span>
                : <span className="muted">Sin asignar</span>}</td>
              <td><Pill tono={tonoDeClase(clasePrioridad(t.prioridad))} punto={false}>{ETIQUETA_PRIORIDAD[t.prioridad as keyof typeof ETIQUETA_PRIORIDAD]}</Pill></td>
              <td><Pill tono={tonoDeClase(claseEstado(t.estado))}>{ETIQUETA_ESTADO[t.estado as keyof typeof ETIQUETA_ESTADO]}</Pill></td>
              <td style={{ whiteSpace: 'nowrap' }}>{t.vence_en ? new Date(t.vence_en).toLocaleString('es-VE') : '—'}</td>
              <td style={{ textAlign: 'right' }}>
                <MenuFila etiqueta={'Acciones de ' + t.titulo}>
                  <Link href={hrefDetalle(t.id)}><Icono nombre="panel" size={16} /> Abrir panel</Link>
                  <Link href={'/tareas/' + t.id}><Icono nombre="enlace" size={16} /> Abrir en página</Link>
                </MenuFila>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLS = 'id, titulo, descripcion, estado, prioridad, categoria, vence_en, grupo_id, asignado_a, cupo, grupos(nombre), asignado:perfiles!tareas_asignado_a_fkey(nombre_completo)';

export default async function TareasPage({ searchParams }: { searchParams: SP }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const gestor = puedeGestionarTareas(perfil?.rol);

  // Conteo de ocupados + mis participaciones (modelo de cupo).
  const [{ data: conteoData }, { data: misPartData }, { data: entregablesData }] = await Promise.all([
    supabase.rpc('conteo_personas_tarea'),
    supabase.from('tarea_personas').select('tarea_id').eq('perfil_id', user!.id),
    supabase.from('adjuntos_tarea').select('tarea_id').eq('clase', 'entregable'),
  ]);
  const conteo = new Map<string, number>((conteoData ?? []).map((c: any) => [c.tarea_id, Number(c.total)]));
  const misIds = new Set<string>((misPartData ?? []).map((r: any) => r.tarea_id));
  const conEntregables = new Set<string>((entregablesData ?? []).map((a: any) => a.tarea_id));

  // Tareas abiertas (con cupo disponible) — visibles para todos; ordenadas por prioridad.
  let qAbiertas = supabase.from('tareas').select(COLS).in('estado', ['pendiente', 'asignada']);
  if (searchParams.cat) qAbiertas = qAbiertas.eq('categoria', searchParams.cat);
  const { data: abiertasData } = await qAbiertas;
  const abiertas = ((abiertasData ?? []) as any[])
    .filter((t) => !misIds.has(t.id) && (conteo.get(t.id) ?? 0) < (t.cupo ?? 1))
    .sort((a, b) => RANGO_PRIORIDAD[a.prioridad as keyof typeof RANGO_PRIORIDAD] - RANGO_PRIORIDAD[b.prioridad as keyof typeof RANGO_PRIORIDAD]);

  // Mis tareas (donde participo).
  let mias: any[] = [];
  if (misIds.size) {
    const { data: miasData } = await supabase.from('tareas').select(COLS)
      .in('id', [...misIds]).order('creado_en', { ascending: false });
    mias = (miasData ?? []) as any[];
  }

  // KPIs (solo gestores: ven el universo de tareas). Cada uno enlaza a su filtro.
  let kpis: { total: number; pendientes: number; progreso: number; completadas: number } | null = null;
  if (gestor) {
    const cnt = (estado?: string) => {
      let q = supabase.from('tareas').select('*', { count: 'exact', head: true });
      if (estado) q = q.eq('estado', estado);
      return q;
    };
    const [kt, kp, kpr, kc] = await Promise.all([cnt(), cnt('pendiente'), cnt('en_progreso'), cnt('completada')]);
    kpis = { total: kt.count ?? 0, pendientes: kp.count ?? 0, progreso: kpr.count ?? 0, completadas: kc.count ?? 0 };
  }

  // Panel lateral (drawer) cuando hay ?tarea=ID, conservando los filtros.
  const cerrarHref = '/tareas' + (filtrosTareas(searchParams).toString() ? '?' + filtrosTareas(searchParams).toString() : '');
  let drawerTarea: any = null, drawerPersonas: any[] = [], drawerPerfiles: any[] = [];
  let drawerTieneEntregables = false, drawerPuedeEditar = false, drawerEsGestorTarea = false;
  if (searchParams.tarea) {
    const tid = searchParams.tarea;
    const [{ data: dt }, { data: dpers }, { data: dperf }, { data: dent }] = await Promise.all([
      supabase.from('tareas').select(
        `id, titulo, descripcion, estado, prioridad, vence_en, ubicacion, lat, lng, grupo_id, asignado_a, cupo, creado_por,
         grupos ( nombre, lider_id ),
         asignado:perfiles!tareas_asignado_a_fkey ( nombre_completo )`,
      ).eq('id', tid).single(),
      supabase.from('tarea_personas').select('perfil_id, perfiles ( nombre_completo )').eq('tarea_id', tid).order('unido_en', { ascending: true }),
      supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
      supabase.from('adjuntos_tarea').select('id').eq('tarea_id', tid).eq('clase', 'entregable').limit(1),
    ]);
    drawerTarea = dt; drawerPersonas = (dpers ?? []) as any[]; drawerPerfiles = (dperf ?? []) as any[];
    drawerTieneEntregables = (dent ?? []).length > 0;
    if (dt) {
      const liderId = (dt as any).grupos?.lider_id;
      drawerEsGestorTarea = esCoordinacion(perfil?.rol) || liderId === user!.id;
      drawerPuedeEditar = drawerEsGestorTarea || dt.asignado_a === user!.id || dt.creado_por === user!.id;
    }
  }

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="tareas" />
      <div className="pagina-cab">
        <div>
          <h1>Tareas</h1>
          <p className="muted sub">Toma tareas abiertas, sigue las tuyas y coordina el trabajo del equipo.</p>
        </div>
        <div className="fila">
          <BotonActualizar />
          {gestor && <Link className="btn btn-primario" href="/tareas/nueva"><Icono nombre="mas" /> Nueva tarea</Link>}
        </div>
      </div>

      {kpis && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', margin: '16px 0' }}>
          <Kpi etiqueta="Total de tareas" valor={kpis.total} sub="Todas las registradas" color="var(--azul)" icono="tareas" tinte="#eef2ff" href="/tareas" />
          <Kpi etiqueta="Pendientes" valor={kpis.pendientes} sub="Esperando a alguien" color="#a16207" icono="reloj" tinte="#fef9c3" href="/tareas?estado=pendiente" />
          <Kpi etiqueta="En progreso" valor={kpis.progreso} sub="En marcha ahora" color="#2563eb" icono="refrescar" tinte="#dbeafe" href="/tareas?estado=en_progreso" />
          <Kpi etiqueta="Completadas" valor={kpis.completadas} sub="Trabajo terminado" color="#16a34a" icono="ok" tinte="#d1fae5" href="/tareas?estado=completada" />
        </div>
      )}

      <div className={drawerTarea ? 'grupo-grid' : undefined}>
        <div className="grupo-main">

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
              <h3 style={{ margin: '8px 0 4px' }}><Link href={hrefDetalleTarea(searchParams, t.id)}>{t.titulo}</Link></h3>
              {t.descripcion && <p className="muted" style={{ marginTop: 0 }}>{String(t.descripcion).slice(0, 140)}</p>}
              {t.cupo && (
                <p className="muted fila" style={{ margin: '0 0 8px', gap: 6, fontSize: '.85rem' }}>
                  <Icono nombre="grupos" size={15} /> Cupos: {(conteo.get(t.id) ?? 0)}/{t.cupo}
                </p>
              )}
              {perfil?.rol !== 'observador' && (
                <form action={tomarTarea}>
                  <input type="hidden" name="tarea_id" value={t.id} />
                  <BotonConfirmar mensaje={t.cupo ? '¿Sumarte a esta tarea?' : '¿Tomar esta tarea? Quedarás como responsable de realizarla.'} className="btn btn-acento"><Icono nombre="ok" size={16} /> {t.cupo ? 'Unirme' : 'Tomar tarea'}</BotonConfirmar>
                </form>
              )}
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
      ) : <TablaTareas tareas={mias} conEntregables={conEntregables} hrefDetalle={(tid) => hrefDetalleTarea(searchParams, tid)} />}

      {/* Gestores: vista completa con filtros */}
      {gestor && <GestorTodas searchParams={searchParams} />}

        </div>
        {drawerTarea && (
          <aside className="grupo-aside">
            <DetalleTarea
              tarea={drawerTarea} personas={drawerPersonas} perfiles={drawerPerfiles}
              puedeEditar={drawerPuedeEditar} esGestorTarea={drawerEsGestorTarea}
              tieneEntregables={drawerTieneEntregables}
              volver={hrefDetalleTarea(searchParams, drawerTarea.id)} cerrarHref={cerrarHref}
            />
          </aside>
        )}
      </div>
    </AnimarEntrada>
  );
}

async function GestorTodas({ searchParams }: { searchParams: SP }) {
  const supabase = await createClient();
  const { data: grupos } = await supabase.from('grupos').select('id, nombre').order('nombre');
  let q = supabase.from('tareas').select(COLS).order('creado_en', { ascending: false });
  if (searchParams.estado) q = q.eq('estado', searchParams.estado);
  if (searchParams.prioridad) q = q.eq('prioridad', searchParams.prioridad);
  if (searchParams.grupo) q = q.eq('grupo_id', searchParams.grupo);
  const [{ data }, { data: entregablesData }] = await Promise.all([
    q,
    supabase.from('adjuntos_tarea').select('tarea_id').eq('clase', 'entregable'),
  ]);
  const tareas = (data ?? []) as any[];
  const conEntregables = new Set<string>((entregablesData ?? []).map((a: any) => a.tarea_id));

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
        : <TablaTareas tareas={tareas} conEntregables={conEntregables} hrefDetalle={(tid) => hrefDetalleTarea(searchParams, tid)} />}
    </>
  );
}
