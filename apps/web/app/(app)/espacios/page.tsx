import Link from 'next/link';
import { requireUsuario, rolesDe, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ESPACIO_META, FLUJOS_TRABAJO } from '@/lib/constantes';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import EstadoVacio from '@/components/EstadoVacio';

/**
 * Lanzador de espacios de trabajo. Cada espacio es un grupo pre-hecho (pizarra,
 * tareas, chat, anuncios) al que el usuario queda auto-unido por su rol (0044).
 * Se agrupan por FLUJO y se ordenan por el orden del flujo (ESPACIO_META).
 */
export default async function EspaciosPage() {
  const { perfil } = await requireUsuario();
  const supabase = await createClient();
  const misRoles = rolesDe(perfil);

  const [{ data: espacios }, { data: conteos }] = await Promise.all([
    supabase.from('grupos').select('id, nombre, descripcion, rol_objetivo, whatsapp').not('rol_objetivo', 'is', null),
    supabase.rpc('conteo_miembros_grupo'),
  ]);
  const total = new Map<string, number>((conteos ?? []).map((c: any) => [c.grupo_id, Number(c.total)]));
  const lista = ((espacios ?? []) as any[])
    .filter((g) => g.rol_objetivo && ESPACIO_META[g.rol_objetivo])
    .sort((a, b) => (ESPACIO_META[a.rol_objetivo]?.orden ?? 0) - (ESPACIO_META[b.rol_objetivo]?.orden ?? 0));

  const tarjeta = (g: any) => {
    const meta = ESPACIO_META[g.rol_objetivo] ?? { icono: 'pizarra', color: 'var(--azul)', tinte: '#eef2ff', orden: 99, flujo: 'contenido' };
    const mio = misRoles.includes(g.rol_objetivo);
    return (
      <div key={g.id} className="tarjeta espacio-card">
        <div className="fila" style={{ gap: 12, alignItems: 'flex-start' }}>
          <span className="espacio-ico" style={{ background: meta.tinte, color: meta.color }}><Icono nombre={meta.icono} size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fila" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <span className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                <strong>{g.nombre}</strong>
                {mio && <Pill tono="ok" punto={false}>Tu espacio</Pill>}
              </span>
              <span className="muted fila" style={{ gap: 4, fontSize: '.85rem', flexShrink: 0 }}><Icono nombre="grupos" size={14} /> {total.get(g.id) ?? 0}</span>
            </div>
            {g.descripcion && <p className="muted" style={{ margin: '4px 0 0', fontSize: '.88rem' }}>{g.descripcion}</p>}
          </div>
        </div>
        <div className="fila" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <Link className="btn btn-primario" href={'/espacios/' + g.id}><Icono nombre="flecha" size={16} /> Abrir espacio</Link>
          <Link className="btn" href={'/grupos/' + g.id + '/pizarra'}><Icono nombre="pizarra" size={16} /> Pizarra</Link>
          {g.whatsapp && <a className="btn" href={g.whatsapp} target="_blank" rel="noopener noreferrer"><Icono nombre="whatsapp" size={16} /> Chat</a>}
        </div>
      </div>
    );
  };

  const grupos = FLUJOS_TRABAJO
    .map((f) => ({ flujo: f, items: lista.filter((g) => ESPACIO_META[g.rol_objetivo]?.flujo === f.clave) }))
    .filter((x) => x.items.length > 0);

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Espacios de trabajo</h1>
          <p className="muted sub">El espacio de cada equipo, en el orden del flujo. Estás en el de tu rol automáticamente.</p>
        </div>
      </div>

      {grupos.length === 0 ? (
        <EstadoVacio
          icono="pizarra"
          titulo="Aún no tienes un espacio asignado"
          texto="Cuando coordinación te asigne un rol de recopilación o producción de contenido, tu espacio aparecerá aquí."
        />
      ) : (
        grupos.map(({ flujo, items }) => (
          <section key={flujo.clave} className="flujo-seccion">
            <h2 className="fila" style={{ gap: 8 }}><span className="flujo-chip"><Icono nombre={flujo.icono} size={16} /></span> {flujo.titulo}</h2>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
              {items.map(tarjeta)}
            </div>
          </section>
        ))
      )}
    </AnimarEntrada>
  );
}
