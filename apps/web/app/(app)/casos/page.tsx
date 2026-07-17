import { fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerificar, puedeRecopilar, puedeBusqueda, esAdministrador, esAdminVerificacion, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ESTADO_CASO, ESTADOS_CASO, CATEGORIAS_CASO, hrefSeguro, ETIQUETA_TIPO_LUGAR, TONO_TIPO_LUGAR } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';
import EstadoCaso from '@/components/EstadoCaso';
import AnimarEntrada from '@/components/AnimarEntrada';
import DrawerModal from '@/components/DrawerModal';
import Avatar from '@/components/Avatar';
import Kpi from '@/components/Kpi';
import Pill from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import BarraBusqueda from '@/components/BarraBusqueda';
import Carrusel from '@/components/Carrusel';
import FlujoTrabajo from '@/components/FlujoTrabajo';
import FlujoProgreso from '@/components/FlujoProgreso';
import { contarFlujo, pasosFlujo, pasoDeCaso } from '@/lib/flujo';
import DetalleCaso from './DetalleCaso';
import Consejo from '@/components/Consejos';
import FiltroSelect from '@/components/FiltroSelect';
import BotonExportar from '@/components/BotonExportar';
import { nombreMostrado } from '@/lib/nombre';

type SP = { q?: string; estado?: string; categoria?: string; caso?: string };
const COLS = 'id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, asignado_a, estado, info_requerida, actualizado_en';

export default async function CasosPage({ searchParams }: { searchParams: SP }) {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const rolesU = rolesDe(perfil);
  const puedeVerif = puedeVerificar(perfil);              // Verificación → «Otras informaciones»
  const accesoBusqueda = puedeBusqueda(perfil);           // Búsqueda → «Desaparecidos» (incluye admin)
  // El Admin de Verificaciones entra como SUPERVISOR (solo lectura; la RLS decide qué
  // ve y OPERA su área) — pero, como blindaje, EXIGE su 2ª verificación aprobada.
  const supervisa = esAdminVerificacion(perfil);
  if (!puedeRecopilar(perfil) && !accesoBusqueda && !supervisa) redirect('/dashboard');
  const supabase = await createClient();

  // 2ª verificación obligatoria para Recopilación, Búsqueda y el Admin de Verificaciones
  // (Verificación y admin general quedan exentos). Sin identidad aprobada, se oculta Casos.
  const necesita2a = !esAdmin && !puedeVerif && (rolesU.includes('recopilacion') || rolesU.includes('busqueda') || supervisa);
  // La identidad (2ª verificación) se consulta para cualquier rol de casos no-admin:
  // decide el gate de acceso y también quién ve la herramienta de cédula.
  let identidadOK = esAdmin;
  if (!esAdmin && (rolesU.includes('recopilacion') || rolesU.includes('busqueda') || supervisa)) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    identidadOK = (vi as any)?.estado === 'aprobada';
  }
  if (necesita2a && !identidadOK) {
    return (
      <AnimarEntrada>
        <div className="pagina-cab"><div><h1>Solicitudes</h1></div></div>
        <div className="tarjeta" style={{ maxWidth: 560 }}>
          <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre="llave" size={20} /> Completa tu segunda verificación</h2>
          <p className="muted">Para acceder a Solicitudes necesitas aprobar la <strong>verificación de identidad</strong> (foto en vivo + documento). Es un paso obligatorio para tu rol; cuando la aprueben, verás la sección de Solicitudes y tu grupo.</p>
          <Link href="/verificacion" className="btn btn-primario"><Icono nombre="llave" size={16} /> Ir a mi verificación</Link>
        </div>
      </AnimarEntrada>
    );
  }

  // El Admin de Verificaciones opera casos como el equipo (con su 2ª verificación aprobada).
  const puedeOperar = supervisa && identidadOK;
  const puedeCrear = esAdmin || rolesU.includes('recopilacion') || puedeOperar;
  const verifica = puedeVerif || accesoBusqueda || puedeOperar;  // puede cambiar estado / tomar
  const soloBusqueda = accesoBusqueda && !puedeVerif && !esAdmin; // ve solo Desaparecidos
  const soloVerif = puedeVerif && !accesoBusqueda && !esAdmin;    // ve solo Otras informaciones
  const subAreas = soloBusqueda ? ['Desaparecidos'] : soloVerif ? ['Otras informaciones'] : CATEGORIAS_CASO;

  // Consejo acorde al rol: cada quien ve solo lo que hace en el flujo de casos,
  // sin describirle acciones de otros roles.
  const tipCasos = esAdmin
    ? { t: 'El flujo de una solicitud', c: <>Recopilación <strong>reporta</strong> → Verificación (otras solicitudes) o el Grupo de Búsqueda (desaparecidos) <strong>confirma o descarta</strong> → Envío a Redacción <strong>pasa a contenido</strong> solo «Otras informaciones». Toca una solicitud para ver su historial.</> }
    : puedeVerif
      ? { t: 'Verificar solicitudes', c: <>Revisa lo reportado (que no sean desaparecidos) y <strong>confírmalo o descártalo</strong>. Toca una solicitud para ver su fuente, su detalle y quién intervino.</> }
      : accesoBusqueda
        ? { t: 'Buscar y verificar desaparecidos', c: <>Toma los casos de <strong>personas desaparecidas</strong> y <strong>confírmalos o descártalos</strong>. Esta información la gestiona el Grupo de Búsqueda.</> }
        : { t: 'Reportar y seguir solicitudes', c: <>Reporta con <strong>«Nueva solicitud»</strong> lo que llega para verificar; el equipo correspondiente lo confirmará o descartará. Toca una solicitud para seguir su estado.</> };

  // Conteos por GRUPO de estado. Cada caso cae en exactamente un grupo, así que los
  // tres grupos suman el total. Antes solo se contaban 'en_proceso', 'confirmado' y
  // 'falso'; los 'pendiente' (reportes recién llegados, sin tomar), 'enviado_redaccion'
  // y 'resuelto' no aparecían en ninguna tarjeta y "se perdían" respecto al total.
  const cnt = (estados?: string[]) => {
    let q = supabase.from('casos').select('*', { count: 'exact', head: true });
    if (estados && estados.length) q = q.in('estado', estados);
    return q;
  };
  const [total, pendientes, enProceso, conf, cerrados, confirmados, perfilesRes] = await Promise.all([
    cnt(),
    cnt(['pendiente']),
    cnt(['en_proceso']),
    cnt(['confirmado', 'enviado_redaccion']),
    cnt(['falso', 'resuelto']),
    cnt(['confirmado']),
    supabase.from('perfiles').select('id, nombre_completo, avatar_url'),
  ]);

  // Filtro de estado por URL: admite un estado o una lista separada por comas (las
  // tarjetas KPI enlazan a grupos como 'falso,resuelto'). Se validan contra el enum
  // real para no romper la consulta con un valor inexistente.
  const ESTADOS_VALIDOS = ['pendiente', 'en_proceso', 'confirmado', 'falso', 'enviado_redaccion', 'resuelto'];
  const estadoFiltro = (searchParams.estado ?? '').split(',').map((s) => s.trim()).filter((e) => ESTADOS_VALIDOS.includes(e));
  let q = supabase.from('casos').select(COLS).order('actualizado_en', { ascending: false }).limit(200);
  if (estadoFiltro.length === 1) q = q.eq('estado', estadoFiltro[0]);
  else if (estadoFiltro.length > 1) q = q.in('estado', estadoFiltro);
  if (searchParams.categoria) q = q.eq('categoria', searchParams.categoria);
  if (searchParams.q) {
    const s = searchParams.q.replace(/[%,()]/g, ' ').trim();
    // Si lo buscado parece un número de solicitud (#00012, 12 o SOL-00012),
    // también se compara contra el correlativo `numero`.
    const n = s.match(/^(?:sol[-\s]?)?#?0*(\d{1,10})$/i)?.[1];
    const partes = [`titulo.ilike.%${s}%`, `descripcion.ilike.%${s}%`, `fuente.ilike.%${s}%`];
    if (n) partes.push('numero.eq.' + Number(n));
    q = q.or(partes.join(','));
  }
  const { data: casos } = await q;

  // punto_tipo (0145) best-effort: si la migración aún no está aplicada en la base, se
  // omite sin romper el tablero (se consulta aparte para no arrastrar el error a la página).
  const puntoPorCaso = new Map<string, string>();
  if ((casos ?? []).length) {
    const { data: pts } = await supabase.from('casos').select('id, punto_tipo').in('id', (casos as any[]).map((c) => c.id));
    for (const r of ((pts ?? []) as any[])) if (r.punto_tipo) puntoPorCaso.set(r.id, r.punto_tipo);
  }

  const { data: listos } = await supabase.from('casos')
    .select('id, numero, titulo, asignado_a').eq('estado', 'confirmado')
    .order('actualizado_en', { ascending: false }).limit(8);

  const pasos = pasosFlujo(await contarFlujo(supabase));

  // Panel lateral (drawer) cuando hay ?caso=ID, conservando los filtros.
  const filtros = new URLSearchParams();
  if (searchParams.q) filtros.set('q', searchParams.q);
  if (searchParams.estado) filtros.set('estado', searchParams.estado);
  if (searchParams.categoria) filtros.set('categoria', searchParams.categoria);
  const hrefCaso = (cid: string) => { const p = new URLSearchParams(filtros); p.set('caso', cid); return '/casos?' + p.toString(); };
  const cerrarHref = '/casos' + (filtros.toString() ? '?' + filtros.toString() : '');
  // Nombres para mostrar «tomado por» en la lista (respeta la privacidad de apellidos).
  const nombresCaso = new Map<string, string>(((perfilesRes.data ?? []) as any[]).map((p) => [p.id, nombreMostrado(p.nombre_completo, esAdmin)]));
  // Enlaces de los KPIs preservando la búsqueda y la categoría activas.
  const kpiHref = (estado?: string) => {
    const p = new URLSearchParams();
    if (searchParams.q) p.set('q', searchParams.q);
    if (searchParams.categoria) p.set('categoria', searchParams.categoria);
    if (estado) p.set('estado', estado);
    const s = p.toString();
    return '/casos' + (s ? '?' + s : '');
  };
  // El paso «Envío a Redacción» del flujo enlaza a esa sección solo para quien puede
  // entrar (admin/redacción); el resto (Recopilación, Verificación) va a la lista de
  // solicitudes ya enviadas, para no caer en una redirección.
  if (!esAdmin && !rolesU.includes('redaccion')) {
    const ultimo = pasos[pasos.length - 1];
    if (ultimo) ultimo.href = kpiHref('enviado_redaccion');
  }

  let drawerCaso: any = null; let drawerHist: any[] = []; let drawerSol: any = null; let esMandoVerif = false;
  if (searchParams.caso) {
    const [{ data: dc }, { data: dh }, { data: dAdj }, { data: ds }] = await Promise.all([
      supabase.from('casos').select('id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, contacto, estado, notas, info_requerida, creado_por, creado_en, asignado_a, es_requerimiento, lat, lng, req_tipo, req_cantidad, req_urgencia, publicado_en, publicacion_url, publicado_por').eq('id', searchParams.caso).single(),
      supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en').eq('entidad', 'casos').eq('entidad_id', searchParams.caso).order('creado_en', { ascending: false }).limit(50),
      supabase.from('casos_adjuntos').select('id, url, nombre').eq('caso_id', searchParams.caso).order('creado_en'),
      supabase.from('solicitudes_insumo').select('id, estado').eq('caso_id', searchParams.caso).maybeSingle(),
    ]);
    drawerCaso = dc; drawerHist = dh ?? []; drawerSol = ds;
    if (drawerCaso) {
      // Los mandos de verificación (líder/coordinador) pueden revertir (migración 0147).
      // Si la función aún no existe, rpc devuelve error → false (no rompe).
      const { data: mandoVerif } = await supabase.rpc('es_mando_verificacion');
      esMandoVerif = mandoVerif === true;
      // Campos de «punto del mapa» (0145) best-effort: si faltan las columnas, el
      // detalle igual abre (sin la info de punto) en vez de romper el render.
      const { data: dpunto } = await supabase.from('casos')
        .select('punto_tipo, punto_temporal, punto_acopio_id').eq('id', searchParams.caso).maybeSingle();
      if (dpunto) Object.assign(drawerCaso, dpunto);
      const { urlFirmada } = await import('@/lib/storage');
      drawerCaso.adjuntos = await Promise.all(((dAdj ?? []) as any[]).map(async (a) => ({
        ...a, href: await urlFirmada(supabase, 'adjuntos', a.url, 3600),
      })));
    }
  }

  return (
    <AnimarEntrada>
      <Consejo id="casos" titulo={tipCasos.t}>{tipCasos.c}</Consejo>
      <div className="pagina-cab">
        <div>
          <h1>Solicitudes</h1>
          <p className="muted sub">{puedeVerif ? 'Verifica la información que llega: confírmala o descártala.' : accesoBusqueda ? 'Verifica los casos de personas desaparecidas: confírmalos o descártalos.' : 'Registra solicitudes y da seguimiento a las tuyas.'}</p>
        </div>
      </div>

      {/* Tarjetas de resumen: se muestran a TODOS los que acceden (Recopilación
          incluida). Los conteos son RLS-scoped, así que cada quien ve los suyos:
          un recopilador ve sus solicitudes; un mando/admin ve las del área. */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Total de solicitudes" valor={total.count ?? 0} sub={soloBusqueda ? 'Desaparecidos' : 'Todos los registros'} color="var(--azul)" icono="documento" tinte="#eef2ff" href={kpiHref()} />
        <Kpi etiqueta="Pendientes" valor={pendientes.count ?? 0} sub="Recién llegados, sin tomar" color="#475569" icono="reloj" tinte="#f1f5f9" href={kpiHref('pendiente')} />
        <Kpi etiqueta="En proceso" valor={enProceso.count ?? 0} sub="Ya tomados, en verificación" color="#a16207" icono="reloj" tinte="#fef9c3" href={kpiHref('en_proceso')} />
        <Kpi etiqueta="Confirmados y activos" valor={conf.count ?? 0} sub={soloBusqueda ? 'Verificados' : 'Confirmados y en redacción'} color="#16a34a" icono="ok" tinte="#d1fae5" href={kpiHref('confirmado,enviado_redaccion')} />
        <Kpi etiqueta="Falsos / resueltos" valor={cerrados.count ?? 0} sub="No continúan" color="#b91c1c" icono="cerrar" tinte="#fee2e2" href={kpiHref('falso,resuelto')} />
      </div>

      {/* Tira del flujo: para todos menos quien solo ve Desaparecidos (esos tienen su
          propio flujo en /busqueda). Los conteos también son RLS-scoped. */}
      {!soloBusqueda && <>
      <p className="muted" style={{ margin: '0 0 6px', fontWeight: 600 }}>El flujo · toca una etapa para abrirla</p>
      <FlujoTrabajo pasos={pasos} />
      </>}

      <div className="toolbar" style={{ marginTop: 14 }}>
        <form method="get" className="fila crece" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 0 }}>
          <BarraBusqueda name="q" placeholder="Buscar por número (#00012), título, descripción o fuente…" defaultValue={searchParams.q ?? ''} className="crece" />
          <div className="campo-filtro">
            <label htmlFor="filtro-estado">Estado</label>
            <FiltroSelect id="filtro-estado" name="estado" className="input" defaultValue={searchParams.estado ?? ''} style={{ width: 'auto' }}>
              <option value="">Todos</option>
              {ESTADOS_CASO.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_CASO[e]}</option>)}
            </FiltroSelect>
          </div>
          <div className="campo-filtro">
            <label htmlFor="filtro-categoria">Categoría</label>
            <FiltroSelect id="filtro-categoria" name="categoria" className="input" defaultValue={searchParams.categoria ?? ''} style={{ width: 'auto' }}>
              <option value="">Todas</option>
              {subAreas.map((c) => <option key={c} value={c}>{c}</option>)}
            </FiltroSelect>
          </div>
          <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
          {(searchParams.q || searchParams.estado || searchParams.categoria) && <Link className="btn" href="/casos">Limpiar</Link>}
        </form>
        <div className="toolbar-acciones">
          <BotonActualizar />
          <BotonExportar
            csvHref={'/casos/export' + (filtros.toString() ? '?' + filtros.toString() : '')}
            imprimirHref={'/casos/imprimir' + (filtros.toString() ? '?' + filtros.toString() : '')}
          />
          {puedeCrear && <Link className="btn btn-primario" href="/casos/nuevo"><Icono nombre="mas" /> Nueva solicitud</Link>}
        </div>
      </div>

      {/* Filtro rápido por sub-área de verificación (solo si ve más de una) */}
      {subAreas.length > 1 && <div className="fila" style={{ gap: 8, marginBottom: 14 }}>
        <span className="muted" style={{ fontSize: '.82rem' }}>Sub-áreas:</span>
        {subAreas.map((cat) => {
          const activo = searchParams.categoria === cat;
          const p = new URLSearchParams();
          if (searchParams.q) p.set('q', searchParams.q);
          if (searchParams.estado) p.set('estado', searchParams.estado);
          if (!activo) p.set('categoria', cat);
          return (
            <Link key={cat} href={'/casos' + (p.toString() ? '?' + p.toString() : '')}
              className={'pill ' + (activo ? 'pill-info' : 'pill-neutra')} style={{ textDecoration: 'none' }}>
              {cat}
            </Link>
          );
        })}
      </div>}

      <div>
        <div className="grupo-main">
      <div className="tarjeta">
        {(casos ?? []).length === 0 ? (
          (total.count ?? 0) === 0 ? (
            <div className="vacio">
              <Icono nombre="documento" size={42} />
              <h3 style={{ margin: '10px 0 4px' }}>Aún no hay solicitudes</h3>
              <p className="muted" style={{ margin: '0 auto 14px', maxWidth: 440 }}>Cuando el equipo de recopilación reporte información, aparecerá aquí para verificarla.</p>
              <Link href="/casos/nuevo" className="btn btn-primario"><Icono nombre="mas" size={16} /> Reportar una solicitud</Link>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>No hay solicitudes con esos filtros. <Link href={cerrarHref}>Limpiar filtros</Link>.</p>
          )
        ) : (
          <div className="tabla-scroll"><table>
            <thead><tr><th>ID</th><th>Título</th><th>Categoría</th><th>Fuente</th><th>Estado</th><th>Actualización</th></tr></thead>
            <tbody>
              {(casos ?? []).map((c: any) => (
                <tr key={c.id}>
                  <td className="muted">#{String(c.numero).padStart(5, '0')}</td>
                  <td>
                    <div className="celda-titulo">
                      <span className="fila" style={{ gap: 6 }}>
                        <Link href={hrefCaso(c.id)}>{c.titulo}</Link>
                        {c.fecha_publicacion && (Date.now() - new Date(c.fecha_publicacion + 'T00:00:00').getTime()) > 2 * 86400000 ? (
                          <Pill tono="aviso" punto={false}>+2 días</Pill>
                        ) : null}
                      </span>
                      {c.descripcion && <div className="desc">{String(c.descripcion).slice(0, 60)}</div>}
                      {c.asignado_a && <div className="muted" style={{ fontSize: '.76rem', marginTop: 2 }}><Icono nombre="grupos" size={11} /> Tomado por {nombresCaso.get(c.asignado_a) ?? '—'}</div>}
                    </div>
                  </td>
                  <td>{c.categoria ? <BadgeCategoria>{c.categoria}</BadgeCategoria> : '—'}{(() => { const pt = puntoPorCaso.get(c.id); return pt ? <div style={{ marginTop: 4 }}><Pill tono={TONO_TIPO_LUGAR[pt] ?? 'info'} punto={false}>Punto: {ETIQUETA_TIPO_LUGAR[pt] ?? pt}</Pill></div> : null; })()}</td>
                  <td>{(() => { const h = hrefSeguro(c.fuente_url); return h ? <a href={h} target="_blank" rel="noopener noreferrer">{c.fuente || 'enlace'}</a> : (c.fuente || '—'); })()}</td>
                  <td>
                    <EstadoCaso estado={c.estado} />
                    {c.info_requerida && <div style={{ marginTop: 4 }}><Pill tono="aviso" punto={false}>Requiere info</Pill></div>}
                    {(() => { const p = pasoDeCaso(c.estado); return <FlujoProgreso paso={p.paso} total={p.total} etiqueta={p.etiqueta} fuera={p.fuera} compacto />; })()}
                  </td>
                  <td className="muted" style={{ fontSize: '.82rem' }}>{fechaHora(c.actualizado_en)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
        </div>
        {drawerCaso && (
          <>
            <Link href={cerrarHref} className="drawer-backdrop" aria-label="Cerrar detalle" />
            <DrawerModal cerrarHref={cerrarHref} etiqueta={'Detalle de la solicitud ' + drawerCaso.titulo}>
              <DetalleCaso caso={drawerCaso} perfiles={perfilesRes.data ?? []} historial={drawerHist} volver={hrefCaso(drawerCaso.id)} cerrarHref={cerrarHref} puedeEditar={verifica} solicitud={drawerSol}
                puedeEditarDatos={esAdmin || (verifica && drawerCaso.estado !== 'enviado_redaccion') || (drawerCaso.creado_por === user!.id && ['pendiente', 'en_proceso'].includes(drawerCaso.estado))}
                esAdmin={esAdmin} esMandoVerif={esMandoVerif} puedeTomar={verifica} miId={user!.id} />
            </DrawerModal>
          </>
        )}
      </div>

      {puedeVerif && <>
      <h2 className="fila" style={{ gap: 8 }}>
        <span className="kpi-ico" style={{ width: 32, height: 32, background: 'var(--t-verde-bg)', color: 'var(--t-verde-fg)' }}><Icono nombre="ok" size={18} /></span>
        Listos para redacción <Pill tono="ok" punto={false}>{confirmados.count ?? 0}</Pill>
      </h2>
      <p className="muted" style={{ marginTop: -6 }}>Solicitudes confirmadas y activas, listas para pasar a la siguiente etapa.</p>
      {(listos ?? []).length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Aún no hay solicitudes confirmadas.</p></div>
      ) : (
        <Carrusel>
          {(listos ?? []).map((c: any) => (
            <Link key={c.id} href={hrefCaso(c.id)} className="tarjeta carrusel-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="muted" style={{ fontSize: '.8rem' }}>#{String(c.numero).padStart(5, '0')}</div>
              <strong>{c.titulo}</strong>
              <div style={{ margin: '8px 0' }} />
              <EstadoCaso estado="confirmado" />
            </Link>
          ))}
        </Carrusel>
      )}
</>}
    </AnimarEntrada>
  );
}
