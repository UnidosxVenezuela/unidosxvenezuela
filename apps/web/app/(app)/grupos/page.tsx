import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { etiquetaArea } from '@/lib/constantes';
import Icono from '@/components/Icono';
import type { Grupo } from '@unidos/types';

export default async function GruposPage() {
  const { perfil } = await requireUsuario();
  const supabase = await createClient();
  const [{ data }, { data: conteos }] = await Promise.all([
    supabase.from('grupos').select('id, nombre, area, descripcion, lider_id, whatsapp').order('nombre'),
    supabase.rpc('conteo_miembros_grupo'),
  ]);
  const grupos = (data ?? []) as Grupo[];
  const coord = esCoordinacion(perfil?.rol);
  const totalPorGrupo = new Map<string, number>(
    (conteos ?? []).map((c: any) => [c.grupo_id, Number(c.total)]),
  );

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>Grupos</h1>
        {coord && <Link className="btn btn-primario" href="/grupos/nuevo"><Icono nombre="mas" /> Nuevo grupo</Link>}
      </div>

      {grupos.length === 0 && (
        <div className="tarjeta vacio">
          <Icono nombre="grupos" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>Aún no hay grupos. {coord ? 'Crea el primero.' : 'La coordinación creará los grupos operativos.'}</p>
        </div>
      )}

      <div className="grid grid-2">
        {grupos.map((g) => (
          <Link key={g.id} href={'/grupos/' + g.id} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <span className="insignia">{etiquetaArea(g.area)}</span>
              <span className="fila muted" style={{ gap: 4, fontSize: '.85rem' }}>
                <Icono nombre="grupos" size={16} /> {totalPorGrupo.get(g.id) ?? 0} personas
              </span>
            </div>
            <h2 style={{ margin: '8px 0 4px' }}>{g.nombre}</h2>
            <p className="muted" style={{ margin: 0 }}>{g.descripcion || 'Sin descripción'}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
