// Qué secciones ve cada persona: se deriva de sus GRUPOS (clave de sistema) y
// de sus roles. El admin lo ve todo. Fuente única para el menú, el panel y Ayuda.
import { esAdministrador, esSuperadmin, areaDeAdmin, puedeSupervisarPsicosocial, rolesDe } from '@/lib/auth';
import type { Perfil, AreaAdmin } from '@unidos/types';

export type NavFlags = {
  admin: boolean;          // admin GENERAL (ve todo): controla las secciones globales
  panelAdmin: boolean;     // ve el panel de administración (general o de área)
  areaAdmin: AreaAdmin | null; // área que administra (null = general/no admin de área)
  gestionCasos: boolean;   // crea casos (ve solo los suyos)
  verificacion: boolean;   // verifica casos (Otras informaciones)
  busqueda: boolean;       // verifica casos de desaparecidos (Grupo de Búsqueda)
  enlace: boolean;         // Enlace de contacto: llamada de confirmación (2ª verif.)
  digitalizacion: boolean; // digitaliza listados de personas (OCR)
  envioRedaccion: boolean; // pasa confirmados a "enviado a redacción"
  contenido: boolean;      // produce y publica contenido (Redacción→Diseño→Redes)
  acopio: boolean;         // mapa + centros de acopio + insumos
  psicosocial: boolean;    // área confidencial (o supervisión si admin)
  aliados: boolean;        // base de datos de plataformas aliadas
  captacion: boolean;      // Captación de Oportunidades (contactos estratégicos)
};

// Grupos/roles del área de contenido (producción y publicación).
const CONTENIDO = ['redaccion', 'redes_sociales', 'diseno_grafico', 'edicion_video', 'influencers'];

export async function flagsDeNavegacion(supabase: any, userId: string, perfil: Perfil | null): Promise<NavFlags> {
  const admin = esAdministrador(perfil);
  // Admin de área (Verificaciones/Redes): ve el panel acotado a su área, pero NO es
  // admin general (no obtiene las secciones globales ni acceso a otras áreas). Sus
  // secciones operativas siguen dependiendo de los roles/grupos que tenga.
  const areaAdmin = admin || esSuperadmin(perfil) ? null : areaDeAdmin(perfil);
  const roles = rolesDe(perfil);
  let clavesLidero = new Set<string>();  // grupos que LIDERO (grupos.lider_id = yo)
  let identidadOK = false;               // 2ª verificación (identidad) aprobada
  if (!admin) {
    const [{ data: lid }, { data: vi }] = await Promise.all([
      supabase.from('grupos').select('clave').eq('lider_id', userId),
      supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', userId).maybeSingle(),
    ]);
    clavesLidero = new Set(((lid ?? []) as any[]).map((g) => g.clave).filter(Boolean));
    identidadOK = (vi as any)?.estado === 'aprobada';
  }
  // Recopilación y Búsqueda EXIGEN 2ª verificación: sin ella se ocultan Casos y
  // su grupo (la RLS además niega el acceso a los datos). Verificación: exenta.
  // Acceso a las secciones OPERATIVAS por el ROL, no por la sola membresía del grupo: un
  // «voluntario» es miembro del grupo SIN el rol (0154) y no debe ver estas secciones. Como
  // la membresía sí otorga el rol a los no-voluntarios (sincronizar_rol_grupo), pedir el rol
  // cubre a todos los operativos y deja fuera al voluntario.
  const esRecopilacion = roles.includes('recopilacion');
  // Búsqueda incluye al Buscador NNA (equipo de menores): comparten el módulo /busqueda.
  const esBusqueda = roles.includes('busqueda') || roles.includes('buscador_nna');
  const esEnlace = roles.includes('enlace_contacto');
  const esDigitalizador = roles.includes('digitalizador');
  // Verificación de Digitalización (0125): comparte el módulo /digitalizacion (revisa).
  const esVerifDigit = roles.includes('verificador_digitalizacion');
  // Supervisión por área (0105): el admin de área VE (solo lectura) las secciones
  // operativas de su área para supervisarlas; no las opera.
  const supVerif = areaAdmin === 'verificacion';
  const supRedes = areaAdmin === 'redes';
  const supLogistica = areaAdmin === 'logistica';
  const supDigit = areaAdmin === 'digitalizacion';
  return {
    admin,
    panelAdmin: admin || esSuperadmin(perfil) || !!areaAdmin,
    areaAdmin,
    gestionCasos: admin || supVerif || (esRecopilacion && identidadOK),
    verificacion: admin || supVerif || roles.includes('verificador'),
    busqueda: admin || supVerif || (esBusqueda && identidadOK),
    // Enlace de contacto: rol propio con 2ª verificación (identidad) obligatoria.
    enlace: admin || supVerif || (esEnlace && identidadOK),
    // Digitalización: ÁREA propia (0124) con 2ª verificación (identidad) obligatoria.
    // La supervisa SU admin de área (supDigit); el admin de Verificaciones ya NO (se
    // separó). «Mapa» aparece para este admin porque se muestra con `acopio || digitalizacion`.
    digitalizacion: admin || supDigit || ((esDigitalizador || esVerifDigit) && identidadOK),
    envioRedaccion: admin || supRedes || roles.includes('redaccion'),
    // El área de Contenido queda solo para el ADMIN y los LÍDERES de sus grupos.
    contenido: admin || supRedes || CONTENIDO.some((c) => clavesLidero.has(c)),
    acopio: admin || supLogistica || roles.includes('logistica'),
    psicosocial: puedeSupervisarPsicosocial(perfil),
    aliados: admin || roles.includes('lider_plataforma_aliada'),
    // Captación de Oportunidades (0129): rol propio 'captacion' (ve solo esta
    // sección) o el admin general. No exige 2ª verificación.
    captacion: admin || roles.includes('captacion'),
  };
}

// ¿El usuario lidera algún grupo de contenido? (para el acceso a /contenido).
export async function esLiderContenido(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('grupos').select('clave').eq('lider_id', userId).in('clave', CONTENIDO);
  return ((data ?? []) as any[]).length > 0;
}
