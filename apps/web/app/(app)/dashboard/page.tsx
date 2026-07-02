import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { flagsDeNavegacion } from '@/lib/nav-flags';
import { formatoHoras, ETIQUETA_ROL } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import AnimarEntrada from '@/components/AnimarEntrada';
import Kpi from '@/components/Kpi';
import AccionRapida from '@/components/AccionRapida';
import FlujoTrabajo from '@/components/FlujoTrabajo';
import { contarFlujo, pasosFlujo } from '@/lib/flujo';

type Accion = { href: string; titulo: string; descripcion: string; icono: string; color: string; tinte: string };

/**
 * Panel por función: cada quien ve SOLO las acciones y datos de su ámbito
 * (su grupo). La tira del flujo la ven quienes participan del flujo de casos.
 */
export default async function Dashboard() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const flags = await flagsDeNavegacion(supabase, user!.id, perfil);
  const rol = perfil?.rol as Rol | undefined;

  const [pendientes, misGrupos, noLeidas, misHorasRows, totalCom] = await Promise.all([
    supabase.from('tareas').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'asignada']),
    supabase.from('miembros_grupo').select('*', { count: 'exact', head: true }).eq('perfil_id', user!.id),
    supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leida', false),
    supabase.from('registro_horas').select('horas').eq('perfil_id', user!.id),
    supabase.rpc('total_horas_comunidad'),
  ]);
  const misHoras = (misHorasRows.data ?? []).reduce((s: number, r: any) => s + Number(r.horas), 0);
  const totalComunidad = Number(totalCom.data ?? 0);

  // La tira del flujo (Verificación → Confirmados → Envío a Redacción) solo la
  // ven quienes participan de él; la RLS limita además los conteos.
  const mostrarFlujo = flags.admin || flags.verificacion || flags.envioRedaccion;
  const pasos = mostrarFlujo ? pasosFlujo(await contarFlujo(supabase)) : [];

  const acciones: Accion[] = [];
  if (flags.gestionCasos && !flags.verificacion) {
    acciones.push({ href: '/casos/nuevo', titulo: 'Reportar un caso', descripcion: 'Envía información para verificar', icono: 'mas', color: 'var(--azul)', tinte: '#eef2ff' });
    acciones.push({ href: '/casos', titulo: 'Mis casos', descripcion: 'Da seguimiento a su estado', icono: 'documento', color: 'var(--azul)', tinte: '#eef2ff' });
  }
  if (flags.verificacion) acciones.push({ href: '/casos?estado=en_proceso', titulo: 'Verificar casos', descripcion: 'Confirma o descarta lo que llega', icono: 'ok', color: '#16a34a', tinte: '#dcfce7' });
  if (flags.envioRedaccion) acciones.push({ href: '/envio-redaccion', titulo: 'Envío a Redacción', descripcion: 'Pasa los confirmados a Redacción', icono: 'cohete', color: '#9d2463', tinte: '#fce7f3' });
  if (flags.psicosocial) acciones.push({ href: '/psicosocial', titulo: 'Apoyo Psicosocial', descripcion: flags.admin ? 'Supervisa el área' : 'Acompaña tus casos', icono: 'corazon', color: '#b91c1c', tinte: '#fee2e2' });
  if (flags.acopio) acciones.push({ href: '/insumos', titulo: 'Insumos y acopio', descripcion: 'Gestiona la ayuda en camino', icono: 'camion', color: '#a16207', tinte: '#fef9c3' });
  acciones.push({ href: '/grupos', titulo: 'Mis grupos', descripcion: 'Tu equipo, tareas y anuncios', icono: 'grupos', color: '#16a34a', tinte: '#dcfce7' });
  acciones.push({ href: '/horas', titulo: 'Registrar mis horas', descripcion: 'Suma tu tiempo de voluntariado', icono: 'reloj', color: '#9d2463', tinte: '#fce7f3' });
  const accionesTop = acciones.slice(0, 4);

  const primerNombre = (perfil?.nombre_completo || user?.email || '').split(' ')[0];
  const rolEtq = rol ? ETIQUETA_ROL[rol] : '';

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1 style={{ marginBottom: 4 }}>¡Hola, {primerNombre}! 👋</h1>
          <p className="muted sub" style={{ margin: 0 }}>
            {rolEtq ? <>Tu rol: <strong>{rolEtq}</strong>. </> : null}Esto es lo que puedes hacer hoy.
          </p>
        </div>
      </div>

      <h2>Acciones rápidas</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
        {accionesTop.map((a) => <AccionRapida key={a.href + a.titulo} {...a} />)}
      </div>

      {mostrarFlujo && (
        <>
          <h2>El flujo de trabajo</h2>
          <p className="muted" style={{ marginTop: -4 }}>Verificación → Confirmados → Envío a Redacción. Toca una etapa para abrirla.</p>
          <FlujoTrabajo pasos={pasos} />
        </>
      )}

      <h2>Tu resumen</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <Kpi etiqueta="Tareas de tus grupos" valor={pendientes.count ?? 0} sub="pendientes y asignadas" icono="tareas" tinte="#eef2ff" color="var(--azul)" href="/grupos" />
        <Kpi etiqueta="Mis grupos" valor={misGrupos.count ?? 0} sub="donde participas" icono="grupos" tinte="#dcfce7" color="#16a34a" href="/grupos" />
        <Kpi etiqueta="Avisos sin leer" valor={noLeidas.count ?? 0} sub="por revisar" icono="avisos" tinte="#fef9c3" color="#a16207" href="/notificaciones" />
        <Kpi etiqueta="Tus horas" valor={formatoHoras(misHoras)} sub="de voluntariado" icono="reloj" tinte="#fce7f3" color="#9d2463" href="/horas" />
      </div>

      <div className="tarjeta" style={{ textAlign: 'center', borderColor: 'var(--azul)', marginTop: 16 }}>
        <div className="muted">Entre todos llevamos</div>
        <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--azul)' }}>{formatoHoras(totalComunidad)}</div>
        <div className="muted" style={{ fontSize: '.9rem' }}>de voluntariado por Venezuela 💛💙❤️</div>
      </div>
    </AnimarEntrada>
  );
}
