import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import CentrosAcopio from '@/components/CentrosAcopio';
import Consejo from '@/components/Consejos';

export default async function AcopioPage() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  // Acceden los líderes de acopio (admin, logística o quien lidera algún centro).
  // Fallback a admin/logística si aún no se aplicó la migración 0070 (es_lider_acopio).
  const { data: lider, error } = await supabase.rpc('es_lider_acopio');
  const rolesG = [perfil?.rol, ...((perfil?.roles_extra as string[] | null) ?? [])];
  const acceso = error ? (rolesG.includes('admin') || rolesG.includes('logistica')) : !!lider;
  if (!acceso) redirect('/dashboard');

  return (
    <div>
      <RealtimeRefrescar tabla="puntos_acopio" />
      <Consejo id="acopio" titulo="Centros de acopio">
        Cada centro lo gestiona su <strong>líder</strong>. Entra a <strong>«Inventario»</strong> para llevar existencias, registrar donaciones y traspasos. Usa <strong>«Panel de necesidades»</strong> para ver lo urgente de toda la red.
      </Consejo>
      <CentrosAcopio userId={user!.id} esAdmin={esAdministrador(perfil)} />
    </div>
  );
}
