// Qué secciones ve cada persona: se deriva de sus GRUPOS (clave de sistema) y
// de sus roles. El admin lo ve todo. Fuente única para el menú, el panel y Ayuda.
import { esAdministrador, puedeSupervisarPsicosocial, rolesDe } from '@/lib/auth';
import type { Perfil } from '@unidos/types';

export type NavFlags = {
  admin: boolean;
  gestionCasos: boolean;   // crea casos (ve solo los suyos)
  verificacion: boolean;   // verifica casos (Otras informaciones)
  busqueda: boolean;       // verifica casos de desaparecidos (Grupo de Búsqueda)
  envioRedaccion: boolean; // pasa confirmados a "enviado a redacción"
  contenido: boolean;      // produce y publica contenido (Redacción→Diseño→Redes)
  acopio: boolean;         // mapa + centros de acopio + insumos
  psicosocial: boolean;    // área confidencial (o supervisión si admin)
  aliados: boolean;        // base de datos de plataformas aliadas
};

// Grupos/roles del área de contenido (producción y publicación).
const CONTENIDO = ['redaccion', 'redes_sociales', 'diseno_grafico', 'edicion_video', 'influencers'];

export async function flagsDeNavegacion(supabase: any, userId: string, perfil: Perfil | null): Promise<NavFlags> {
  const admin = esAdministrador(perfil);
  const roles = rolesDe(perfil);
  let claves = new Set<string>();
  let clavesLidero = new Set<string>();  // grupos que LIDERO (grupos.lider_id = yo)
  let identidadOK = false;               // 2ª verificación (identidad) aprobada
  if (!admin) {
    const [{ data: mem }, { data: lid }, { data: vi }] = await Promise.all([
      supabase.from('miembros_grupo').select('grupos(clave)').eq('perfil_id', userId),
      supabase.from('grupos').select('clave').eq('lider_id', userId),
      supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', userId).maybeSingle(),
    ]);
    claves = new Set(((mem ?? []) as any[]).map((m) => m.grupos?.clave).filter(Boolean));
    clavesLidero = new Set(((lid ?? []) as any[]).map((g) => g.clave).filter(Boolean));
    identidadOK = (vi as any)?.estado === 'aprobada';
  }
  // Recopilación y Búsqueda EXIGEN 2ª verificación: sin ella se ocultan Casos y
  // su grupo (la RLS además niega el acceso a los datos). Verificación: exenta.
  const esRecopilacion = claves.has('gestion_casos') || roles.includes('recopilacion');
  const esBusqueda = claves.has('busqueda') || roles.includes('busqueda');
  return {
    admin,
    gestionCasos: admin || (esRecopilacion && identidadOK),
    verificacion: admin || claves.has('verificacion') || roles.includes('verificador'),
    busqueda: admin || (esBusqueda && identidadOK),
    envioRedaccion: admin || claves.has('redaccion') || roles.includes('redaccion'),
    // El área de Contenido queda solo para el ADMIN y los LÍDERES de sus grupos.
    contenido: admin || CONTENIDO.some((c) => clavesLidero.has(c)),
    acopio: admin || claves.has('gestion_acopio') || roles.includes('logistica'),
    psicosocial: puedeSupervisarPsicosocial(perfil),
    aliados: admin || roles.includes('lider_plataforma_aliada'),
  };
}

// ¿El usuario lidera algún grupo de contenido? (para el acceso a /contenido).
export async function esLiderContenido(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('grupos').select('clave').eq('lider_id', userId).in('clave', CONTENIDO);
  return ((data ?? []) as any[]).length > 0;
}
