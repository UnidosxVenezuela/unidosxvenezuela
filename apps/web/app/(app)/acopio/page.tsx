import { requireUsuario, esCoordinacion } from '@/lib/auth';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import CentrosAcopio from '@/components/CentrosAcopio';

export default async function AcopioPage() {
  const { user, perfil } = await requireUsuario();
  return (
    <div>
      <RealtimeRefrescar tabla="puntos_acopio" />
      <CentrosAcopio userId={user!.id} esCoord={esCoordinacion(perfil?.rol)} esAdmin={perfil?.rol === 'admin'} />
    </div>
  );
}
