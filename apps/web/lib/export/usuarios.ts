// Datos y columnas para EXPORTAR el listado de usuarios (Administración) con su
// ÚLTIMA CONEXIÓN. Reaplica el MISMO alcance que la página /admin/usuarios: el admin
// general ve a todos; el admin de área ve solo a los usuarios de SU área (por área de
// registro, rol funcional o pertenencia/liderazgo de un grupo del área) y nunca a
// cuentas protegidas. El correo vive en auth.users → se lee con la service key
// (solo servidor); degrada limpio si no está configurada.
import type { Columna } from '@/lib/csv';
import { ETIQUETA_ROL, etiquetaPais, ROLES_POR_AREA_ADMIN, GRUPOS_POR_AREA_ADMIN } from '@/lib/constantes';
import { esEmailInternoWhatsapp } from '@/lib/whatsapp';
import { fechaHora } from '@/lib/fechas';
import { presenciaEfectiva, ETIQUETA_PRESENCIA } from '@/lib/presencia';

export type FiltrosUsuarios = { q?: string; frol?: string; fest?: string };

export type FilaUsuario = {
  nombre: string; correo: string; whatsapp: string; telefono: string;
  rol: string; rolesExtra: string; area: string; pais: string; ciudad: string;
  organizacion: string; cuentaVerif: string; identidadVerif: string;
  presencia: string; ultimaConexion: string; registrado: string;
};

const ROL_ET = (r: string) => (ETIQUETA_ROL as Record<string, string>)[r] ?? r ?? '';
// Roles «protegidos» (no visibles al admin de área): mismos que en /admin/usuarios.
const ROLES_PROTEGIDOS = ['admin', 'admin_verificacion', 'admin_redes', 'admin_logistica', 'admin_digitalizacion'];

/**
 * Filas del reporte de usuarios. `area` = null para el admin general (todos),
 * o la clave de área para el admin de área (acotado a su gente). Filtros y alcance
 * idénticos a la página para que el CSV muestre exactamente lo visible.
 */
export async function consultarUsuariosReporte(
  supabase: any, adminClient: any, area: string | null, f: FiltrosUsuarios,
): Promise<FilaUsuario[]> {
  const { data } = await supabase.from('perfiles')
    .select('id, nombre_completo, telefono, whatsapp, rol, roles_extra, verificado, super_admin, organizacion, area_registro, pais, ciudad, estado_presencia, ultima_conexion, creado_en')
    .order('ultima_conexion', { ascending: false, nullsFirst: false });
  let perfiles = (data ?? []) as any[];

  // Identidad verificada (2ª verificación aprobada) por persona.
  const { data: idsVerif } = await supabase.from('verificaciones_identidad').select('perfil_id').eq('estado', 'aprobada');
  const identidadOK = new Set<string>((idsVerif ?? []).map((v: any) => v.perfil_id));

  // Claves de grupo por persona + grupos (solo si hay que acotar por área).
  const clavesPorPerfil = new Map<string, string[]>();
  let grupos: any[] = [];
  if (area) {
    const { data: gruposData } = await supabase.from('grupos').select('id, clave, lider_id');
    grupos = (gruposData ?? []) as any[];
    const { data: membresias } = await supabase.from('miembros_grupo').select('perfil_id, grupos(clave)');
    (membresias ?? []).forEach((m: any) => {
      if (m.grupos?.clave) { const cs = clavesPorPerfil.get(m.perfil_id) ?? []; cs.push(m.grupos.clave); clavesPorPerfil.set(m.perfil_id, cs); }
    });
  }

  // Buscador y filtros (mismos que la página, sobre la lista ya cargada).
  const q = (f.q ?? '').trim().toLowerCase();
  if (q) perfiles = perfiles.filter((p) =>
    (p.nombre_completo ?? '').toLowerCase().includes(q)
    || (p.organizacion ?? '').toLowerCase().includes(q)
    || (p.whatsapp ?? '').includes(q.replace(/\D/g, '') || q)
    || (p.telefono ?? '').includes(q));
  if (f.frol) perfiles = perfiles.filter((p) => p.rol === f.frol || (p.roles_extra ?? []).includes(f.frol));
  if (f.fest === 'verificado') perfiles = perfiles.filter((p) => p.verificado);
  if (f.fest === 'pendiente') perfiles = perfiles.filter((p) => !p.verificado);

  // Admin de área: acotar a SU gente (idéntico a page.tsx), nunca cuentas protegidas.
  if (area) {
    const rolesArea = (ROLES_POR_AREA_ADMIN as Record<string, string[]>)[area] ?? [];
    const clavesArea = (GRUPOS_POR_AREA_ADMIN as Record<string, string[]>)[area] ?? [];
    const ledPorPerfil = new Map<string, string[]>();
    grupos.forEach((g: any) => { if (g.lider_id && g.clave) { const a = ledPorPerfil.get(g.lider_id) ?? []; a.push(g.clave); ledPorPerfil.set(g.lider_id, a); } });
    const protegido = (p: any) => p.super_admin
      || [p.rol, ...(p.roles_extra ?? [])].some((r: string) => ROLES_PROTEGIDOS.includes(r));
    const enMiArea = (p: any) => {
      if (protegido(p)) return false;
      if (p.area_registro === area) return true;
      if ([p.rol, ...(p.roles_extra ?? [])].some((r: string) => rolesArea.includes(r))) return true;
      if ((clavesPorPerfil.get(p.id) ?? []).some((c) => clavesArea.includes(c))) return true;
      if ((ledPorPerfil.get(p.id) ?? []).some((c) => clavesArea.includes(c))) return true;
      return false;
    };
    perfiles = perfiles.filter(enMiArea);
  }

  // Correos (auth.users, solo servidor con service key). Best-effort: sin la key,
  // el reporte sale sin correos pero no falla.
  const correoPorId = new Map<string, string>();
  if (adminClient) {
    try {
      for (let page = 1; page <= 20; page++) {
        const { data: lista, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        const usuarios = lista?.users ?? [];
        if (error || usuarios.length === 0) break;
        for (const u of usuarios) if (u.email && !esEmailInternoWhatsapp(u.email)) correoPorId.set(u.id, u.email);
        if (usuarios.length < 1000) break;
      }
    } catch { /* sin service key → sin correos */ }
  }

  return perfiles.map((p) => ({
    nombre: p.nombre_completo ?? '',
    correo: correoPorId.get(p.id) ?? '',
    whatsapp: p.whatsapp ?? '',
    telefono: p.telefono ?? '',
    rol: ROL_ET(p.rol),
    rolesExtra: (p.roles_extra ?? []).map(ROL_ET).join('; '),
    area: p.area_registro ?? '',
    pais: p.pais ? (etiquetaPais(p.pais) || p.pais) : '',
    ciudad: p.ciudad ?? '',
    organizacion: p.organizacion ?? '',
    cuentaVerif: p.verificado ? 'Sí' : 'No',
    identidadVerif: identidadOK.has(p.id) ? 'Sí' : 'No',
    presencia: ETIQUETA_PRESENCIA[presenciaEfectiva(p.estado_presencia, p.ultima_conexion)],
    ultimaConexion: p.ultima_conexion ? fechaHora(p.ultima_conexion) : 'Nunca',
    registrado: p.creado_en ? fechaHora(p.creado_en) : '',
  }));
}

export const COLUMNAS_USUARIOS: Columna<FilaUsuario>[] = [
  { encabezado: 'Nombre', valor: (u) => u.nombre },
  { encabezado: 'Correo', valor: (u) => u.correo },
  { encabezado: 'WhatsApp', valor: (u) => u.whatsapp },
  { encabezado: 'Teléfono', valor: (u) => u.telefono },
  { encabezado: 'Rol', valor: (u) => u.rol },
  { encabezado: 'Roles adicionales', valor: (u) => u.rolesExtra },
  { encabezado: 'Área', valor: (u) => u.area },
  { encabezado: 'País', valor: (u) => u.pais },
  { encabezado: 'Ciudad', valor: (u) => u.ciudad },
  { encabezado: 'Organización', valor: (u) => u.organizacion },
  { encabezado: 'Cuenta verificada', valor: (u) => u.cuentaVerif },
  { encabezado: 'Identidad verificada', valor: (u) => u.identidadVerif },
  { encabezado: 'Presencia', valor: (u) => u.presencia },
  { encabezado: 'Última conexión', valor: (u) => u.ultimaConexion },
  { encabezado: 'Registrado', valor: (u) => u.registrado },
];
