import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_AREA } from '@/lib/constantes';
import { agregarMiembro, quitarMiembro, asignarLider } from '../actions';

export default async function GrupoDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const grupoId = params.id;

  const { data: grupo } = await supabase.from('grupos')
    .select('id, nombre, area, descripcion, lider_id').eq('id', grupoId).single();

  if (!grupo) {
    return <div className="tarjeta"><h2>Grupo no encontrado</h2><Link href="/grupos">Volver</Link></div>;
  }

  const { data: miembrosRaw } = await supabase.from('miembros_grupo')
    .select('perfil_id, rol_en_grupo, perfiles(nombre_completo, rol)')
    .eq('grupo_id', grupoId);
  const miembros = (miembrosRaw ?? []) as any[];

  const puedeGestionar = esCoordinacion(perfil?.rol) || grupo.lider_id === user!.id;

  // Perfiles que aún no son miembros (para el selector de "agregar")
  const idsMiembros = new Set(miembros.map((m) => m.perfil_id));
  const { data: todosPerfiles } = await supabase.from('perfiles')
    .select('id, nombre_completo').order('nombre_completo');
  const candidatos = (todosPerfiles ?? []).filter((p: any) => !idsMiembros.has(p.id));

  return (
    <div>
      <Link href="/grupos" className="muted">← Grupos</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <h1 style={{ margin: 0 }}>{grupo.nombre}</h1>
        <span className="insignia">{ETIQUETA_AREA[grupo.area as keyof typeof ETIQUETA_AREA]}</span>
      </div>
      <p className="muted">{grupo.descripcion || 'Sin descripción'}</p>

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
        </>
      )}
    </div>
  );
}
