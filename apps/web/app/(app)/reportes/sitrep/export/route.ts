// Descarga CSV del SitRep (Reporte de Situación). Reaplica el acceso de la vista
// (Coordinación = admin) y REGISTRA la descarga vía `registrar_auditoria`. El CSV
// va en formato largo (Sección · Concepto · Valor), fácil de pegar en una hoja.
import { NextResponse } from 'next/server';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarSitrep, filasSitrep, COLUMNAS_SITREP } from '@/lib/export/sitrep';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { perfil } = await requireUsuario();
  if (!esCoordinacion(perfil)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 });

  const supabase = await createClient();
  const data = await consultarSitrep(supabase);
  if (!data) return NextResponse.json({ error: 'no disponible' }, { status: 503 });
  const filas = filasSitrep(data);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'reportes', p_entidad_id: null,
    p_metadata: { listado: 'sitrep', filas: filas.length },
  });

  return respuestaCsv('sitrep', csvDesde(COLUMNAS_SITREP, filas));
}
