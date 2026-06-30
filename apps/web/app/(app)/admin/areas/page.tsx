import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { crearArea } from './actions';

export default async function AdminAreasPage() {
  const { perfil } = await requireCoordinacion();
  const supabase = await createClient();
  const { data: areas } = await supabase.from('areas').select('clave, nombre, descripcion').order('nombre');
  const esAdmin = perfil?.rol === 'admin';

  return (
    <div>
      <Link href="/admin/usuarios" className="muted">← Administración</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Áreas</h1>
          <p className="muted sub">Las áreas organizan los grupos. Las 9 humanitarias (OCHA) y las de trabajo vienen predeterminadas; un administrador puede crear más.</p>
        </div>
      </div>

      {esAdmin && (
        <form action={crearArea} className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Nueva área</h2>
          <div className="grid grid-2">
            <div className="campo"><label htmlFor="nombre">Nombre</label>
              <input id="nombre" name="nombre" className="input" required placeholder="Comunicaciones" /></div>
            <div className="campo"><label htmlFor="clave">Clave (opcional)</label>
              <input id="clave" name="clave" className="input" placeholder="se genera del nombre" /></div>
          </div>
          <div className="campo"><label htmlFor="descripcion">Descripción</label>
            <input id="descripcion" name="descripcion" className="input" /></div>
          <button className="btn btn-primario" type="submit">Crear área</button>
        </form>
      )}

      <div className="tarjeta">
        <table>
          <thead><tr><th>Área</th><th>Clave</th><th>Descripción</th></tr></thead>
          <tbody>
            {(areas ?? []).map((a: any) => (
              <tr key={a.clave}>
                <td><strong>{a.nombre}</strong></td>
                <td><span className="muted">{a.clave}</span></td>
                <td>{a.descripcion || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
