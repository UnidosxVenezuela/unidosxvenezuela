import Link from 'next/link';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatoHoras } from '@/lib/constantes';

export default async function Dashboard() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();

  const [pendientes, misGrupos, noLeidas, misHorasRows, totalCom, areas, gruposArea] = await Promise.all([
    supabase.from('tareas').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'asignada']),
    supabase.from('miembros_grupo').select('*', { count: 'exact', head: true }).eq('perfil_id', user!.id),
    supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leida', false),
    supabase.from('registro_horas').select('horas').eq('perfil_id', user!.id),
    supabase.rpc('total_horas_comunidad'),
    supabase.from('areas').select('clave, nombre').order('nombre'),
    supabase.from('grupos').select('area'),
  ]);

  const misHoras = (misHorasRows.data ?? []).reduce((s: number, r: any) => s + Number(r.horas), 0);
  const totalComunidad = Number(totalCom.data ?? 0);
  const gruposPorArea = new Map<string, number>();
  for (const g of (gruposArea.data ?? []) as any[]) {
    gruposPorArea.set(g.area, (gruposPorArea.get(g.area) ?? 0) + 1);
  }

  const tarjeta = (titulo: string, valor: string | number, enlace: string) => (
    <Link href={enlace} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="muted">{titulo}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800 }}>{valor}</div>
    </Link>
  );

  return (
    <div>
      <h1>Panel</h1>
      <p className="muted">Hola, {perfil?.nombre_completo || user?.email}.</p>
      <div className="grid grid-2">
        {tarjeta('Tareas por atender', pendientes.count ?? 0, '/tareas')}
        {tarjeta('Mis grupos', misGrupos.count ?? 0, '/grupos')}
        {tarjeta('Notificaciones sin leer', noLeidas.count ?? 0, '/notificaciones')}
        {tarjeta('Tus horas', formatoHoras(misHoras), '/horas')}
      </div>

      <div className="tarjeta" style={{ textAlign: 'center', borderColor: 'var(--azul)' }}>
        <div className="muted">Entre todos llevamos</div>
        <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--azul)' }}>{formatoHoras(totalComunidad)}</div>
        <div className="muted" style={{ fontSize: '.9rem' }}>de voluntariado por Venezuela 💛💙❤️</div>
      </div>

      <h2>Áreas</h2>
      <div className="grid grid-2">
        {(areas.data ?? []).map((a: any) => (
          <Link key={a.clave} href="/grupos" className="tarjeta" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <strong>{a.nombre}</strong>
              <span className="insignia">{gruposPorArea.get(a.clave) ?? 0} grupos</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
