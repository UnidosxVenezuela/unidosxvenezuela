import Link from 'next/link';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function Dashboard() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();

  const [pendientes, misGrupos, noLeidas] = await Promise.all([
    supabase.from('tareas').select('*', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'asignada']),
    supabase.from('miembros_grupo').select('*', { count: 'exact', head: true })
      .eq('perfil_id', user!.id),
    supabase.from('notificaciones').select('*', { count: 'exact', head: true })
      .eq('leida', false),
  ]);

  const tarjeta = (titulo: string, valor: number | null, enlace: string) => (
    <Link href={enlace} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="muted">{titulo}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800 }}>{valor ?? 0}</div>
    </Link>
  );

  return (
    <div>
      <h1>Panel</h1>
      <p className="muted">Hola, {perfil?.nombre_completo || user?.email}.</p>
      <div className="grid grid-2">
        {tarjeta('Tareas por atender', pendientes.count, '/tareas')}
        {tarjeta('Mis grupos', misGrupos.count, '/grupos')}
        {tarjeta('Notificaciones sin leer', noLeidas.count, '/dashboard')}
      </div>
    </div>
  );
}
