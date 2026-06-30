import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { etiquetaArea } from '@/lib/constantes';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import Pill from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import EstadoVacio from '@/components/EstadoVacio';
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
  const coord = esCoordinacion(perfil);
  const totalPorGrupo = new Map<string, number>((conteos ?? []).map((c: any) => [c.grupo_id, Number(c.total)]));
  const misIds = new Set<string>((mis ?? []).map((m: any) => m.grupo_id));

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Grupos</h1>
          <p className="muted sub">Los grupos <strong>abiertos</strong> los puede ver y unir cualquiera; los <strong>privados</strong> solo los ven sus miembros.</p>
        </div>
        {coord && <Link className="btn btn-primario" href="/grupos/nuevo"><Icono nombre="mas" /> Nuevo grupo</Link>}
      </div>

      {grupos.length === 0 && (
        <EstadoVacio
          icono="grupos"
          titulo="No hay grupos para mostrar"
          texto={coord ? 'Crea el primer grupo para organizar al equipo por áreas de trabajo.' : 'Cuando te unas a un grupo o haya grupos abiertos, aparecerán aquí.'}
          accion={coord ? { href: '/grupos/nuevo', etiqueta: 'Crear grupo' } : undefined}
        />
      )}

      <div className="grid grid-2">
        {grupos.map((g) => {
          const soyMiembro = misIds.has(g.id);
          return (
            <div key={g.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <span className="fila" style={{ gap: 6 }}>
                  <BadgeCategoria>{etiquetaArea(g.area)}</BadgeCategoria>
                  {!g.abierto && <Pill tono="aviso" punto={false}>Privado</Pill>}
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
                  ? <Pill tono="ok">Miembro</Pill>
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
    </AnimarEntrada>
  );
}
