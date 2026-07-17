// Versión imprimible (→ PDF) de Envío a Redacción. Reaplica el mismo acceso que la
// vista y REGISTRA la apertura vía `registrar_auditoria`.
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import VistaImprimible from '@/components/VistaImprimible';
import { consultarRedaccion, COLUMNAS_REDACCION } from '@/lib/export/redaccion';

export const dynamic = 'force-dynamic';

export default async function ImprimirRedaccionPage() {
  const { perfil } = await requireUsuario();
  const puede = esAdministrador(perfil) || esAdminRedes(perfil) || rolesDe(perfil).includes('redaccion');
  if (!puede) redirect('/dashboard');

  const supabase = await createClient();
  const filas = await consultarRedaccion(supabase);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_pdf', p_entidad: 'casos', p_entidad_id: null,
    p_metadata: { listado: 'redaccion', filas: filas.length, via: 'vista_imprimible' },
  });

  return (
    <VistaImprimible
      titulo="Envío a Redacción" subtitulo="Confirmadas y enviadas"
      volverHref="/envio-redaccion" csvHref="/envio-redaccion/export"
      columnas={COLUMNAS_REDACCION} filas={filas}
    />
  );
}
