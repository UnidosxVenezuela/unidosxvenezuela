import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { etiquetaArea } from '@/lib/constantes';
import Icono from '@/components/Icono';
import { unirmeGrupo } from './actions';

export default async function GruposPage() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const [{ data }, { data: conteos }, { data: mis }] = await Promise.all([
    supabase.from('grupos').select('id, nombre, area, descripcion, lider_id, whatsapp, abierto').order('nombre'),
    supabase.rpc('conteo_miembros_grupo'),
    supabase.from('miembros_grupo').select('grupo_id').eq('perfil_id', user!.id),
  ]);
  const grupos = (data ?? []) as any[];
  const coord = esCoordinacion(perfil?.rol);
  const totalPorGrupo = new Map<string, number>((conteos ?? []).map((c: any) => [c.grupo_id, Number(c.total)]));
  const misIds = new Set<string>((mis ?? []).map((m: any) => m.grupo_id));

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>Grupos</h1>
        {coord && <Link className="btn btn-primario" href="/grupos/nuevo"><Icono nombre="mas" /> Nuevo grupo</Link>}
      </div>
      <p className="muted">Los grupos <strong>abiertos</strong> los puede ver y unir cualquiera; los <strong>privados</strong> solo los ven sus miembros.</p>

      {grupos.length === 0 && (
        <div className="tarjeta vacio">
          <Icono nombre="grupos" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>No hay grupos visibles para ti. {coord ? 'Crea el primero.' : ''}</p>
        </div>
      )}

      <div className="grid grid-2">
        {grupos.map((g) => {
          const soyMiembro = misIds.has(g.id);
          return (
            <div key={g.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <span className="fila" style={{ gap: 6 }}>
                  <span className="insignia">{etiquetaArea(g.area)}</span>
                  {!g.abierto && <span className="insignia aviso">Privado</span>}
                </span>
                <span className="fila muted" style={{ gap: 4, fontSize: '.85rem' }}>
                  <Icono nombre="grupos" size={16} /> {totalPorGrupo.get(g.id) ?? 0}
                </span>
              </div>
              <h2 style={{ margin: '8px 0 4px' }}>
                <Link href={'/grupos/' + g.id} style={{ textDecoration: 'none', color: 'inherit' }}>{g.nombre}</Link>
              </h2>
              <p className="muted" style={{ margin: 0 }}>{g.descripcion || 'Sin descripción'}</p>
              <div className="fila" style={{ marginTop: 10 }}>
                <Link className="btn" href={'/grupos/' + g.id}>Ver</Link>
                {soyMiembro
                  ? <span className="insignia ok">Miembro</span>
                  : (g.abierto && perfil?.rol !== 'observador' && (
                      <form action={unirmeGrupo}>
                        <input type="hidden" name="grupo_id" value={g.id} />
                        <button className="btn btn-acento">Unirme</button>
                      </form>
                    ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
