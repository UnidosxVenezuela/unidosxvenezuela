import { redirect } from 'next/navigation';
import { requireUsuario, puedeGestionarTareas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PRIORIDADES, ETIQUETA_PRIORIDAD, CATEGORIAS, ETIQUETA_CATEGORIA } from '@/lib/constantes';
import { crearTarea } from '../actions';
import CapturarUbicacion from './CapturarUbicacion';

export default async function NuevaTareaPage() {
  const { perfil } = await requireUsuario();
  if (!puedeGestionarTareas(perfil)) redirect('/tareas');
  const supabase = await createClient();
  const [{ data: grupos }, { data: perfiles }] = await Promise.all([
    supabase.from('grupos').select('id, nombre').order('nombre'),
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
  ]);

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="pagina-cab">
        <div>
          <h1>Nueva tarea</h1>
          <p className="muted sub">Define título, cupo de personas, prioridad, categoría y a quién se asigna.</p>
        </div>
      </div>
      <form action={crearTarea} className="tarjeta" style={{ marginTop: 12 }}>
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
            <label htmlFor="categoria">Categoría de trabajo</label>
            <select id="categoria" name="categoria" className="input" defaultValue="general">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="prioridad">Prioridad</label>
            <select id="prioridad" name="prioridad" className="input" defaultValue="media">
              {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="cupo">Límite de personas (opcional)</label>
            <input id="cupo" name="cupo" className="input" type="number" min={1} placeholder="Sin límite" />
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
        </div>
        <CapturarUbicacion />
        <p className="muted" style={{ fontSize: '.85rem' }}>
          Si dejas <strong>Sin asignar</strong>, la tarea queda <strong>abierta</strong> y cualquier
          voluntario podrá tomarla (libre elección).
        </p>
        <button className="btn btn-primario" type="submit">Crear tarea</button>
      </form>
    </div>
  );
}
