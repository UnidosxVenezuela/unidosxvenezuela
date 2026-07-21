// Descarga CSV de la Analítica de Difusión. Reaplica el mismo acceso que la vista
// (admin, admin de redes o rol redacción) y REGISTRA la descarga vía
// `registrar_auditoria`. CSV en formato largo (Sección · Concepto · Valor).
import { NextResponse } from 'next/server';
import { requireUsuario, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarDifusion, filasDifusion, COLUMNAS_DIFUSION } from '@/lib/export/difusion';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { perfil } = await requireUsuario();
  const puede = esAdministrador(perfil) || esAdminRedes(perfil) || rolesDe(perfil).includes('redaccion');
  if (!puede) return NextResponse.json({ error: 'sin permiso' }, { status: 403 });

  const supabase = await createClient();
  const data = await consultarDifusion(supabase);
  if (!data) return NextResponse.json({ error: 'no disponible' }, { status: 503 });
  const filas = filasDifusion(data);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'reportes', p_entidad_id: null,
    p_metadata: { listado: 'difusion', filas: filas.length },
  });

  return respuestaCsv('analitica-difusion', csvDesde(COLUMNAS_DIFUSION, filas));
}
