import { redirect } from 'next/navigation';
import { requireUsuario, puedeBusqueda, puedeEnlace, esAdministrador, esAdminVerificacion, esBuscadorNna, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import AvisoSegundaVerificacion from '@/components/AvisoSegundaVerificacion';

/**
 * Guard server-side de todo /busqueda* (no confiar en los flags del nav): exige
 * sesión, rol de Búsqueda y —para quien no es admin— la 2ª verificación de
 * identidad aprobada. La RLS es la red final; la página falla limpio.
 */
export async function guardBusqueda() {
  const { user, perfil } = await requireUsuario();
  // El Enlace de contacto también entra a /busqueda* (abre y valida los casos en
  // etapa de coincidencia); la RLS limita lo que ve a esa etapa. El Admin de
  // Verificaciones entra como SUPERVISOR (solo lectura; la RLS bloquea la escritura).
  const supervisa = esAdminVerificacion(perfil);
  if (!puedeBusqueda(perfil) && !puedeEnlace(perfil) && !supervisa) redirect('/dashboard');
  const supabase = await createClient();
  const esAdmin = esAdministrador(perfil);
  // Equipo de menores (NNA) vs buscador general de adultos. El admin y el mando ven
  // ambas colas; el buscador general, solo adultos; el Buscador NNA, solo menores.
  const nna = esBuscadorNna(perfil);
  const general = rolesDe(perfil).includes('busqueda');
  const enlace = puedeEnlace(perfil);
  // El Admin de Verificaciones opera /busqueda como mando de su área, pero EXIGE su 2ª
  // verificación (identidad) aprobada (el RPC es_mando_busqueda aplica el mismo criterio).
  let identidadOk = esAdmin;
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    identidadOk = (vi as any)?.estado === 'aprobada';
  }
  return { user: user!, perfil, supabase, esAdmin, identidadOk, esBuscadorNna: nna, esBuscadorGeneral: general, esEnlace: enlace };
}

/** Guard de /busqueda/enlace: rol Enlace de contacto (o admin) + 2ª verificación. */
export async function guardEnlace() {
  const { user, perfil } = await requireUsuario();
  const supervisa = esAdminVerificacion(perfil);
  if (!puedeEnlace(perfil) && !supervisa) redirect('/dashboard');
  const supabase = await createClient();
  const esAdmin = esAdministrador(perfil);
  let identidadOk = esAdmin;
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    identidadOk = (vi as any)?.estado === 'aprobada';
  }
  return { user: user!, perfil, supabase, esAdmin, identidadOk };
}

/** Panel que se muestra a un buscador sin la 2ª verificación aprobada. */
export function PanelVerificacion() {
  return (
    <AnimarEntrada>
      <div className="pagina-cab"><div><h1 className="fila" style={{ gap: 8 }}><Icono nombre="usuario" size={24} /> Desaparecidos</h1></div></div>
      <AvisoSegundaVerificacion titulo="Completa tu segunda verificación para trabajar casos de desaparecidos" />
    </AnimarEntrada>
  );
}
