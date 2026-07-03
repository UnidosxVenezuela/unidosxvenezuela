import Link from 'next/link';
import { requireUsuario, esCoordinacion, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { etiquetaArea } from '@/lib/constantes';
import { nombreMostrado } from '@/lib/nombre';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BadgeCategoria from '@/components/BadgeCategoria';
import EstadoVacio from '@/components/EstadoVacio';

/**
 * Cada quien ve SOLO su(s) grupo(s); el admin los ve todos. A las personas las
 * agrega el admin (o el líder de su grupo): ya no hay auto-unirse ni solicitudes.
 * La RLS impone esta visibilidad también a nivel de datos.
 */
export default async function GruposPage() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const coord = esCoordinacion(perfil); // solo admin
  const [{ data }, { data: conteos }] = await Promise.all([
    supabase.from('grupos').select('id, nombre, area, descripcion, lider_id, abierto').order('nombre'),
    supabase.rpc('conteo_miembros_grupo'),
  ]);
  const grupos = (data ?? []) as any[];
  const totalPorGrupo = new Map<string, number>((conteos ?? []).map((c: any) => [c.grupo_id, Number(c.total)]));

  const liderIds = Array.from(new Set(grupos.map((g) => g.lider_id).filter(Boolean)));
  const nombrePorId = new Map<string, string>();
  if (liderIds.length) {
    const { data: lideres } = await supabase.from('perfiles').select('id, nombre_completo').in('id', liderIds);
    const verFull = esAdministrador(perfil);
    (lideres ?? []).forEach((p: any) => nombrePorId.set(p.id, nombreMostrado(p.nombre_completo, verFull)));
  }

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Grupos</h1>
          <p className="muted sub">
            {coord
              ? <>Como <strong>administración</strong> ves todos los grupos y puedes entrar a cualquiera para supervisarlo.</>
              : <>Estos son tus grupos de trabajo. A los grupos te agrega la administración o el líder del grupo.</>}
          </p>
        </div>
        {coord && <Link className="btn btn-primario" href="/grupos/nuevo"><Icono nombre="mas" /> Nuevo grupo</Link>}
      </div>

      {grupos.length === 0 && (
        <EstadoVacio
          icono="grupos"
          titulo="Aún no perteneces a ningún grupo"
          texto="Cuando la administración o un líder te sume a un grupo, aparecerá aquí con sus tareas y anuncios."
        />
      )}

      <div className="grid grid-2">
        {grupos.map((g) => (
          <div key={g.id} className="tarjeta">
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <BadgeCategoria>{etiquetaArea(g.area)}</BadgeCategoria>
              <span className="fila muted" style={{ gap: 4, fontSize: '.85rem' }}>
                <Icono nombre="grupos" size={16} /> {totalPorGrupo.get(g.id) ?? 0}
              </span>
            </div>
            <h2 style={{ margin: '8px 0 4px' }}>
              <Link href={'/grupos/' + g.id} style={{ textDecoration: 'none', color: 'inherit' }}>{g.nombre}</Link>
            </h2>
            <p className="muted" style={{ margin: 0 }}>{g.descripcion || 'Sin descripción'}</p>
            <div className="fila muted" style={{ gap: 4, margin: '6px 0 0', fontSize: '.85rem' }}>
              <Icono nombre="usuario" size={14} />
              {g.lider_id && nombrePorId.get(g.lider_id)
                ? <>Líder: <strong style={{ color: 'var(--texto)' }}>{nombrePorId.get(g.lider_id)}</strong></>
                : <span>Sin líder asignado</span>}
            </div>
            <div className="fila" style={{ marginTop: 10 }}>
              <Link className="btn" href={'/grupos/' + g.id}>Entrar</Link>
            </div>
          </div>
        ))}
      </div>
    </AnimarEntrada>
  );
}
