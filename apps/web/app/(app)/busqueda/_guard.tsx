import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeBusqueda, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';

/**
 * Guard server-side de todo /busqueda* (no confiar en los flags del nav): exige
 * sesión, rol de Búsqueda y —para quien no es admin— la 2ª verificación de
 * identidad aprobada. La RLS es la red final; la página falla limpio.
 */
export async function guardBusqueda() {
  const { user, perfil } = await requireUsuario();
  if (!puedeBusqueda(perfil)) redirect('/dashboard');
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
      <div className="pagina-cab"><div><h1>Desaparecidos</h1></div></div>
      <div className="tarjeta" style={{ maxWidth: 560 }}>
        <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre="llave" size={20} /> Completa tu segunda verificación</h2>
        <p className="muted">Para trabajar casos de personas desaparecidas necesitas tu <strong>verificación de identidad</strong> aprobada.</p>
        <Link href="/verificacion" className="btn btn-primario"><Icono nombre="llave" size={16} /> Ir a mi verificación</Link>
      </div>
    </AnimarEntrada>
  );
}
