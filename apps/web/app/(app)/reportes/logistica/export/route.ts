// Descarga CSV de la Reportería de Logística. Reaplica el mismo acceso que la vista
// (Logística o Alianzas en consulta, 0226) con los HELPERS —nunca con
// rolesDe().includes, que dejaría fuera al mando del grupo (0214)— y REGISTRA la
// descarga vía `registrar_auditoria`. CSV en formato largo (Sección · Concepto · Valor).
import { NextResponse } from 'next/server';
import { requireUsuario, puedeLogistica, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarLogistica, filasLogistica, COLUMNAS_LOGISTICA } from '@/lib/export/logistica';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { perfil } = await requireUsuario();
  if (!puedeLogistica(perfil) && !puedeAlianzas(perfil)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 });
  }

  const supabase = await createClient();
  const data = await consultarLogistica(supabase);
  if (!data) return NextResponse.json({ error: 'no disponible' }, { status: 503 });
  const filas = filasLogistica(data);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'reportes', p_entidad_id: null,
    p_metadata: { listado: 'logistica', filas: filas.length },
  });

  return respuestaCsv('reporteria-logistica', csvDesde(COLUMNAS_LOGISTICA, filas));
}
