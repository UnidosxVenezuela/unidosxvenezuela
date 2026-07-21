// Descarga CSV de la reportería de Alianzas: el registro de empresas «Captado» como
// respaldo formal para presentar a las empresas. Reaplica el acceso de la vista
// (puede_alianzas) y REGISTRA la descarga vía registrar_auditoria. Una fila por empresa.
import { NextResponse } from 'next/server';
import { requireUsuario, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarEmpresasAlianzas, COLUMNAS_ALIANZAS } from '@/lib/export/alianzas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 });

  const supabase = await createClient();
  const filas = await consultarEmpresasAlianzas(supabase);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'reportes', p_entidad_id: null,
    p_metadata: { listado: 'alianzas', filas: filas.length },
  });

  return respuestaCsv('alianzas-empresas', csvDesde(COLUMNAS_ALIANZAS, filas));
}
