import { requireUsuario, necesitaSegundaVerificacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { flagsDeNavegacion } from '@/lib/nav-flags';
import { formatoHoras, ETIQUETA_ROL } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import AnimarEntrada from '@/components/AnimarEntrada';
import AvisoSegundaVerificacion from '@/components/AvisoSegundaVerificacion';
import Consejo from '@/components/Consejos';
import Kpi from '@/components/Kpi';
import AccionRapida from '@/components/AccionRapida';
import FlujoTrabajo from '@/components/FlujoTrabajo';
import GloboColaboradores from '@/components/GloboColaboradores';
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
 * Panel por función: cada quien ve SOLO las acciones y datos de su ámbito
 * (su grupo). La tira del flujo la ven quienes participan del flujo de casos.
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

  const [pendientes, noLeidas, misHorasRows, totalCom, paisesRes, totalColabRes, kpisRol] = await Promise.all([
    misGrupoIds.length
      ? supabase.from('tareas').select('*', { count: 'exact', head: true }).in('estado', ['pendiente', 'asignada']).in('grupo_id', misGrupoIds)
      : Promise.resolve({ count: 0 } as { count: number }),
    supabase.from('notificaciones').select('*', { count: 'exact', head: true }).eq('leida', false),
    supabase.from('registro_horas').select('horas').eq('perfil_id', user!.id),
    supabase.rpc('total_horas_comunidad'),
    supabase.rpc('paises_colaboradores'),
    supabase.rpc('total_colaboradores'),
    kpisDeRol(supabase, user!.id, flags),
  ]);
  // Países desde donde se colabora (agregado no sensible) para el globo del panel.
  const paisesColab = ((paisesRes.data ?? []) as { pais: string; n: number }[]).filter((p) => p.pais);
  // «Somos N»: total real de la plataforma (RPC 0121). Si la migración aún no se aplicó,
  // cae a la suma por país para no mostrar 0.
  const totalColab = Number(totalColabRes.data ?? 0) || paisesColab.reduce((s, p) => s + (Number(p.n) || 0), 0);
  const misHoras = (misHorasRows.data ?? []).reduce((s: number, r: any) => s + Number(r.horas), 0);
  const totalComunidad = Number(totalCom.data ?? 0);

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
  if (flags.acopio) acciones.push({ href: '/insumos', titulo: 'Insumos y acopio', descripcion: 'Gestiona la ayuda en camino', icono: 'camion', color: '#a16207', tinte: '#fef9c3' });
  acciones.push({ href: '/grupos', titulo: 'Mis grupos', descripcion: 'Tu equipo, tareas y anuncios', icono: 'grupos', color: '#16a34a', tinte: '#dcfce7' });
  acciones.push({ href: '/horas', titulo: 'Registrar mis horas', descripcion: 'Suma tu tiempo de voluntariado', icono: 'reloj', color: '#9d2463', tinte: '#fce7f3' });

  // Nombre para el saludo: si no hay nombre, saludo sin nombre (nunca el correo crudo).
  const primerNombre = (perfil?.nombre_completo || '').trim().split(' ')[0];
  const rolEtq = rol ? ETIQUETA_ROL[rol] : '';

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
      <div className="pagina-cab">
        <div>
          <h1 style={{ marginBottom: 4 }}>¡{saludoPorHora()}{primerNombre ? ', ' + primerNombre : ''}! <span aria-hidden>👋</span></h1>
          <p className="muted sub" style={{ margin: 0 }}>
            {rolEtq ? <>Tu rol: <strong>{rolEtq}</strong>. </> : null}Esto es lo que puedes hacer hoy.
          </p>
        </div>
      </div>

      {mostrarAviso2a && (
        <div style={{ marginBottom: 18 }}><AvisoSegundaVerificacion /></div>
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
        <Kpi etiqueta="Avisos sin leer" valor={noLeidas.count ?? 0} sub="por revisar" icono="avisos" tinte="#fef9c3" color="#a16207" href="/notificaciones" />
        <Kpi etiqueta="Tus horas" valor={formatoHoras(misHoras)} sub="de voluntariado" icono="reloj" tinte="#fce7f3" color="#9d2463" href="/horas" />
      </div>

      <div className="tarjeta" style={{ textAlign: 'center', borderColor: 'var(--azul)', marginTop: 16 }}>
        <div className="muted">Entre todos llevamos</div>
        <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--azul)' }}>{formatoHoras(totalComunidad)}</div>
        <div className="muted" style={{ fontSize: '.9rem' }}>de voluntariado por Venezuela <span aria-hidden>💛💙❤️</span></div>
      </div>

      {/* Globo: puntos en los países desde donde se colabora (0120). */}
      <div className="tarjeta" style={{ textAlign: 'center', marginTop: 16 }}>
        <h2 style={{ margin: '0 0 2px' }}>Colaboramos desde el mundo <span aria-hidden>🌎</span></h2>
        <p className="muted" style={{ marginTop: 0, fontSize: '.95rem' }}>
          {paisesColab.length > 0 ? (
            <>
              Somos <strong style={{ color: 'var(--azul)' }}>{totalColab.toLocaleString('es')}</strong>{' '}
              {totalColab === 1 ? 'persona voluntaria' : 'personas voluntarias'} desde{' '}
              <strong style={{ color: 'var(--azul)' }}>{paisesColab.length}</strong>{' '}
              {paisesColab.length === 1 ? 'país' : 'países'}, sumando por Venezuela 💛💙❤️
            </>
          ) : (
            'Los países desde donde colaboramos aparecerán aquí a medida que se sumen voluntarios.'
          )}
        </p>
        <LimiteError><GloboColaboradores paises={paisesColab} /></LimiteError>
      </div>
    </AnimarEntrada>
  );
}
