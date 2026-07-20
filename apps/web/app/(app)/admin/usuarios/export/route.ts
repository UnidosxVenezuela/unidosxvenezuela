// Descarga CSV del listado de usuarios con su ÚLTIMA CONEXIÓN (Administración).
// Reaplica el MISMO acceso que la página /admin/usuarios (admin general → todos;
// admin de área → su gente) y REGISTRA la descarga (quién, cuándo, cuántas filas)
// vía `registrar_auditoria`. El correo se lee con la service key (solo servidor).
import { requirePanelAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { csvDesde, respuestaCsv } from '@/lib/csv';
import { consultarUsuariosReporte, COLUMNAS_USUARIOS } from '@/lib/export/usuarios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // requirePanelAdmin redirige a /dashboard si no es admin (general o de área).
  const { area } = await requirePanelAdmin();
  const supabase = await createClient();
  let adminClient: any = null;
  try { adminClient = createAdminClient(); } catch { adminClient = null; }

  const p = new URL(req.url).searchParams;
  const f = { q: p.get('q') ?? undefined, frol: p.get('frol') ?? undefined, fest: p.get('fest') ?? undefined };
  const filas = await consultarUsuariosReporte(supabase, adminClient, area, f);

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_csv', p_entidad: 'perfiles', p_entidad_id: null,
    p_metadata: { listado: 'usuarios', filas: filas.length, filtros: f, area: area ?? null },
  });

  return respuestaCsv('usuarios-conexion', csvDesde(COLUMNAS_USUARIOS, filas));
}
