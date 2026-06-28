import Link from 'next/link';
import { requireUsuario, puedeGestionarTareas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, ESTADOS, PRIORIDADES,
  clasePrioridad, claseEstado,
} from '@/lib/constantes';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Icono from '@/components/Icono';

type SP = { estado?: string; prioridad?: string; grupo?: string; mias?: string };

function TablaTareas({ tareas }: { tareas: any[] }) {
  return (
    <div className="tarjeta">
      <table>
        <thead>
          <tr><th>Tarea</th><th>Grupo</th><th>Prioridad</th><th>Estado</th><th>Vence</th></tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <tr key={t.id}>
              <td><Link href={'/tareas/' + t.id}>{t.titulo}</Link></td>
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

export default async function TareasPage({ searchParams }: { searchParams: SP }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const gestor = puedeGestionarTareas(perfil?.rol);

  const cols = 'id, titulo, estado, prioridad, vence_en, grupo_id, asignado_a, grupos(nombre)';

  // Voluntarios / observadores: solo sus tareas asignadas, en espera si no hay.
  if (!gestor) {
    const { data } = await supabase.from('tareas').select(cols)
      .eq('asignado_a', user!.id).order('creado_en', { ascending: false });
    const tareas = (data ?? []) as any[];
    return (
      <div>
        <RealtimeRefrescar tabla="tareas" />
        <h1>Mis tareas</h1>
        <p className="muted">Tareas que la coordinación te asignó.</p>
        {tareas.length === 0 ? (
          <div className="tarjeta vacio">
            <Icono nombre="reloj" size={40} />
            <h2 style={{ margin: '8px 0 4px' }}>En espera de tareas</h2>
            <p className="muted">Aún no tienes tareas asignadas. La coordinación te asignará tareas pronto.</p>
          </div>
        ) : <TablaTareas tareas={tareas} />}
      </div>
    );
  }

  // Gestores: vista completa con filtros.
  const { data: grupos } = await supabase.from('grupos').select('id, nombre').order('nombre');
  let q = supabase.from('tareas').select(cols).order('creado_en', { ascending: false });
  if (searchParams.estado) q = q.eq('estado', searchParams.estado);
  if (searchParams.prioridad) q = q.eq('prioridad', searchParams.prioridad);
  if (searchParams.grupo) q = q.eq('grupo_id', searchParams.grupo);
  if (searchParams.mias === '1') q = q.eq('asignado_a', user!.id);
  const { data } = await q;
  const tareas = (data ?? []) as any[];

  return (
    <div>
      <RealtimeRefrescar tabla="tareas" />
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>Tareas</h1>
        <Link className="btn btn-primario" href="/tareas/nueva"><Icono nombre="mas" /> Nueva tarea</Link>
      </div>

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
        <label className="fila" style={{ gap: 6 }}>
          <input type="checkbox" name="mias" value="1" defaultChecked={searchParams.mias === '1'} />
          Solo mías
        </label>
        <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
        <Link className="btn" href="/tareas">Limpiar</Link>
      </form>

      {tareas.length === 0
        ? <div className="tarjeta vacio"><p className="muted">No hay tareas con esos filtros.</p></div>
        : <TablaTareas tareas={tareas} />}
    </div>
  );
}
