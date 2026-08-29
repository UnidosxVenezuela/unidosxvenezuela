import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Perfil, Rol, AreaAdmin } from '@unidos/types';

/** Devuelve el usuario autenticado y su perfil, o null si no hay sesión. */
export async function getUsuarioYPerfil() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, perfil: null as Perfil | null };

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const p = (perfil as Perfil) ?? null;

  // MANDO DE ÁREA (0214): quien LIDERA o COORDINA un grupo suele tener el rol principal
  // «coordinador»/«lider_grupo» pero NO el rol operativo de su área, así que las pantallas
  // (que miran los roles) lo dejaban fuera de su propia área. La RLS ya lo reconoce
  // —`puede_logistica()` incluye a `es_mando_logistica()`—; aquí se refleja lo mismo en la
  // app. No se INVENTA un rol (eso confundiría a Administración): se anota aparte, en
  // `mandos`, y las funciones de permiso lo consultan.
  // La RPC solo se llama cuando PUEDE cambiar algo: si ya tiene el rol operativo, o no es
  // coordinación/liderazgo de grupo, no hace falta ir a la base de datos.
  if (p) {
    const roles = rolesDe(p as EntradaRoles);
    const esCoordOLider = p.rol === 'coordinador' || p.rol === 'lider_grupo';
    const mandos: string[] = [];
    if (esCoordOLider) {
      if (!roles.some((r) => ['admin', 'logistica', 'admin_logistica'].includes(r))) {
        const { data: mandoLog } = await supabase.rpc('es_mando_logistica');
        if (mandoLog === true) mandos.push('logistica');
      }
      // Mando de Verificación (0147). Hace falta desde 0239: el líder o coordinador del
      // grupo es quien REPARTE los casos entre gestores, y sin esto la pantalla lo dejaba
      // fuera aunque la base de datos sí lo reconociera.
      if (!roles.some((r) => ['admin', 'admin_verificacion'].includes(r))) {
        const { data: mandoVer } = await supabase.rpc('es_mando_verificacion');
        if (mandoVer === true) mandos.push('verificacion');
      }
    }
    if (mandos.length > 0) (p as PerfilConMandos).mandos = mandos;
  }

  return { user, perfil: p };
}

/** Exige sesión; redirige a /login si no la hay. */
export async function requireUsuario() {
  const res = await getUsuarioYPerfil();
  if (!res.user) redirect('/login');
  return res;
}

// Nueva jerarquía: el COORDINADOR pertenece a un grupo y NO gestiona la
// plataforma. "Coordinación" (mando global) ahora es SOLO el admin.
const COORDINACION: Rol[] = ['admin'];

/**
 * Las funciones de permiso aceptan un rol suelto (compatibilidad) o el perfil
 * completo (para considerar también los roles adicionales, roles_extra). Un
 * usuario puede tener más de un rol: se evalúa el CONJUNTO de roles.
 */
// `mandos`: áreas que la persona LIDERA o COORDINA sin tener su rol operativo (0214).
// Lo rellena getUsuarioYPerfil; no viene de la tabla `perfiles`.
export type PerfilConMandos = Perfil & { mandos?: string[] };
type EntradaRoles =
  | Rol
  | { rol?: Rol | null; roles_extra?: Rol[] | null; mandos?: string[] | null }
  | null
  | undefined;
/** ¿La persona es MANDO (líder/coordinador) de esta área, aunque no tenga su rol? */
export function esMandoDe(e: EntradaRoles, area: string): boolean {
  return typeof e === 'object' && e !== null && Array.isArray(e.mandos) && e.mandos.includes(area);
}
export function rolesDe(e: EntradaRoles): Rol[] {
  if (!e) return [];
  if (typeof e === 'string') return [e];
  const arr: Rol[] = [];
  if (e.rol) arr.push(e.rol);
  if (Array.isArray(e.roles_extra)) arr.push(...e.roles_extra);
  return arr;
}
const tieneAlguno = (e: EntradaRoles, roles: Rol[]) => rolesDe(e).some((r) => roles.includes(r));

/** Exige rol de coordinación; redirige al panel si no lo tiene. */
export async function requireCoordinacion() {
  const res = await requireUsuario();
  if (!esCoordinacion(res.perfil)) redirect('/dashboard');
  return res;
}

/**
 * Exige acceso al panel de administración: admin GENERAL / superadmin (ve y
 * administra todo) o admin de ÁREA (acotado a su área). Devuelve `area`:
 *   · null → admin general o superadmin (sin acotar).
 *   · 'verificacion' | 'redes' → admin de esa área (la vista y las acciones se
 *     acotan a su área en la página y en las Server Actions).
 * Redirige al panel a quien no tenga ninguno de esos accesos.
 */
export async function requirePanelAdmin() {
  const res = await requireUsuario();
  const general = esAdministrador(res.perfil) || esSuperadmin(res.perfil);
  const area = general ? null : areaDeAdmin(res.perfil);
  if (!general && !area) redirect('/dashboard');
  return { ...res, area };
}

export function esCoordinacion(e?: EntradaRoles) {
  return tieneAlguno(e, COORDINACION);
}

/** ¿Es administrador? (rol principal o adicional). El admin tiene acceso total. */
export function esAdministrador(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin']);
}

/** Superadmin (dueño): único que puede cambiar el rol de un admin. */
export function esSuperadmin(perfil?: { super_admin?: boolean } | null) {
  return !!perfil?.super_admin;
}

/** Admin GENERAL o superadmin (dueño): ambos administran todo. Úsalo para las
 *  acciones de gobierno (p. ej. gestionar el liderazgo/eliminación de un grupo),
 *  donde el superadmin debe contar como administrador aunque no tenga el rol 'admin'. */
export function esAdminGeneral(perfil?: Perfil | null) {
  return esAdministrador(perfil) || esSuperadmin(perfil);
}

// ── Administración por ÁREA (0103) ──
// Un admin de área gestiona SOLO su área (sus grupos y las solicitudes correspondientes).
// NO es admin general (`esAdministrador` sigue siendo exclusivo de 'admin'): no ve ni
// administra todo. El admin general y el superadmin siguen viéndolo/administrándolo todo.
export function esAdminVerificacion(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin_verificacion']);
}
export function esAdminRedes(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin_redes']);
}
export function esAdminLogistica(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin_logistica']);
}
export function esAdminDigitalizacion(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin_digitalizacion']);
}
/** ¿Es administrador de alguna área (Verificaciones, Redes, Logística o Digitalización)? */
export function esAdminArea(e?: EntradaRoles) {
  return esAdminVerificacion(e) || esAdminRedes(e) || esAdminLogistica(e) || esAdminDigitalizacion(e);
}
/** Área que administra esta persona (o null si no es admin de área). */
export function areaDeAdmin(e?: EntradaRoles): AreaAdmin | null {
  if (esAdminVerificacion(e)) return 'verificacion';
  if (esAdminRedes(e)) return 'redes';
  if (esAdminLogistica(e)) return 'logistica';
  if (esAdminDigitalizacion(e)) return 'digitalizacion';
  return null;
}

// Quién puede crear y asignar tareas. El resto (voluntario, observador)
// solo ve las tareas que le fueron asignadas.
// El coordinador también crea tareas (la RLS lo limita a SU grupo).
const GESTION_TAREAS: Rol[] = ['admin', 'lider_grupo', 'coordinador'];

export function puedeGestionarTareas(e?: EntradaRoles) {
  return tieneAlguno(e, GESTION_TAREAS);
}

// Acceso a la base de datos compartida de endpoints aliados: admin + líder de plataforma aliada.
export function puedeVerAliados(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'lider_plataforma_aliada']);
}

// Módulo de verificación de casos: coordinación o rol verificador.
export function puedeVerificar(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'verificador']);
}

// Gestor Integral de Casos (0239): dueño transversal del caso hasta su cierre.
export function esGestorCasos(e?: EntradaRoles) {
  return tieneAlguno(e, ['gestor_casos']);
}

// Quién REPARTE los casos. Decisión de la organización: el líder o administración —
// ni automático ni «tomar»—. `esMandoDe` cubre al líder y al coordinador del grupo de
// Verificación aunque no lleven el rol operativo, igual que hace `es_mando_verificacion()`
// en la base de datos.
export function puedeAsignarGestor(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin']) || esMandoDe(e as any, 'verificacion');
}

// Quién puede ENVIAR/crear y ver casos: verificación + el rol de recopilación
// (recopilación solo envía: no puede cambiar el estado ni asignar).
export function puedeRecopilar(e?: EntradaRoles) {
  return puedeVerificar(e) || tieneAlguno(e, ['recopilacion']);
}

// Grupo de Búsqueda: verifica los casos de personas DESAPARECIDAS (los casos
// «Otras informaciones» quedan para Verificación). Incluye al Buscador NNA, que
// atiende solo menores (la RLS separa las colas: adultos vs menores). La RLS aplica
// la frontera por categoría y exige 2ª verificación (identidad aprobada).
export function puedeBusqueda(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'busqueda', 'buscador_nna']);
}

// ¿Es Buscador NNA? (atiende exclusivamente casos de menores de edad).
export function esBuscadorNna(e?: EntradaRoles) {
  return tieneAlguno(e, ['buscador_nna']);
}

// Enlace de contacto: tras aprobar una coincidencia, llama a la familia y cierra el
// caso (reunificación). La RLS y las funciones DEFINER exigen 2ª verificación.
export function puedeEnlace(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'enlace_contacto']);
}

// Digitalización de listados de personas (OCR): rol propio 'digitalizador'
// (Grupo de Digitalización) y admin. La 2ª verificación obligatoria para el
// digitalizador la imponen la página/acción y la RLS (0081).
export function puedeDigitalizar(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'digitalizador', 'admin_digitalizacion', 'verificador_digitalizacion']);
}

// Verificación de Digitalización (0125): revisa/corrige los listados digitalizados
// antes de que se dispare el cruce con desaparecidos. Rol propio dentro del área de
// Digitalización. La 2ª verificación (identidad) es obligatoria (la imponen página,
// acción y RLS): maneja datos sensibles de víctimas (heridos/fallecidos/NNA).
export function esVerificadorDigitalizacion(e?: EntradaRoles) {
  return tieneAlguno(e, ['verificador_digitalizacion']);
}
export function puedeVerificarDigitalizacion(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'verificador_digitalizacion']);
}

// ── Departamento de Alianzas Estratégicas (0129 → 0198 → 0216) ──
// Desde 0216 el departamento tiene UN SOLO rol operativo: 'captacion' (la clave
// histórica del enum, reetiquetada «Alianzas Estratégicas» en toda la interfaz). Los
// roles 'prospeccion' y 'afiliacion' quedaron unificados en él; un valor de enum no se
// puede borrar, así que siguen existiendo pero ya nadie los tiene y no se asignan.
// El departamento no maneja datos de víctimas: NO exige 2ª verificación.

/** ¿Tiene el rol del departamento? (clave histórica 'captacion'). */
export function esCaptacion(e?: EntradaRoles) {
  return tieneAlguno(e, ['captacion']);
}
export function puedeCaptacion(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'captacion']);
}

/** Cualquier integrante del departamento (o el admin): registro de aliados,
 *  base de Afiliación, reportería y bitácora de las solicitudes escaladas.
 *  Se conservan los tres literales: 'prospeccion'/'afiliacion' son residuo inerte. */
export function puedeAlianzas(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'captacion', 'prospeccion', 'afiliacion']);
}

// Alias del rol unificado (0216). `esProspeccion`/`esAfiliacion` siguen mirando el rol
// literal —sirven para reconocer un residuo— pero `puedeProspeccion`/`puedeAfiliacion`
// DELEGAN en el departamento: si no, /afiliacion quedaría inaccesible para todos, porque
// tras la migración NADIE tiene el rol 'afiliacion'. Espejo exacto de las funciones SQL
// puede_prospeccion() / puede_afiliacion() de 0216.
export function esProspeccion(e?: EntradaRoles) {
  return tieneAlguno(e, ['prospeccion']);
}
export function puedeProspeccion(e?: EntradaRoles) {
  return puedeAlianzas(e);
}
export function esAfiliacion(e?: EntradaRoles) {
  return tieneAlguno(e, ['afiliacion']);
}
export function puedeAfiliacion(e?: EntradaRoles) {
  return puedeAlianzas(e);
}

// ¿El conjunto de roles de esta persona EXIGE la 2ª verificación (identidad) para
// operar? (recopilación, búsqueda, digitalización). El admin queda exento. Se usa
// para mostrar el aviso de «completa tu segunda verificación» a quien corresponde.
const ROLES_2A: Rol[] = ['recopilacion', 'busqueda', 'buscador_nna', 'enlace_contacto', 'digitalizador', 'verificador_digitalizacion'];
export function necesitaSegundaVerificacion(e?: EntradaRoles) {
  return !esAdministrador(e) && tieneAlguno(e, ROLES_2A);
}

// Pipeline de producción de contenido (ve y trabaja en /contenido): admin o un
// rol de producción. Cada rol actúa en su etapa; el influencer, en cualquiera.
const PIPELINE: Rol[] = ['admin', 'coordinador', 'redaccion', 'redes_sociales', 'diseno_grafico', 'edicion_video', 'influencers'];
export function puedePipeline(e?: EntradaRoles) {
  return tieneAlguno(e, PIPELINE);
}

// Módulo de insumos / logística: coordinación, rol logística o el admin del área
// Logística y Acopio gestionan el flujo.
export function puedeLogistica(e?: EntradaRoles) {
  // El líder y los coordinadores del grupo de Logística operan su área (0214), igual que
  // ya los reconoce la RLS con `puede_logistica()`.
  return tieneAlguno(e, ['admin', 'logistica', 'admin_logistica']) || esMandoDe(e, 'logistica');
}

// ¿Puede REGISTRAR (crear) un «Donación-Ofrecimiento»? SOLO Recopilación (que CAPTA las
// ofertas) y el admin general. Los demás NO crean: Logística GESTIONA (contacta, empareja,
// avanza estado), Verificación VERIFICA, la Administración de Verificaciones supervisa y
// Captación consulta. Gatea el FORMULARIO de alta y la Server Action; la 0153 lo refuerza
// en la RLS.
export function puedeRegistrarOportunidad(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'recopilacion']);
}

// ¿Puede ENTRAR a la sección «Donación-Ofrecimiento»? Quien crea (Recopilación/admin) +
// Logística (gestiona) + Verificación (verifica) + Administración de Verificaciones
// (supervisa) + Captación (consulta). Cada rol ve/hace lo suyo; solo Recopilación da de alta.
export function puedeVerOportunidades(e?: EntradaRoles) {
  return puedeRegistrarOportunidad(e) || puedeLogistica(e) || puedeVerificar(e) || esAdminVerificacion(e) || esCaptacion(e);
}

// Área confidencial de Apoyo Psicosocial. Por privacidad, el acceso NO se rige
// por admin/coordinación general: solo el equipo psicosocial entra al módulo.
export function puedePsicosocial(e?: EntradaRoles) {
  return tieneAlguno(e, ['apoyo_psicosocial', 'coordinador_psicosocial']);
}

// Coordinación del área psicosocial: ve todos los casos, asigna y gestiona recursos.
export function esCoordPsicosocial(e?: EntradaRoles) {
  return tieneAlguno(e, ['coordinador_psicosocial']);
}

// Mando del grupo Psicosocial (Coordinador o Líder): gestiona la membresía y
// publica en SU grupo. El Líder NO ve los casos confidenciales (eso queda para
// el Coordinador y el profesional asignado): solo gestiona el grupo.
export function esMandoPsicosocial(e?: EntradaRoles) {
  return tieneAlguno(e, ['coordinador_psicosocial', 'lider_psicosocial']);
}

// Quién puede ENTRAR al área psicosocial: el equipo (ve/atiende casos) y el
// admin, pero el admin SOLO en modo supervisión (resumen agregado, sin ver los
// casos ni la bitácora). La confidencialidad de los casos la mantiene la RLS.
export function puedeSupervisarPsicosocial(e?: EntradaRoles) {
  return esAdministrador(e) || puedePsicosocial(e);
}
