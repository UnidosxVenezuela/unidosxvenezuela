// Versión imprimible (→ PDF) del listado de Solicitudes. Reaplica el mismo acceso que
// el tablero y REGISTRA la apertura de esta vista vía `registrar_auditoria`.
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminVerificacion, puedeVerificar, puedeBusqueda, puedeRecopilar, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import VistaImprimible from '@/components/VistaImprimible';
import { consultarSolicitudes, COLUMNAS_SOLICITUDES } from '@/lib/export/solicitudes';

type SP = { q?: string; estado?: string; categoria?: string };
export const dynamic = 'force-dynamic';

export default async function ImprimirSolicitudesPage({ searchParams }: { searchParams: SP }) {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const rolesU = rolesDe(perfil);
  const puedeVerif = puedeVerificar(perfil);
  const accesoBusqueda = puedeBusqueda(perfil);
  const supervisa = esAdminVerificacion(perfil);
  if (!puedeRecopilar(perfil) && !accesoBusqueda && !supervisa) redirect('/dashboard');
  const supabase = await createClient();
  const necesita2a = !esAdmin && !puedeVerif && (rolesU.includes('recopilacion') || rolesU.includes('busqueda') || supervisa);
  if (necesita2a) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') redirect('/casos');
  }

  const sp = { q: searchParams.q, estado: searchParams.estado, categoria: searchParams.categoria };
  const filas = await consultarSolicitudes(supabase, sp);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_pdf', p_entidad: 'casos', p_entidad_id: null,
    p_metadata: { listado: 'solicitudes', filas: filas.length, via: 'vista_imprimible', filtros: sp },
  });

  const qs = new URLSearchParams();
  if (searchParams.q) qs.set('q', searchParams.q);
  if (searchParams.estado) qs.set('estado', searchParams.estado);
  if (searchParams.categoria) qs.set('categoria', searchParams.categoria);
  const cola = qs.toString() ? '?' + qs.toString() : '';

  return (
    <VistaImprimible
      titulo="Solicitudes" subtitulo="Listado exportado"
      volverHref={'/casos' + cola} csvHref={'/casos/export' + cola}
      columnas={COLUMNAS_SOLICITUDES} filas={filas}
    />
  );
}
