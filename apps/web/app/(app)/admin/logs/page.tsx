import { fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ROL } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';
import Avatar from '@/components/Avatar';
import Pill from '@/components/Pill';
import BarraBusqueda from '@/components/BarraBusqueda';

type SP = { q?: string; rol?: string };

const OPS: Record<string, string> = { insert: 'creó', update: 'editó', delete: 'eliminó' };
const ENTIDADES: Record<string, string> = {
  tareas: 'una tarea', tarea_personas: 'participación en una tarea', comentarios_tarea: 'un comentario',
  adjuntos_tarea: 'un adjunto', grupos: 'un grupo', miembros_grupo: 'una membresía de grupo',
  miembros_baneados: 'un veto de grupo', mensajes_fijados: 'un anuncio', publicaciones: 'una publicación',
  registro_horas: 'horas', puntos_acopio: 'un centro de acopio', reuniones: 'una reunión',
  endpoints_aliados: 'un contacto aliado', casos: 'un caso', casos_adjuntos: 'un adjunto de caso',
  acopio_responsables: 'un responsable de acopio', perfiles: 'un perfil', piezas_contenido: 'una pieza de contenido',
};
const SEMANTICAS: Record<string, string> = {
  cambio_rol: 'cambió un rol', cambio_verificacion: 'cambió una verificación', crear_usuario: 'creó un usuario',
};

function describir(accion: string, entidad: string, meta?: any): string {
  const partes = accion.split(':');
  if (partes.length === 2) {
    const tabla = partes[0]!;
    const op = partes[1]!;
    // Casos: describir por lo que significa el cambio de estado, no solo "editó".
    if (tabla === 'casos') {
      if (op === 'insert') return 'creó un caso';
      if (op === 'delete') return 'eliminó un caso';
      if (op === 'copia') return 'copió la información de un caso (Redacción)';
      if (op === 'descarga') return 'descargó la información de un caso (Redacción)';
      switch (meta?.estado) {
        case 'confirmado': return 'confirmó un caso';
        case 'falso': return 'descartó un caso';
        case 'enviado_redaccion': return 'envió un caso a Redacción';
        default: return 'actualizó un caso';
      }
    }
    return `${OPS[op] ?? op} ${ENTIDADES[tabla] ?? entidad ?? tabla}`;
  }
  return SEMANTICAS[accion] ?? accion;
}

export default async function LogsPage({ searchParams }: { searchParams: SP }) {
  await requireCoordinacion();
  const supabase = await createClient();

  const [{ data: logsRaw }, { data: perfilesRaw }] = await Promise.all([
    supabase.from('registro_auditoria')
      .select('id, actor_id, accion, entidad, entidad_id, metadata, creado_en')
      .order('creado_en', { ascending: false }).limit(500),
    supabase.from('perfiles').select('id, nombre_completo, rol, avatar_url'),
  ]);

  const perfiles = new Map<string, any>((perfilesRaw ?? []).map((p: any) => [p.id, p]));
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const rolFiltro = searchParams.rol ?? '';

  let logs = (logsRaw ?? []).map((l: any) => {
    const actor = l.actor_id ? perfiles.get(l.actor_id) : null;
    return {
      ...l,
      actorNombre: actor?.nombre_completo ?? (l.actor_id ? '—' : 'Sistema'),
      actorRol: actor?.rol ?? null,
      actorAvatar: actor?.avatar_url ?? null,
      desc: describir(l.accion, l.entidad, l.metadata),
    };
  });
  if (rolFiltro) logs = logs.filter((l) => l.actorRol === rolFiltro);
  if (q) logs = logs.filter((l) =>
    (l.actorNombre?.toLowerCase().includes(q)) ||
    l.desc.toLowerCase().includes(q) ||
    String(l.accion).toLowerCase().includes(q) ||
    String(l.entidad ?? '').toLowerCase().includes(q));

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="historial" size={24} /> Registro de actividad</h1>
          <p className="muted sub">Quién hizo qué y cuándo, en toda la plataforma. Últimos {(logsRaw ?? []).length} eventos.</p>
        </div>
      </div>

      <div className="toolbar">
        <form method="get" className="fila crece" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 0 }}>
          <BarraBusqueda name="q" placeholder="Buscar por persona, acción o entidad…" defaultValue={searchParams.q ?? ''} className="crece" />
          <div className="campo-filtro">
            <label>Rol</label>
            <select name="rol" className="input" defaultValue={rolFiltro} style={{ width: 'auto' }}>
              <option value="">Todos</option>
              {Object.entries(ETIQUETA_ROL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
          {(q || rolFiltro) && <Link className="btn" href="/admin/logs">Limpiar</Link>}
        </form>
        <div className="toolbar-acciones">
          <BotonActualizar />
          <Link className="btn" href="/admin/usuarios">Usuarios</Link>
        </div>
      </div>

      <div className="tarjeta">
        {logs.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Sin actividad para ese filtro.</p>
        ) : (
          <div className="tabla-scroll"><table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th></tr></thead>
            <tbody>
              {logs.map((l: any) => {
                const extra = l.metadata?.titulo || l.metadata?.nombre || l.metadata?.nombre_completo;
                return (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(l.creado_en)}</td>
                    <td>
                      <span className="fila" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <Avatar nombre={l.actor_id ? l.actorNombre : 'Sistema'} url={l.actorAvatar} size={24} />
                        {l.actorNombre}
                      </span>
                    </td>
                    <td>{l.actorRol
                      ? <Pill tono="neutra" punto={false}>{ETIQUETA_ROL[l.actorRol as keyof typeof ETIQUETA_ROL] ?? l.actorRol}</Pill>
                      : <span className="muted">—</span>}</td>
                    <td>{l.desc}{extra ? <span className="muted"> · {extra}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
