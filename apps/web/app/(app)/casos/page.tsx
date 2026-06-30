import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerificar, puedeRecopilar } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ESTADO_CASO, ESTADOS_CASO, CATEGORIAS_CASO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';
import EstadoCaso from '@/components/EstadoCaso';
import AnimarEntrada from '@/components/AnimarEntrada';
import Avatar from '@/components/Avatar';
import MenuFila from '@/components/MenuFila';
import Kpi from '@/components/Kpi';
import Pill from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import BarraBusqueda from '@/components/BarraBusqueda';
import Carrusel from '@/components/Carrusel';
import DetalleCaso from './DetalleCaso';

type SP = { q?: string; estado?: string; categoria?: string; caso?: string };
const COLS = 'id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, asignado_a, estado, actualizado_en';

export default async function CasosPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  if (!puedeRecopilar(perfil?.rol)) redirect('/dashboard');
  const puedeVerif = puedeVerificar(perfil?.rol);
  const supabase = await createClient();

  const cnt = (estado?: string) => {
    let q = supabase.from('casos').select('*', { count: 'exact', head: true });
    if (estado) q = q.eq('estado', estado);
    return q;
  };
  const [total, enProc, conf, falso, perfilesRes] = await Promise.all([
    cnt(), cnt('en_proceso'), cnt('confirmado'), cnt('falso'),
    supabase.from('perfiles').select('id, nombre_completo, avatar_url'),
  ]);
  const nombres = new Map<string, string>((perfilesRes.data ?? []).map((p: any) => [p.id, p.nombre_completo]));
  const avatares = new Map<string, string | null>((perfilesRes.data ?? []).map((p: any) => [p.id, p.avatar_url]));

  let q = supabase.from('casos').select(COLS).order('actualizado_en', { ascending: false }).limit(200);
  if (searchParams.estado) q = q.eq('estado', searchParams.estado);
  if (searchParams.categoria) q = q.eq('categoria', searchParams.categoria);
  if (searchParams.q) {
    const s = searchParams.q.replace(/[%,()]/g, ' ');
    q = q.or(`titulo.ilike.%${s}%,descripcion.ilike.%${s}%,fuente.ilike.%${s}%`);
  }
  const { data: casos } = await q;

  const { data: listos } = await supabase.from('casos')
    .select('id, numero, titulo, asignado_a').eq('estado', 'confirmado')
    .order('actualizado_en', { ascending: false }).limit(8);

  // Panel lateral (drawer) cuando hay ?caso=ID, conservando los filtros.
  const filtros = new URLSearchParams();
  if (searchParams.q) filtros.set('q', searchParams.q);
  if (searchParams.estado) filtros.set('estado', searchParams.estado);
  if (searchParams.categoria) filtros.set('categoria', searchParams.categoria);
  const hrefCaso = (cid: string) => { const p = new URLSearchParams(filtros); p.set('caso', cid); return '/casos?' + p.toString(); };
  const cerrarHref = '/casos' + (filtros.toString() ? '?' + filtros.toString() : '');

  let drawerCaso: any = null; let drawerHist: any[] = [];
  if (searchParams.caso) {
    const [{ data: dc }, { data: dh }] = await Promise.all([
      supabase.from('casos').select('id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, asignado_a, estado, notas').eq('id', searchParams.caso).single(),
      supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en').eq('entidad', 'casos').eq('entidad_id', searchParams.caso).order('creado_en', { ascending: false }).limit(50),
    ]);
    drawerCaso = dc; drawerHist = dh ?? [];
  }

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1>Panel de Verificación</h1>
          <p className="muted sub">Gestiona y da seguimiento a toda la información enviada por el equipo de recopilación.</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Total de casos" valor={total.count ?? 0} sub="Todos los registros" color="var(--azul)" icono="documento" tinte="#eef2ff" href="/casos" />
        <Kpi etiqueta="En proceso" valor={enProc.count ?? 0} sub="Siendo verificados" color="#a16207" icono="reloj" tinte="#fef9c3" href="/casos?estado=en_proceso" />
        <Kpi etiqueta="Confirmados y activos" valor={conf.count ?? 0} sub="Listos para redacción" color="#16a34a" icono="ok" tinte="#d1fae5" href="/casos?estado=confirmado" />
        <Kpi etiqueta="Falsos / resueltos" valor={falso.count ?? 0} sub="No continúan" color="#b91c1c" icono="cerrar" tinte="#fee2e2" href="/casos?estado=falso" />
      </div>

      <div className="toolbar">
        <form method="get" className="fila crece" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 0 }}>
          <BarraBusqueda name="q" placeholder="Buscar por título, descripción o fuente…" defaultValue={searchParams.q ?? ''} className="crece" />
          <div className="campo-filtro">
            <label>Estado</label>
            <select name="estado" className="input" defaultValue={searchParams.estado ?? ''} style={{ width: 'auto' }}>
              <option value="">Todos</option>
              {ESTADOS_CASO.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_CASO[e]}</option>)}
            </select>
          </div>
          <div className="campo-filtro">
            <label>Categoría</label>
            <select name="categoria" className="input" defaultValue={searchParams.categoria ?? ''} style={{ width: 'auto' }}>
              <option value="">Todas</option>
              {CATEGORIAS_CASO.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
          {(searchParams.q || searchParams.estado || searchParams.categoria) && <Link className="btn" href="/casos">Limpiar</Link>}
        </form>
        <div className="toolbar-acciones">
          <BotonActualizar />
          <Link className="btn btn-primario" href="/casos/nuevo"><Icono nombre="mas" /> Nuevo caso</Link>
        </div>
      </div>

      <div className={drawerCaso ? 'grupo-grid' : undefined}>
        <div className="grupo-main">
      <div className="tarjeta">
        {(casos ?? []).length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No hay casos con esos filtros.</p>
        ) : (
          <table className={drawerCaso ? 'tabla-compacta' : undefined}>
            <thead><tr><th>ID</th><th>Título</th><th>Categoría</th><th>Fuente</th><th>Asignado a</th><th>Estado</th><th>Actualización</th><th aria-label="Acciones"></th></tr></thead>
            <tbody>
              {(casos ?? []).map((c: any) => (
                <tr key={c.id}>
                  <td className="muted">#{String(c.numero).padStart(5, '0')}</td>
                  <td>
                    <div className="celda-titulo">
                      <Link href={hrefCaso(c.id)}>{c.titulo}</Link>
                      {c.descripcion && <div className="desc">{String(c.descripcion).slice(0, 60)}</div>}
                    </div>
                  </td>
                  <td>{c.categoria ? <BadgeCategoria>{c.categoria}</BadgeCategoria> : '—'}</td>
                  <td>{c.fuente_url ? <a href={c.fuente_url} target="_blank" rel="noopener noreferrer">{c.fuente || 'enlace'}</a> : (c.fuente || '—')}</td>
                  <td>
                    {c.asignado_a
                      ? <span className="fila" style={{ gap: 6, flexWrap: 'nowrap' }}><Avatar nombre={nombres.get(c.asignado_a)} url={avatares.get(c.asignado_a)} /> {nombres.get(c.asignado_a) ?? '—'}</span>
                      : <span className="muted">Sin asignar</span>}
                  </td>
                  <td><EstadoCaso estado={c.estado} /></td>
                  <td className="muted" style={{ fontSize: '.82rem' }}>{new Date(c.actualizado_en).toLocaleString('es-VE')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <MenuFila etiqueta={'Acciones del caso ' + c.titulo}>
                      <Link href={hrefCaso(c.id)}><Icono nombre="panel" size={16} /> Abrir panel</Link>
                      <Link href={'/casos/' + c.id}><Icono nombre="enlace" size={16} /> Abrir en página</Link>
                    </MenuFila>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
        </div>
        {drawerCaso && (
          <aside className="grupo-aside">
            <DetalleCaso caso={drawerCaso} perfiles={perfilesRes.data ?? []} historial={drawerHist} volver={hrefCaso(drawerCaso.id)} cerrarHref={cerrarHref} puedeEditar={puedeVerif} />
          </aside>
        )}
      </div>

      <h2 className="fila" style={{ gap: 8 }}>
        <span className="kpi-ico" style={{ width: 32, height: 32, background: '#d1fae5', color: '#16a34a' }}><Icono nombre="ok" size={18} /></span>
        Listos para redacción <Pill tono="ok" punto={false}>{conf.count ?? 0}</Pill>
      </h2>
      <p className="muted" style={{ marginTop: -6 }}>Casos confirmados y activos, listos para pasar a la siguiente etapa.</p>
      {(listos ?? []).length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Aún no hay casos confirmados.</p></div>
      ) : (
        <Carrusel>
          {(listos ?? []).map((c: any) => (
            <Link key={c.id} href={'/casos/' + c.id} className="tarjeta carrusel-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="muted" style={{ fontSize: '.8rem' }}>#{String(c.numero).padStart(5, '0')}</div>
              <strong>{c.titulo}</strong>
              <div className="fila" style={{ gap: 6, margin: '8px 0', fontSize: '.85rem' }}>
                <Avatar nombre={nombres.get(c.asignado_a)} url={avatares.get(c.asignado_a)} size={22} /> {nombres.get(c.asignado_a) ?? 'Sin asignar'}
              </div>
              <EstadoCaso estado="confirmado" />
            </Link>
          ))}
        </Carrusel>
      )}
    </AnimarEntrada>
  );
}
