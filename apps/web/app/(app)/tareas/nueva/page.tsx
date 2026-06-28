import { redirect } from 'next/navigation';
import { requireUsuario, puedeGestionarTareas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PRIORIDADES, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import { crearTarea } from '../actions';

export default async function NuevaTareaPage() {
  const { perfil } = await requireUsuario();
  if (!puedeGestionarTareas(perfil?.rol)) redirect('/tareas');
  const supabase = await createClient();
  const [{ data: grupos }, { data: perfiles }] = await Promise.all([
    supabase.from('grupos').select('id, nombre').order('nombre'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
  ]);

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Nueva tarea</h1>
      <form action={crearTarea} className="tarjeta">
        <div className="campo">
          <label htmlFor="titulo">Título</label>
          <input id="titulo" name="titulo" className="input" required />
        </div>
        <div className="campo">
          <label htmlFor="descripcion">Descripción</label>
          <textarea id="descripcion" name="descripcion" className="input" />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="prioridad">Prioridad</label>
            <select id="prioridad" name="prioridad" className="input" defaultValue="media">
              {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="vence_en">Vence</label>
            <input id="vence_en" name="vence_en" className="input" type="datetime-local" />
          </div>
          <div className="campo">
            <label htmlFor="grupo_id">Grupo</label>
            <select id="grupo_id" name="grupo_id" className="input" defaultValue="">
              <option value="">Sin grupo</option>
              {(grupos ?? []).map((g: any) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="asignado_a">Asignar a</label>
            <select id="asignado_a" name="asignado_a" className="input" defaultValue="">
              <option value="">Sin asignar</option>
              {(perfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="lat">Latitud (opcional)</label>
            <input id="lat" name="lat" className="input" type="number" step="any" placeholder="10.49" />
          </div>
          <div className="campo">
            <label htmlFor="lng">Longitud (opcional)</label>
            <input id="lng" name="lng" className="input" type="number" step="any" placeholder="-68.05" />
          </div>
        </div>
        <button className="btn btn-primario" type="submit">Crear tarea</button>
      </form>
    </div>
  );
}
