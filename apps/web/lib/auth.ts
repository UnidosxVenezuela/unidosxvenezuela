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

/** Exige rol de coordinación; redirige al panel si no lo tiene. */
export async function requireCoordinacion() {
  const res = await requireUsuario();
  if (!res.perfil || !COORDINACION.includes(res.perfil.rol)) redirect('/dashboard');
  return res;
}

export function esCoordinacion(rol?: Rol | null) {
  return !!rol && COORDINACION.includes(rol);
}

/** Superadmin (dueño): único que puede cambiar el rol de un admin. */
export function esSuperadmin(perfil?: { super_admin?: boolean } | null) {
  return !!perfil?.super_admin;
}

// Quién puede crear y asignar tareas. El resto (voluntario, observador)
// solo ve las tareas que le fueron asignadas.
const GESTION_TAREAS: Rol[] = ['admin', 'coordinador', 'lider_grupo'];

export function puedeGestionarTareas(rol?: Rol | null) {
  return !!rol && GESTION_TAREAS.includes(rol);
}

// Acceso a la base de datos compartida de endpoints aliados: admin + líder de plataforma aliada.
export function puedeVerAliados(rol?: Rol | null) {
  return rol === 'admin' || rol === 'lider_plataforma_aliada';
}

// Módulo de verificación de casos: coordinación o rol verificador.
export function puedeVerificar(rol?: Rol | null) {
  return rol === 'admin' || rol === 'coordinador' || rol === 'verificador';
}

// Quién puede ENVIAR/crear y ver casos: verificación + el rol de recopilación
// (recopilación solo envía: no puede cambiar el estado ni asignar).
export function puedeRecopilar(rol?: Rol | null) {
  return puedeVerificar(rol) || rol === 'recopilacion';
}

// Pipeline de producción de contenido (ve y trabaja en /contenido): coordinación
// o un rol de producción. Cada rol actúa solo en la etapa que le corresponde.
const PIPELINE: Rol[] = ['admin', 'coordinador', 'redaccion', 'diseno_grafico', 'edicion_video', 'redes_sociales'];
export function puedePipeline(rol?: Rol | null) {
  return !!rol && PIPELINE.includes(rol);
}
