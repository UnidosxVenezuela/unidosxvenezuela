// Descarga CSV de la referencia de Captación (oportunidades enviadas) que ve
// Logística. Reaplica el mismo acceso (puedeLogistica) y REGISTRA la descarga vía
// `registrar_auditoria`.
import { NextResponse } from 'next/server';
import { requireUsuario, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarCaptacion, COLUMNAS_CAPTACION } from '@/lib/export/captacion';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { perfil } = await requireUsuario();
  if (!puedeLogistica(perfil)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 });

  const supabase = await createClient();
  const p = new URL(req.url).searchParams;
  const sp = { q: p.get('q') ?? undefined, cat: p.get('cat') ?? undefined };
  const filas = await consultarCaptacion(supabase, sp);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'oportunidades', p_entidad_id: null,
    p_metadata: { listado: 'captacion', filas: filas.length, filtros: sp },
  });

  return respuestaCsv('captacion', csvDesde(COLUMNAS_CAPTACION, filas));
}
