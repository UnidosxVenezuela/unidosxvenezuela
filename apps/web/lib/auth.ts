import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Perfil, Rol } from '@unidos/types';

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

  return { user, perfil: (perfil as Perfil) ?? null };
}

/** Exige sesión; redirige a /login si no la hay. */
export async function requireUsuario() {
  const res = await getUsuarioYPerfil();
  if (!res.user) redirect('/login');
  return res;
}

const COORDINACION: Rol[] = ['admin', 'coordinador'];

/**
 * Las funciones de permiso aceptan un rol suelto (compatibilidad) o el perfil
 * completo (para considerar también los roles adicionales, roles_extra). Un
 * usuario puede tener más de un rol: se evalúa el CONJUNTO de roles.
 */
type EntradaRoles = Rol | { rol?: Rol | null; roles_extra?: Rol[] | null } | null | undefined;
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

// Quién puede crear y asignar tareas. El resto (voluntario, observador)
// solo ve las tareas que le fueron asignadas.
const GESTION_TAREAS: Rol[] = ['admin', 'coordinador', 'lider_grupo'];

export function puedeGestionarTareas(e?: EntradaRoles) {
  return tieneAlguno(e, GESTION_TAREAS);
}

// Acceso a la base de datos compartida de endpoints aliados: admin + líder de plataforma aliada.
export function puedeVerAliados(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'lider_plataforma_aliada']);
}

// Módulo de verificación de casos: coordinación o rol verificador.
export function puedeVerificar(e?: EntradaRoles) {
  return tieneAlguno(e, ['admin', 'coordinador', 'verificador']);
}

// Quién puede ENVIAR/crear y ver casos: verificación + el rol de recopilación
// (recopilación solo envía: no puede cambiar el estado ni asignar).
export function puedeRecopilar(e?: EntradaRoles) {
  return puedeVerificar(e) || tieneAlguno(e, ['recopilacion']);
}

// Pipeline de producción de contenido (ve y trabaja en /contenido): coordinación
// o un rol de producción. Cada rol actúa solo en la etapa que le corresponde.
const PIPELINE: Rol[] = ['admin', 'coordinador', 'redaccion', 'diseno_grafico', 'edicion_video', 'redes_sociales'];
export function puedePipeline(e?: EntradaRoles) {
  return tieneAlguno(e, PIPELINE);
}
