// Descarga CSV del listado de Solicitudes (casos). Reaplica el MISMO acceso que el
// tablero (RLS + rol + 2ª verificación de identidad) y REGISTRA la descarga (quién,
// cuándo, cuántas filas y con qué filtros) vía `registrar_auditoria`.
import { NextResponse } from 'next/server';
import { requireUsuario, esAdministrador, esAdminVerificacion, puedeVerificar, puedeBusqueda, puedeRecopilar, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarSolicitudes, COLUMNAS_SOLICITUDES } from '@/lib/export/solicitudes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const rolesU = rolesDe(perfil);
  const puedeVerif = puedeVerificar(perfil);
  const accesoBusqueda = puedeBusqueda(perfil);
  const supervisa = esAdminVerificacion(perfil);
  if (!puedeRecopilar(perfil) && !accesoBusqueda && !supervisa) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 });
  }
  const supabase = await createClient();
  // Mismo candado de identidad que el tablero para recopilación/búsqueda/supervisión.
  const necesita2a = !esAdmin && !puedeVerif && (rolesU.includes('recopilacion') || rolesU.includes('busqueda') || supervisa);
  if (necesita2a) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') return NextResponse.json({ error: 'identidad no verificada' }, { status: 403 });
  }

  const p = new URL(req.url).searchParams;
  const sp = { q: p.get('q') ?? undefined, estado: p.get('estado') ?? undefined, categoria: p.get('categoria') ?? undefined };
  const filas = await consultarSolicitudes(supabase, sp);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'casos', p_entidad_id: null,
    p_metadata: { listado: 'solicitudes', filas: filas.length, filtros: sp },
  });

  return respuestaCsv('solicitudes', csvDesde(COLUMNAS_SOLICITUDES, filas));
}
