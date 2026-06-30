import Link from 'next/link';
import { requireUsuario, rolesDe, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import EstadoVacio from '@/components/EstadoVacio';

/**
 * Lanzador de espacios de trabajo por rol. Cada espacio es un grupo pre-hecho
 * (pizarra, tareas, chat, anuncios). El usuario queda auto-unido al de su rol
 * (migración 0044); aquí los tiene a la mano.
 */
export default async function EspaciosPage() {
  const { perfil } = await requireUsuario();
  const supabase = await createClient();
  const misRoles = rolesDe(perfil);
  const coord = esCoordinacion(perfil);

  const [{ data: espacios }, { data: conteos }] = await Promise.all([
    supabase.from('grupos').select('id, nombre, descripcion, rol_objetivo, whatsapp')
      .not('rol_objetivo', 'is', null).order('nombre'),
    supabase.rpc('conteo_miembros_grupo'),
  ]);
  const total = new Map<string, number>((conteos ?? []).map((c: any) => [c.grupo_id, Number(c.total)]));
  const lista = (espacios ?? []) as any[];
  const mios = lista.filter((g) => g.rol_objetivo && misRoles.includes(g.rol_objetivo));
  const otros = lista.filter((g) => !mios.includes(g));

  const tarjeta = (g: any) => (
    <div key={g.id} className="tarjeta">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <strong>{g.nombre}</strong>
        <span className="muted fila" style={{ gap: 4, fontSize: '.85rem' }}><Icono nombre="grupos" size={15} /> {total.get(g.id) ?? 0}</span>
      </div>
      {g.descripcion && <p className="muted" style={{ margin: '6px 0' }}>{g.descripcion}</p>}
      <div className="fila" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <Link className="btn btn-primario" href={'/espacios/' + g.id}><Icono nombre="flecha" size={16} /> Abrir espacio</Link>
        <Link className="btn" href={'/grupos/' + g.id + '/pizarra'}><Icono nombre="pizarra" size={16} /> Pizarra</Link>
        {g.whatsapp && <a className="btn" href={g.whatsapp} target="_blank" rel="noopener noreferrer"><Icono nombre="whatsapp" size={16} /> Chat</a>}
      </div>
    </div>
  );

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Espacios de trabajo</h1>
          <p className="muted sub">Cada equipo tiene su espacio con pizarra, tareas y chat. Estás en el de tu rol automáticamente.</p>
        </div>
      </div>

      {mios.length === 0 && otros.length === 0 ? (
        <EstadoVacio
          icono="pizarra"
          titulo="Aún no tienes un espacio asignado"
          texto="Cuando coordinación te asigne un rol de recopilación o producción de contenido, tu espacio aparecerá aquí."
        />
      ) : (
        <>
          {mios.length > 0 && (
            <>
              <h2>Mis espacios</h2>
              <div className="grid grid-2">{mios.map(tarjeta)}</div>
            </>
          )}
          {coord && otros.length > 0 && (
            <>
              <h2 style={{ marginTop: 18 }}>Otros espacios</h2>
              <div className="grid grid-2">{otros.map(tarjeta)}</div>
            </>
          )}
        </>
      )}
    </AnimarEntrada>
  );
}
