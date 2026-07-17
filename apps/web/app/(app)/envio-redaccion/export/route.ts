// Descarga CSV de Envío a Redacción (casos confirmados + enviados). Reaplica el
// mismo acceso que la vista (admin, admin de redes o rol redacción) y REGISTRA la
// descarga vía `registrar_auditoria`.
import { NextResponse } from 'next/server';
import { requireUsuario, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarRedaccion, COLUMNAS_REDACCION } from '@/lib/export/redaccion';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { perfil } = await requireUsuario();
  const puede = esAdministrador(perfil) || esAdminRedes(perfil) || rolesDe(perfil).includes('redaccion');
  if (!puede) return NextResponse.json({ error: 'sin permiso' }, { status: 403 });

  const supabase = await createClient();
  const filas = await consultarRedaccion(supabase);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'casos', p_entidad_id: null,
    p_metadata: { listado: 'redaccion', filas: filas.length },
  });

  return respuestaCsv('envio-redaccion', csvDesde(COLUMNAS_REDACCION, filas));
}
