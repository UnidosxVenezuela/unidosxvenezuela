import { fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ROL, ETIQUETA_ESTADO } from '@/lib/constantes';
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
  endpoints_aliados: 'un contacto aliado', casos: 'una solicitud', casos_adjuntos: 'un adjunto de solicitud',
  acopio_responsables: 'un responsable de acopio', perfiles: 'un perfil', piezas_contenido: 'una pieza de contenido',
  // Nuevas entidades auditadas (0130) + otras que faltaban en el mapa.
  oportunidades: 'una oportunidad (Captación)', listados_digitalizados: 'un listado digitalizado',
  lugares: 'un lugar', movimientos_acopio: 'un movimiento de inventario', solicitudes_traspaso: 'una solicitud de traspaso',
  busqueda_casos: 'una ficha de desaparecido', bitacora_busqueda: 'una gestión de búsqueda',
  solicitudes_alta_usuario: 'una solicitud de alta', solicitudes_insumo: 'una solicitud de insumo',
  inventario_acopio: 'un producto de inventario', cedula: 'una cédula (CNE)', insumo: 'un insumo', aviso: 'un aviso',
};
const SEMANTICAS: Record<string, string> = {
  cambio_rol: 'cambió un rol', cambio_verificacion: 'cambió una verificación', crear_usuario: 'creó un usuario',
  reset_contrasena: 'restableció una contraseña', cambio_roles_extra: 'cambió los roles adicionales',
  eliminar_usuario: 'eliminó un usuario', verificacion_aprobada: 'aprobó una verificación de identidad',
  verificacion_rechazada: 'rechazó una verificación de identidad', alta_delegada: 'creó una cuenta (alta delegada)',
  exportar_csv: 'descargó un listado en CSV', exportar_pdf: 'abrió una versión imprimible (PDF)',
};
// Columna → nombre corto legible, para describir QUÉ campos cambiaron (metadata.cambios,
// disponible en toda tabla auditada desde 0134). Cubre perfiles y campos comunes de otras
// entidades (tareas, grupos, centros, contenido…). Las columnas no listadas se omiten.
const CAMPO_LEGIBLE: Record<string, string> = {
  // Perfiles
  avatar_url: 'foto de perfil', nombre_completo: 'nombre', whatsapp: 'WhatsApp', telefono: 'teléfono',
  organizacion: 'organización', pais: 'país', habilidades: 'habilidades', ciudad: 'ciudad',
  disponibilidad: 'disponibilidad', horas_semana: 'horas por semana', experiencia: 'experiencia',
  contacto_emergencia: 'contacto de emergencia', roles_extra: 'roles adicionales',
  verificado: 'verificación', super_admin: 'permisos de superadmin', area_admin: 'área de administración',
  // Comunes a varias entidades
  estado: 'estado', etapa: 'etapa', titulo: 'título', nombre: 'nombre', descripcion: 'descripción',
  categoria: 'categoría', prioridad: 'prioridad', urgencia: 'urgencia', notas: 'notas', contenido: 'contenido',
  asignado_a: 'responsable', asignado: 'responsable', cupo: 'cupo', vence_en: 'fecha límite', fecha_limite: 'fecha límite',
  lider_id: 'líder', abierto: 'visibilidad', rol: 'rol', rol_en_grupo: 'rol en el grupo',
  capacidad: 'capacidad', camas_total: 'camas', camas_ocupadas: 'camas ocupadas', recibe: 'qué recibe',
  necesita: 'necesidades', horario: 'horario', direccion: 'dirección', lat: 'ubicación', lng: 'ubicación',
  cantidad: 'cantidad', producto: 'producto', fuente: 'fuente', motivo: 'motivo', enlace: 'enlace', ubicacion: 'ubicación',
};

// Traduce las columnas cambiadas a etiquetas legibles: ignora columnas no listadas,
// deduplica (lat/lng → «ubicación») y corta a 3 + «+N».
function camposLegibles(cambios: any): string[] {
  const out: string[] = []; const vistos = new Set<string>();
  for (const c of (Array.isArray(cambios) ? cambios : [])) {
    const et = CAMPO_LEGIBLE[c as string];
    if (!et || vistos.has(et)) continue;
    vistos.add(et); out.push(et);
  }
  return out.length > 3 ? [...out.slice(0, 3), `+${out.length - 3}`] : out;
}

function describir(accion: string, entidad: string, meta?: any, actorId?: string | null, entidadId?: string | null): string {
  const partes = accion.split(':');
  if (partes.length === 2) {
    const tabla = partes[0]!;
    const op = partes[1]!;
    // Casos: describir por lo que significa el cambio de estado, no solo "editó".
    if (tabla === 'casos') {
      if (op === 'insert') return 'creó una solicitud';
      if (op === 'delete') return 'eliminó una solicitud';
      if (op === 'edicion') return 'editó los datos de una solicitud';
      if (op === 'copia') return 'copió la información de una solicitud (Redacción)';
      if (op === 'descarga') return 'descargó la información de una solicitud (Redacción)';
      switch (meta?.estado) {
        case 'confirmado': return 'confirmó una solicitud';
        case 'falso': return 'descartó una solicitud';
        case 'enviado_redaccion': return 'envió una solicitud a Redacción';
        default: return 'actualizó una solicitud';
      }
    }
    // Captación de Oportunidades: describir por el movimiento de estado.
    if (tabla === 'oportunidades') {
      if (op === 'insert') return 'creó una oportunidad (Captación)';
      if (op === 'delete') return 'eliminó una oportunidad';
      const et: Record<string, string> = { investigacion: 'Investigación', verificado: 'Verificado', enviado: 'Enviado' };
      return et[meta?.estado as string] ? `movió una oportunidad a ${et[meta?.estado as string]}` : 'editó una oportunidad';
    }
    // Digitalización: moderación de lugares y verificación de listados.
    if (tabla === 'lugares') {
      if (op === 'insert') return 'registró un lugar';
      if (op === 'delete') return 'eliminó un lugar';
      return meta?.estado === 'verificado' ? 'verificó un lugar' : 'editó un lugar';
    }
    if (tabla === 'listados_digitalizados') {
      if (op === 'insert') return 'guardó un listado digitalizado';
      if (op === 'delete') return 'eliminó un listado digitalizado';
      if (meta?.estado === 'verificado') return 'verificó un listado digitalizado';
      if (meta?.estado === 'observado') return 'observó un listado digitalizado';
      return 'editó un listado digitalizado';
    }
    // Perfiles: describir QUÉ se editó (metadata.cambios) y de quién (propio vs. de otra persona).
    if (tabla === 'perfiles') {
      if (op === 'insert') return 'creó un perfil';
      if (op === 'delete') return 'eliminó un perfil';
      const etiquetas = camposLegibles(meta?.cambios);
      const propio = !!actorId && !!entidadId && actorId === entidadId;
      if (propio) {
        return etiquetas.length > 0 ? `actualizó su perfil (${etiquetas.join(', ')})` : 'editó su perfil';
      }
      const quien = meta?.nombre_completo ? ` de ${meta.nombre_completo}` : '';
      return etiquetas.length > 0 ? `editó el perfil${quien} (${etiquetas.join(', ')})` : `editó un perfil${quien}`;
    }
    // Tareas: describir por el estado (marcar como completada, etc.).
    if (tabla === 'tareas') {
      if (op === 'insert') return 'creó una tarea';
      if (op === 'delete') return 'eliminó una tarea';
      const cambios: string[] = Array.isArray(meta?.cambios) ? meta.cambios : [];
      const est = ETIQUETA_ESTADO[meta?.estado as keyof typeof ETIQUETA_ESTADO];
      if (est && cambios.includes('estado')) return `marcó una tarea como ${est}`;
      const cs = camposLegibles(cambios);
      return cs.length > 0 ? `editó una tarea (${cs.join(', ')})` : 'editó una tarea';
    }
    if (tabla === 'cedula') return 'consultó una cédula (CNE)';
    if (tabla === 'insumo') return 'cambió el estado de un insumo';
    // Genérico: en ediciones, listar los campos que cambiaron (metadata.cambios).
    const base = `${OPS[op] ?? op} ${ENTIDADES[tabla] ?? entidad ?? tabla}`;
    if (op === 'update') {
      const cs = camposLegibles(meta?.cambios);
      if (cs.length > 0) return `${base} (${cs.join(', ')})`;
    }
    return base;
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
      desc: describir(l.accion, l.entidad, l.metadata, l.actor_id, l.entidad_id),
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
                const extra = l.accion === 'perfiles:update' ? null : (l.metadata?.titulo || l.metadata?.nombre || l.metadata?.nombre_completo);
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
