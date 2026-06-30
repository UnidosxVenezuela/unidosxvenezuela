import { requireUsuario, puedeRecopilar, puedeVerificar, puedePipeline, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatoHoras, ETIQUETA_ROL, ETAPAS_CONTENIDO, ROL_DE_ETAPA, ETIQUETA_ETAPA } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import AnimarEntrada from '@/components/AnimarEntrada';
import Kpi from '@/components/Kpi';
import AccionRapida from '@/components/AccionRapida';
import FlujoTrabajo, { type PasoFlujo } from '@/components/FlujoTrabajo';

type Accion = { href: string; titulo: string; descripcion: string; icono: string; color: string; tinte: string };

export default async function Dashboard() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const rol = perfil?.rol as Rol | undefined;

  const recopila = puedeRecopilar(rol);
  const verifica = puedeVerificar(rol);
  const pipeline = puedePipeline(rol);
  const coord = esCoordinacion(rol);
  const mostrarFlujo = recopila || pipeline;

  const [pendientes, misGrupos, noLeidas, misHorasRows, totalCom] = await Promise.all([
    supabase.from('tareas').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'asignada']),
    supabase.from('miembros_grupo').select('*', { count: 'exact', head: true }).eq('perfil_id', user!.id),
    supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leida', false),
    supabase.from('registro_horas').select('horas').eq('perfil_id', user!.id),
    supabase.rpc('total_horas_comunidad'),
  ]);

  const misHoras = (misHorasRows.data ?? []).reduce((s: number, r: any) => s + Number(r.horas), 0);
  const totalComunidad = Number(totalCom.data ?? 0);

  // Conteos del flujo (solo si el rol participa; la RLS limita lo que ve cada quien).
  let f = { enProceso: 0, confirmado: 0, redaccion: 0, diseno: 0, video: 0, redes: 0, publicado: 0 };
  if (mostrarFlujo) {
    const cc = (e: string) => supabase.from('casos').select('*', { count: 'exact', head: true }).eq('estado', e);
    const pp = (e: string) => supabase.from('piezas_contenido').select('*', { count: 'exact', head: true }).eq('etapa', e);
    const [a, b, r, d, v, re, pu] = await Promise.all([
      cc('en_proceso'), cc('confirmado'), pp('redaccion'), pp('diseno'), pp('video'), pp('redes'), pp('publicado'),
    ]);
    f = {
      enProceso: a.count ?? 0, confirmado: b.count ?? 0, redaccion: r.count ?? 0,
      diseno: d.count ?? 0, video: v.count ?? 0, redes: re.count ?? 0, publicado: pu.count ?? 0,
    };
  }

  // Acciones rápidas según el rol (se muestran las primeras 4).
  const acciones: Accion[] = [];
  if (rol === 'recopilacion') {
    acciones.push({ href: '/casos/nuevo', titulo: 'Reportar un caso', descripcion: 'Envía información para verificar', icono: 'mas', color: 'var(--azul)', tinte: '#eef2ff' });
    acciones.push({ href: '/casos', titulo: 'Mis casos', descripcion: 'Da seguimiento a su estado', icono: 'documento', color: 'var(--azul)', tinte: '#eef2ff' });
  }
  if (verifica) {
    acciones.push({ href: '/casos?estado=en_proceso', titulo: 'Verificar casos', descripcion: f.enProceso ? `${f.enProceso} en proceso ahora` : 'Revisa lo que llega', icono: 'ok', color: '#16a34a', tinte: '#dcfce7' });
  }
  if (pipeline) {
    const miEtapa = ETAPAS_CONTENIDO.find((e) => ROL_DE_ETAPA[e] === rol);
    acciones.push({ href: '/contenido', titulo: 'Producción de contenido', descripcion: miEtapa ? `Tu etapa: ${ETIQUETA_ETAPA[miEtapa]}` : 'Avanza las piezas por el flujo', icono: 'cohete', color: '#9d2463', tinte: '#fce7f3' });
  }
  acciones.push({ href: '/tareas', titulo: 'Tareas abiertas', descripcion: 'Toma una y colabora', icono: 'tareas', color: '#a16207', tinte: '#fef9c3' });
  acciones.push({ href: '/horas', titulo: 'Registrar mis horas', descripcion: 'Suma tu tiempo de voluntariado', icono: 'reloj', color: '#9d2463', tinte: '#fce7f3' });
  acciones.push({ href: '/grupos', titulo: 'Mis grupos', descripcion: 'Coordina con tu equipo', icono: 'grupos', color: '#16a34a', tinte: '#dcfce7' });
  acciones.push({ href: '/tablon', titulo: 'Tablón', descripcion: 'Lee los anuncios del equipo', icono: 'tablon', color: 'var(--azul)', tinte: '#eef2ff' });
  const accionesTop = acciones.slice(0, 4);

  const pasos: PasoFlujo[] = [
    { etiqueta: 'Verificación', valor: f.enProceso, icono: 'ok', color: '#a16207', tinte: '#fef9c3', href: '/casos?estado=en_proceso' },
    { etiqueta: 'Confirmados', valor: f.confirmado, icono: 'ok', color: '#16a34a', tinte: '#dcfce7', href: '/casos?estado=confirmado' },
    { etiqueta: 'Redacción', valor: f.redaccion, icono: 'documento', color: 'var(--azul)', tinte: '#eef2ff', href: '/contenido' },
    { etiqueta: 'Diseño / Video', valor: f.diseno + f.video, icono: 'imagen', color: '#9d2463', tinte: '#fce7f3', href: '/contenido' },
    { etiqueta: 'Redes', valor: f.redes, icono: 'tablon', color: '#0e7490', tinte: '#cffafe', href: '/contenido' },
    { etiqueta: 'Publicado', valor: f.publicado, icono: 'cohete', color: '#16a34a', tinte: '#dcfce7', href: '/contenido' },
  ];

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
          <p className="muted" style={{ marginTop: -4 }}>Así avanza la información hasta publicarse. Toca una etapa para abrirla.</p>
          <FlujoTrabajo pasos={pasos} />
        </>
      )}

      <h2>Tu resumen</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <Kpi etiqueta="Tareas por atender" valor={pendientes.count ?? 0} sub="pendientes y asignadas" icono="tareas" tinte="#eef2ff" color="var(--azul)" href="/tareas" />
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
