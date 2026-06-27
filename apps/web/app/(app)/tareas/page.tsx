import Link from 'next/link';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, ESTADOS, PRIORIDADES,
  clasePrioridad, claseEstado,
} from '@/lib/constantes';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';

type SP = {
  estado?: string; prioridad?: string; grupo?: string; mias?: string;
};

export default async function TareasPage({ searchParams }: { searchParams: SP }) {
  const { user } = await requireUsuario();
  const supabase = await createClient();

  const { data: grupos } = await supabase.from('grupos').select('id, nombre').order('nombre');

  let q = supabase.from('tareas')
    .select('id, titulo, estado, prioridad, vence_en, grupo_id, asignado_a, grupos(nombre)')
    .order('creado_en', { ascending: false });

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
        <Link className="btn btn-primario" href="/tareas/nueva">+ Nueva tarea</Link>
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
        <button className="btn" type="submit">Filtrar</button>
        <Link className="btn" href="/tareas">Limpiar</Link>
      </form>

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
            {tareas.length === 0 && <tr><td colSpan={5} className="muted">No hay tareas con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
