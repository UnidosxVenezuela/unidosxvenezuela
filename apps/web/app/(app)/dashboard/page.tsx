import Link from 'next/link';
import { requireUsuario, necesitaSegundaVerificacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { flagsDeNavegacion } from '@/lib/nav-flags';
import { formatoHoras, ETIQUETA_ROL } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import AnimarEntrada from '@/components/AnimarEntrada';
import AvisoSegundaVerificacion from '@/components/AvisoSegundaVerificacion';
import Consejo from '@/components/Consejos';
import Icono from '@/components/Icono';
import Kpi from '@/components/Kpi';
import AccionRapida from '@/components/AccionRapida';
import FlujoTrabajo from '@/components/FlujoTrabajo';
import GloboColaboradores from '@/components/GloboColaboradores';
import InsigniasSaludo from '@/components/InsigniasSaludo';
import LimiteError from '@/components/LimiteError';
import { contarFlujo, pasosFlujo } from '@/lib/flujo';
import { kpisDeRol } from '@/lib/kpis-panel';

type Accion = { href: string; titulo: string; descripcion: string; icono: string; color: string; tinte: string };

/** Saludo según la hora en Venezuela (America/Caracas), sin depender de la zona del servidor. */
function saludoPorHora(): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Panel por función (rediseño «Claridad con calidez»): héroe con saludo e
 * insignias, «siguiente mejor acción», primeros pasos para quien empieza,
 * acciones rápidas, KPIs con micro-tendencia real y el bloque de comunidad.
 * Cada quien ve SOLO las acciones y datos de su ámbito.
 */
export default async function Dashboard() {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const flags = await flagsDeNavegacion(supabase, user!.id, perfil);
  const rol = perfil?.rol as Rol | undefined;

  // Grupos del usuario: se usan para contar SOLO las tareas de sus grupos (antes se
  // contaban todas las de la red, inflando el número respecto a la etiqueta).
  const { data: misGrupoRows } = await supabase.from('miembros_grupo').select('grupo_id').eq('perfil_id', user!.id);
  const misGrupoIds = [...new Set((misGrupoRows ?? []).map((r: any) => r.grupo_id).filter(Boolean))];
  const misGruposCount = misGrupoIds.length;

  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [pendientes, noLeidas, misHorasRows, totalCom, paisesRes, totalColabRes, kpisRol, avisosHoy, insigniasCount] = await Promise.all([
    misGrupoIds.length
      ? supabase.from('tareas').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'asignada']).in('grupo_id', misGrupoIds)
      : Promise.resolve({ count: 0 } as { count: number }),
    supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leida', false),
    supabase.from('registro_horas').select('horas, fecha').eq('perfil_id', user!.id),
    supabase.rpc('total_horas_comunidad'),
    supabase.rpc('paises_colaboradores'),
    supabase.rpc('total_colaboradores'),
    kpisDeRol(supabase, user!.id, flags),
    supabase.from('notificaciones').select('*', { count: 'exact', head: true }).gte('creado_en', hace24h),
    supabase.from('perfil_insignias').select('*', { count: 'exact', head: true }).eq('perfil_id', user!.id),
  ]);
  // Países desde donde se colabora (agregado no sensible) para el globo del panel.
  const paisesColab = ((paisesRes.data ?? []) as { pais: string; n: number }[]).filter((p) => p.pais);
  // «Somos N»: total real de la plataforma (RPC 0121). Si la migración aún no se aplicó,
  // cae a la suma por país para no mostrar 0.
  const totalColab = Number(totalColabRes.data ?? 0) || paisesColab.reduce((s, p) => s + (Number(p.n) || 0), 0);
  const filasHoras = (misHorasRows.data ?? []) as { horas: number; fecha: string | null }[];
  const misHoras = filasHoras.reduce((s, r) => s + Number(r.horas), 0);
  // Micro-tendencias REALES (sin series inventadas): horas de los últimos 7 días
  // y avisos que llegaron en las últimas 24 h.
  const hace7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const horasSemana = filasHoras.filter((r) => (r.fecha ?? '') >= hace7d).reduce((s, r) => s + Number(r.horas), 0);
  const nAvisosHoy = avisosHoy.count ?? 0;
  const totalComunidad = Number(totalCom.data ?? 0);
  const nInsignias = insigniasCount.count ?? 0;

  // La tira del flujo (Verificación → Confirmados → Envío a Redacción) es una
  // vista de conjunto: solo la ve el admin. Cada rol hace su función sin
  // necesitar el mapa completo del flujo.
  const mostrarFlujo = flags.admin;
  const pasos = mostrarFlujo ? pasosFlujo(await contarFlujo(supabase)) : [];

  const acciones: Accion[] = [];
  if (flags.gestionCasos && !flags.verificacion) {
    acciones.push({ href: '/casos/nuevo', titulo: 'Reportar una solicitud', descripcion: 'Envía información para verificar', icono: 'mas', color: 'var(--azul)', tinte: '#eef2ff' });
    acciones.push({ href: '/casos', titulo: 'Mis solicitudes', descripcion: 'Da seguimiento a su estado', icono: 'documento', color: 'var(--azul)', tinte: '#eef2ff' });
  }
  if (flags.verificacion) acciones.push({ href: '/casos?estado=en_proceso', titulo: 'Verificar solicitudes', descripcion: 'Confirma o descarta otras solicitudes', icono: 'ok', color: '#16a34a', tinte: '#dcfce7' });
  if (flags.busqueda && !flags.admin) acciones.push({ href: '/casos?estado=en_proceso', titulo: 'Buscar desaparecidos', descripcion: 'Toma y verifica casos de desaparecidos', icono: 'buscar', color: '#0e7490', tinte: '#cffafe' });
  if (flags.envioRedaccion) acciones.push({ href: '/envio-redaccion', titulo: 'Envío a Redacción', descripcion: 'Pasa los confirmados a Redacción', icono: 'cohete', color: '#9d2463', tinte: '#fce7f3' });
  if (flags.psicosocial) acciones.push({ href: '/psicosocial', titulo: 'Apoyo Psicosocial', descripcion: flags.admin ? 'Supervisa el área' : 'Acompaña tus casos', icono: 'corazon', color: '#b91c1c', tinte: '#fee2e2' });
  if (flags.acopio) acciones.push({ href: '/insumos', titulo: 'Logística', descripcion: 'Solicitudes y ofertas de donación', icono: 'camion', color: '#a16207', tinte: '#fef9c3' });
  acciones.push({ href: '/grupos', titulo: 'Mis grupos', descripcion: 'Tu equipo, tareas y anuncios', icono: 'grupos', color: '#16a34a', tinte: '#dcfce7' });
  acciones.push({ href: '/horas', titulo: 'Ver mis horas', descripcion: 'Tu tiempo se cuenta solo al usar la plataforma', icono: 'reloj', color: '#9d2463', tinte: '#fce7f3' });

  // Nombre para el saludo: si no hay nombre, saludo sin nombre (nunca el correo crudo).
  const primerNombre = (perfil?.nombre_completo || '').trim().split(' ')[0];
  const rolEtq = rol ? ETIQUETA_ROL[rol] : '';

  // «Siguiente mejor acción»: el pendiente más prioritario del rol (mismo dato
  // que sus KPIs); para el admin, la primera etapa del flujo con trabajo.
  const kpiUrgente = kpisRol.find((k) => k.valor > 0);
  const pasoUrgente = mostrarFlujo ? pasos.find((p) => Number(p.valor ?? 0) > 0 && p.href) : undefined;
  const mejorAccion = kpiUrgente
    ? { href: kpiUrgente.href, texto: <>{kpiUrgente.etiqueta}: <strong>{kpiUrgente.valor}</strong> ({kpiUrgente.sub}) — empieza por ahí.</> }
    : pasoUrgente
      ? { href: pasoUrgente.href!, texto: <>hay <strong>{pasoUrgente.valor}</strong> en <strong>{pasoUrgente.etiqueta}</strong> — empieza por ahí.</> }
      : null;

  // «Primeros pasos»: checklist real de arranque; desaparece al completarla.
  const pasosInicio: { etiqueta: string; hecho: boolean }[] = [
    { etiqueta: 'Activa tu cuenta', hecho: true }, // si llegó aquí, su cuenta ya está verificada
    { etiqueta: 'Únete a un grupo', hecho: misGruposCount > 0 },
    { etiqueta: 'Completa tu perfil', hecho: Boolean(perfil?.whatsapp && perfil?.pais) },
    { etiqueta: 'Suma tu primera hora', hecho: misHoras > 0 },
    { etiqueta: 'Gana una insignia', hecho: nInsignias > 0 },
  ];
  const hechos = pasosInicio.filter((p) => p.hecho).length;
  const mostrarPrimerosPasos = hechos < pasosInicio.length;

  // Aviso proactivo de 2ª verificación: solo a quien su rol la exige y aún no la aprobó.
  let mostrarAviso2a = false;
  if (necesitaSegundaVerificacion(perfil)) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    mostrarAviso2a = (vi as any)?.estado !== 'aprobada';
  }

  return (
    <AnimarEntrada>
      <Consejo id="dashboard" titulo="Este es tu panel">
        Aquí ves un resumen de tu actividad y accesos rápidos. Muévete entre secciones con el menú de la izquierda. ¿No quieres estos consejos? Apágalos con el botón <strong>💡 Consejos</strong> de arriba.
      </Consejo>

      {/* Héroe: saludo + rol + insignias, sobre un tinte suave de marca. */}
      <div className="panel-hero">
        <div>
          <h1>¡{saludoPorHora()}{primerNombre ? ', ' + primerNombre : ''}! <span aria-hidden>👋</span></h1>
          <p className="sub">
            Esto es lo que puedes hacer hoy.
            {rolEtq ? <span className="rol-pill">{rolEtq}</span> : null}
          </p>
        </div>
        {/* Insignias ganadas (0165): junto al saludo, con enlace a la vitrina. */}
        <InsigniasSaludo userId={user!.id} />
      </div>

      {mostrarAviso2a && (
        <div style={{ marginBottom: 18 }}><AvisoSegundaVerificacion /></div>
      )}

      {/* Siguiente mejor acción: el pendiente más prioritario, en una línea. */}
      {mejorAccion && (
        <Link href={mejorAccion.href as any} className="mejor-accion">
          <span aria-hidden style={{ fontSize: '1.15rem' }}>⚡</span>
          <span className="ma-txt"><strong>Siguiente mejor acción:</strong> <span>{mejorAccion.texto}</span></span>
          <Icono nombre="flecha" size={17} style={{ color: 'var(--texto-suave)', flexShrink: 0 }} />
        </Link>
      )}

      {/* Primeros pasos: guía de arranque con progreso; se va sola al completarla. */}
      {mostrarPrimerosPasos && (
        <div className="pasos-card">
          <div className="pasos-cab">
            <strong>Primeros pasos</strong>
            <div className="pasos-barra"><div className="pasos-fill" style={{ width: `${(hechos / pasosInicio.length) * 100}%` }} /></div>
            <span className="muted" style={{ fontSize: '.8rem', fontWeight: 600 }}>{hechos} de {pasosInicio.length}</span>
          </div>
          <div className="pasos-chips">
            {pasosInicio.map((p) => (
              <span key={p.etiqueta} className={'pill ' + (p.hecho ? 'pill-ok' : 'pill-neutra')}>{p.hecho ? '✓' : '○'} {p.etiqueta}</span>
            ))}
          </div>
        </div>
      )}

      <h2>Acciones rápidas</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        {acciones.map((a) => <AccionRapida key={a.href + a.titulo} {...a} />)}
      </div>

      {kpisRol.length > 0 && (
        <>
          <h2>Pendiente de ti</h2>
          <p className="muted" style={{ marginTop: -4 }}>Lo que espera tu atención según tu función. Toca una tarjeta para ir directo.</p>
          <div className="grid grid-2">
            {kpisRol.map((k) => <Kpi key={k.href + k.etiqueta} {...k} />)}
          </div>
        </>
      )}

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
        <Kpi etiqueta="Mis grupos" valor={misGruposCount} sub="donde participas" icono="grupos" tinte="#dcfce7" color="#16a34a" href="/grupos" />
        <Kpi etiqueta="Avisos sin leer" valor={noLeidas.count ?? 0} sub="por revisar" icono="avisos" tinte="#fef9c3" color="#a16207" href="/notificaciones"
          tendencia={nAvisosHoy > 0 ? `${nAvisosHoy} hoy` : undefined} tonoTendencia="aviso" />
        <Kpi etiqueta="Tus horas" valor={formatoHoras(misHoras)} sub="de voluntariado" icono="reloj" tinte="#fce7f3" color="#9d2463" href="/horas"
          tendencia={horasSemana > 0 ? `${formatoHoras(horasSemana)} esta semana` : undefined} />
      </div>

      <div className="panel-2col" style={{ marginTop: 16 }}>
        <div className="comunidad-card">
          <div className="muted" style={{ fontWeight: 600, fontSize: '.9rem' }}>Entre todos llevamos</div>
          <div className="comunidad-num">{formatoHoras(totalComunidad)}</div>
          <div className="muted" style={{ fontSize: '.9rem' }}>de voluntariado por Venezuela <span aria-hidden>💛💙❤️</span></div>
        </div>

        {/* Globo: puntos en los países desde donde se colabora (0120). */}
        <div className="tarjeta" style={{ textAlign: 'center', margin: 0 }}>
          <h2 style={{ margin: '0 0 2px' }}>Colaboramos desde el mundo <span aria-hidden>🌎</span></h2>
          <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
            {paisesColab.length > 0 ? (
              <>
                Somos <strong style={{ color: 'var(--link)' }}>{totalColab.toLocaleString('es')}</strong>{' '}
                {totalColab === 1 ? 'persona voluntaria' : 'personas voluntarias'} desde{' '}
                <strong style={{ color: 'var(--link)' }}>{paisesColab.length}</strong>{' '}
                {paisesColab.length === 1 ? 'país' : 'países'}, sumando por Venezuela 💛💙❤️
              </>
            ) : (
              'Los países desde donde colaboramos aparecerán aquí a medida que se sumen voluntarios.'
            )}
          </p>
          <LimiteError><GloboColaboradores paises={paisesColab} /></LimiteError>
        </div>
      </div>
    </AnimarEntrada>
  );
}
