import Link from 'next/link';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatoHoras } from '@/lib/constantes';
import AnimarEntrada from '@/components/AnimarEntrada';
import Kpi from '@/components/Kpi';

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

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Panel</h1>
          <p className="muted sub">Hola, {perfil?.nombre_completo || user?.email}. Este es el resumen de tu actividad.</p>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Tareas por atender" valor={pendientes.count ?? 0} sub="pendientes y asignadas" icono="tareas" tinte="#eef2ff" color="var(--azul)" href="/tareas" />
        <Kpi etiqueta="Mis grupos" valor={misGrupos.count ?? 0} sub="donde participas" icono="grupos" tinte="#dcfce7" color="#16a34a" href="/grupos" />
        <Kpi etiqueta="Avisos sin leer" valor={noLeidas.count ?? 0} sub="por revisar" icono="avisos" tinte="#fef9c3" color="#a16207" href="/notificaciones" />
        <Kpi etiqueta="Tus horas" valor={formatoHoras(misHoras)} sub="de voluntariado" icono="reloj" tinte="#fce7f3" color="#9d2463" href="/horas" />
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
    </AnimarEntrada>
  );
}
