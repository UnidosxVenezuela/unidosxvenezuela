// Descarga CSV del tablero Donación-Ofrecimiento (oportunidades_donacion). Reaplica
// el mismo acceso que la vista (puedeVerOportunidades) y REGISTRA la descarga vía
// `registrar_auditoria`.
import { NextResponse } from 'next/server';
import { requireUsuario, puedeVerOportunidades } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarOfrecimientos, COLUMNAS_OFRECIMIENTOS } from '@/lib/export/ofrecimientos';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { perfil } = await requireUsuario();
  if (!puedeVerOportunidades(perfil)) return NextResponse.json({ error: 'sin permiso' }, { status: 403 });

  const supabase = await createClient();
  const p = new URL(req.url).searchParams;
  const sp = { q: p.get('q') ?? undefined, verif: p.get('verif') ?? undefined, clase: p.get('clase') ?? undefined };
  const filas = await consultarOfrecimientos(supabase, sp);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'oportunidades_donacion', p_entidad_id: null,
    p_metadata: { listado: 'ofrecimientos', filas: filas.length, filtros: sp },
  });

  return respuestaCsv('donacion-ofrecimiento', csvDesde(COLUMNAS_OFRECIMIENTOS, filas));
}
