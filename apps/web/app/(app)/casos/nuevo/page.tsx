import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerificar, puedeRecopilar } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CATEGORIAS_CASO } from '@/lib/constantes';
import { crearCaso } from '../actions';
import TituloConDuplicados from './TituloConDuplicados';

export default async function NuevoCasoPage() {
  const { perfil } = await requireUsuario();
  if (!puedeRecopilar(perfil)) redirect('/dashboard');
  const puedeAsignar = puedeVerificar(perfil);
  const supabase = await createClient();
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo');

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/casos" className="muted">← Verificación</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Nuevo caso</h1>
          <p className="muted sub">Registra la información que llega para verificar: título, categoría, fuente y fecha.</p>
        </div>
      </div>
      <form action={crearCaso} className="tarjeta" style={{ marginTop: 12 }}>
        <TituloConDuplicados />
        <div className="campo">
          <label htmlFor="descripcion">Descripción</label>
          <textarea id="descripcion" name="descripcion" className="input" rows={3} />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="categoria">Categoría</label>
            <select id="categoria" name="categoria" className="input" defaultValue="">
              <option value="">Sin categoría</option>
              {CATEGORIAS_CASO.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fecha_publicacion">Fecha de publicación</label>
            <input id="fecha_publicacion" name="fecha_publicacion" className="input" type="date" />
          </div>
          <div className="campo">
            <label htmlFor="fuente">Fuente</label>
            <input id="fuente" name="fuente" className="input" placeholder="Ej.: Facebook - Familia Pérez" />
          </div>
          <div className="campo">
            <label htmlFor="fuente_url">Enlace de la fuente (opcional)</label>
            <input id="fuente_url" name="fuente_url" className="input" type="url" placeholder="https://…" />
          </div>
          {puedeAsignar && (
            <div className="campo">
              <label htmlFor="asignado_a">Asignar a (verificador)</label>
              <select id="asignado_a" name="asignado_a" className="input" defaultValue="">
                <option value="">Sin asignar</option>
                {(perfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
              </select>
            </div>
          )}
        </div>
        <button className="btn btn-primario" type="submit">Crear caso</button>
      </form>
    </div>
  );
}
