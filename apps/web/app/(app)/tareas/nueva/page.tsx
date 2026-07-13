import { redirect } from 'next/navigation';
import { requireUsuario, puedeGestionarTareas, esAdministrador, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PRIORIDADES, ETIQUETA_PRIORIDAD, CATEGORIAS, ETIQUETA_CATEGORIA } from '@/lib/constantes';
import { nombreMostrado } from '@/lib/nombre';
import { crearTarea } from '../actions';
import CapturarUbicacion from './CapturarUbicacion';
import GrupoYAsignado from './GrupoYAsignado';
import BotonEnviar from '@/components/BotonEnviar';

type Persona = { id: string; nombre: string };

export default async function NuevaTareaPage({ searchParams }: { searchParams: { grupo?: string } }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const esAdmin = esAdministrador(perfil);

  // Grupos en los que PUEDE crear tareas (coincide con la RLS puede_publicar_en_grupo):
  // el admin en todos; el resto en los que lidera o —siendo coordinador— es miembro.
  let grupos: { id: string; nombre: string; liderId: string | null }[] = [];
  if (esAdmin) {
    const { data } = await supabase.from('grupos').select('id, nombre, lider_id').order('nombre');
    grupos = (data ?? []).map((g: any) => ({ id: g.id, nombre: g.nombre, liderId: g.lider_id }));
  } else {
    const mapa = new Map<string, { id: string; nombre: string; liderId: string | null }>();
    const { data: lidero } = await supabase.from('grupos').select('id, nombre, lider_id').eq('lider_id', user!.id);
    (lidero ?? []).forEach((g: any) => mapa.set(g.id, { id: g.id, nombre: g.nombre, liderId: g.lider_id }));
    if (rolesDe(perfil).includes('coordinador')) {
      const { data: memb } = await supabase.from('miembros_grupo').select('grupos(id, nombre, lider_id)').eq('perfil_id', user!.id);
      (memb ?? []).forEach((m: any) => { if (m.grupos) mapa.set(m.grupos.id, { id: m.grupos.id, nombre: m.grupos.nombre, liderId: m.grupos.lider_id }); });
    }
    grupos = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  // Solo pasa quien pueda crear alguna tarea: gestor por rol, o líder/coordinador con grupos.
  if (!esAdmin && !puedeGestionarTareas(perfil) && grupos.length === 0) redirect('/grupos');

  // Miembros de cada grupo publicable (para acotar «Asignar a» al propio grupo).
  const miembrosPorGrupo: Record<string, Persona[]> = {};
  const idsGrupos = grupos.map((g) => g.id);
  if (idsGrupos.length) {
    const { data: miembros } = await supabase.from('miembros_grupo')
      .select('grupo_id, perfil_id, perfiles(nombre_completo)').in('grupo_id', idsGrupos);
    (miembros ?? []).forEach((m: any) => {
      (miembrosPorGrupo[m.grupo_id] ??= []).push({ id: m.perfil_id, nombre: nombreMostrado(m.perfiles?.nombre_completo, esAdmin) || m.perfil_id });
    });
    // El líder de cada grupo siempre debe poder recibir la tarea (defensivo si 0099 no se aplicó).
    const liderIds = [...new Set(grupos.map((g) => g.liderId).filter(Boolean) as string[])];
    const nombreLider = new Map<string, string>();
    if (liderIds.length) {
      const { data: lp } = await supabase.from('perfiles').select('id, nombre_completo').in('id', liderIds);
      (lp ?? []).forEach((p: any) => nombreLider.set(p.id, nombreMostrado(p.nombre_completo, esAdmin) || p.id));
    }
    for (const g of grupos) {
      if (!g.liderId) continue;
      const lista = (miembrosPorGrupo[g.id] ??= []);
      if (!lista.some((x) => x.id === g.liderId)) lista.unshift({ id: g.liderId, nombre: nombreLider.get(g.liderId) ?? g.liderId });
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="pagina-cab">
        <div>
          <h1>Nueva tarea</h1>
          <p className="muted sub">Define título, cupo de personas, prioridad, categoría y a quién se asigna (dentro del grupo).</p>
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
            <label htmlFor="cupo">Cupo de personas</label>
            <input id="cupo" name="cupo" className="input" type="number" min={1} placeholder="1 — una sola persona" />
            <p className="muted" style={{ fontSize: '.78rem', margin: '4px 0 0' }}>Vacío = <strong>una sola persona</strong>. Pon 2 o más solo si quieres que <strong>varias colaboren</strong>.</p>
          </div>
          <div className="campo">
            <label htmlFor="vence_en">Vence</label>
            <input id="vence_en" name="vence_en" className="input" type="datetime-local" />
          </div>
          <GrupoYAsignado grupos={grupos.map((g) => ({ id: g.id, nombre: g.nombre }))} miembrosPorGrupo={miembrosPorGrupo} esAdmin={esAdmin} grupoInicial={searchParams.grupo} />
        </div>
        <CapturarUbicacion />
        <p className="muted" style={{ fontSize: '.85rem' }}>
          Si la <strong>asignas</strong> a alguien y dejas el <strong>cupo vacío</strong>, la tarea es <strong>solo de esa persona</strong>: nadie más puede sumarse. Si la dejas <strong>Sin asignar</strong>, queda <strong>abierta</strong> y un miembro del grupo puede tomarla. Con un <strong>cupo de 2 o más</strong>, varias personas del grupo podrán unirse. Solo se asigna a <strong>personas del grupo</strong>.
        </p>
        <BotonEnviar cargando="Creando…">Crear tarea</BotonEnviar>
      </form>
    </div>
  );
}
