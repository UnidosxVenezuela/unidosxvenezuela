import { redirect } from 'next/navigation';
import { requireUsuario, esCoordinacion, esAdministrador } from '@/lib/auth';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import CentrosAcopio from '@/components/CentrosAcopio';

export default async function AcopioPage() {
  const { user, perfil } = await requireUsuario();
  const rolesG = [perfil?.rol, ...((perfil?.roles_extra as string[] | null) ?? [])];
  if (!rolesG.includes('admin') && !rolesG.includes('logistica')) redirect('/dashboard');

  return (
    <div>
      <RealtimeRefrescar tabla="puntos_acopio" />
      <CentrosAcopio userId={user!.id} esCoord={esCoordinacion(perfil)} esAdmin={esAdministrador(perfil)} />
    </div>
  );
}
