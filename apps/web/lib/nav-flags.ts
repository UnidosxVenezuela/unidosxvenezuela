// Qué secciones ve cada persona: se deriva de sus GRUPOS (clave de sistema) y
// de sus roles. El admin lo ve todo. Fuente única para el menú, el panel y Ayuda.
import { esAdministrador, puedeSupervisarPsicosocial, rolesDe } from '@/lib/auth';
import type { Perfil } from '@unidos/types';

export type NavFlags = {
  admin: boolean;
  gestionCasos: boolean;   // crea casos (ve solo los suyos)
  verificacion: boolean;   // verifica casos
  envioRedaccion: boolean; // pasa confirmados a "enviado a redacción"
  acopio: boolean;         // mapa + centros de acopio + insumos
  psicosocial: boolean;    // área confidencial (o supervisión si admin)
  aliados: boolean;        // base de datos de plataformas aliadas
};

export async function flagsDeNavegacion(supabase: any, userId: string, perfil: Perfil | null): Promise<NavFlags> {
  const admin = esAdministrador(perfil);
  const roles = rolesDe(perfil);
  let claves = new Set<string>();
  if (!admin) {
    const { data } = await supabase.from('miembros_grupo').select('grupos(clave)').eq('perfil_id', userId);
    claves = new Set(((data ?? []) as any[]).map((m) => m.grupos?.clave).filter(Boolean));
  }
  return {
    admin,
    gestionCasos: admin || claves.has('gestion_casos') || roles.includes('recopilacion'),
    verificacion: admin || claves.has('verificacion') || roles.includes('verificador'),
    envioRedaccion: admin || claves.has('envio_redaccion') || roles.includes('envio_redaccion'),
    acopio: admin || claves.has('gestion_acopio') || roles.includes('logistica'),
    psicosocial: puedeSupervisarPsicosocial(perfil),
    aliados: admin || roles.includes('lider_plataforma_aliada'),
  };
}
