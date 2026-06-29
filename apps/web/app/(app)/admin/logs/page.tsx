import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ROL } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';

type SP = { q?: string; rol?: string };

const OPS: Record<string, string> = { insert: 'creó', update: 'editó', delete: 'eliminó' };
const ENTIDADES: Record<string, string> = {
  tareas: 'una tarea', tarea_personas: 'participación en una tarea', comentarios_tarea: 'un comentario',
  adjuntos_tarea: 'un adjunto', grupos: 'un grupo', miembros_grupo: 'una membresía de grupo',
  miembros_baneados: 'un veto de grupo', mensajes_fijados: 'un anuncio', publicaciones: 'una publicación',
  registro_horas: 'horas', puntos_acopio: 'un centro de acopio', reuniones: 'una reunión',
  endpoints_aliados: 'un contacto aliado',
};
const SEMANTICAS: Record<string, string> = {
  cambio_rol: 'cambió un rol', cambio_verificacion: 'cambió una verificación', crear_usuario: 'creó un usuario',
};

function describir(accion: string, entidad: string): string {
  const partes = accion.split(':');
  if (partes.length === 2) {
    const tabla = partes[0]!;
    const op = partes[1]!;
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
    supabase.from('perfiles').select('id, nombre_completo, rol'),
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
      desc: describir(l.accion, l.entidad),
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
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1 className="fila" style={{ gap: 8 }}><Icono nombre="historial" size={24} /> Registro de actividad</h1>
        <div className="fila">
          <BotonActualizar />
          <Link className="btn" href="/admin/usuarios">Usuarios</Link>
        </div>
      </div>
      <p className="muted">Quién hizo qué y cuándo, en toda la plataforma. Últimos {(logsRaw ?? []).length} eventos.</p>

      <form method="get" className="fila" style={{ marginBottom: 12 }}>
        <input name="q" className="input" placeholder="Buscar por persona, acción o entidad…"
          defaultValue={searchParams.q ?? ''} style={{ maxWidth: 320 }} />
        <select name="rol" className="input" defaultValue={rolFiltro} style={{ width: 'auto' }}>
          <option value="">Todos los roles</option>
          {Object.entries(ETIQUETA_ROL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
        {(q || rolFiltro) && <Link className="btn" href="/admin/logs">Limpiar</Link>}
      </form>

      <div className="tarjeta">
        {logs.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Sin actividad para ese filtro.</p>
        ) : (
          <table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th></tr></thead>
            <tbody>
              {logs.map((l: any) => {
                const extra = l.metadata?.titulo || l.metadata?.nombre;
                return (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.creado_en).toLocaleString('es-VE')}</td>
                    <td>{l.actorNombre}</td>
                    <td>{l.actorRol
                      ? <span className="insignia">{ETIQUETA_ROL[l.actorRol as keyof typeof ETIQUETA_ROL] ?? l.actorRol}</span>
                      : <span className="muted">—</span>}</td>
                    <td>{l.desc}{extra ? <span className="muted"> · {extra}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
