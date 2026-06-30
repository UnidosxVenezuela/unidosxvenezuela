import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerificar } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ESTADO_CASO, ESTADOS_CASO, CATEGORIAS_CASO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';
import EstadoCaso from '@/components/EstadoCaso';
import AnimarEntrada from '@/components/AnimarEntrada';

type SP = { q?: string; estado?: string; categoria?: string };
const COLS = 'id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, asignado_a, estado, actualizado_en';

export default async function CasosPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  if (!puedeVerificar(perfil?.rol)) redirect('/dashboard');
  const supabase = await createClient();

  const cnt = (estado?: string) => {
    let q = supabase.from('casos').select('*', { count: 'exact', head: true });
    if (estado) q = q.eq('estado', estado);
    return q;
  };
  const [total, enProc, conf, falso, perfilesRes] = await Promise.all([
    cnt(), cnt('en_proceso'), cnt('confirmado'), cnt('falso'),
    supabase.from('perfiles').select('id, nombre_completo'),
  ]);
  const nombres = new Map<string, string>((perfilesRes.data ?? []).map((p: any) => [p.id, p.nombre_completo]));

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

  const kpi = (label: string, valor: number, sub: string, color: string, href: string) => (
    <Link href={href} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="muted">{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{valor}</div>
      <div className="muted" style={{ fontSize: '.8rem' }}>{sub}</div>
    </Link>
  );

  return (
    <AnimarEntrada>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>Panel de Verificación</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Seguimiento de la información enviada para verificar.</p>
        </div>
        <div className="fila">
          <BotonActualizar />
          <Link className="btn btn-primario" href="/casos/nuevo"><Icono nombre="mas" /> Nuevo caso</Link>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '14px 0' }}>
        {kpi('Total de casos', total.count ?? 0, 'Todos los registros', 'var(--texto)', '/casos')}
        {kpi('En proceso', enProc.count ?? 0, 'Siendo verificados', '#a16207', '/casos?estado=en_proceso')}
        {kpi('Confirmados y activos', conf.count ?? 0, 'Listos para redacción', '#16a34a', '/casos?estado=confirmado')}
        {kpi('Falsos / resueltos', falso.count ?? 0, 'No continúan', '#b91c1c', '/casos?estado=falso')}
      </div>

      <form method="get" className="fila" style={{ marginBottom: 12 }}>
        <input name="q" className="input" placeholder="Buscar por título, descripción o fuente…" defaultValue={searchParams.q ?? ''} style={{ maxWidth: 320 }} />
        <select name="estado" className="input" defaultValue={searchParams.estado ?? ''} style={{ width: 'auto' }}>
          <option value="">Todos los estados</option>
          {ESTADOS_CASO.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_CASO[e]}</option>)}
        </select>
        <select name="categoria" className="input" defaultValue={searchParams.categoria ?? ''} style={{ width: 'auto' }}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS_CASO.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
        {(searchParams.q || searchParams.estado || searchParams.categoria) && <Link className="btn" href="/casos">Limpiar</Link>}
      </form>

      <div className="tarjeta">
        {(casos ?? []).length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No hay casos con esos filtros.</p>
        ) : (
          <table>
            <thead><tr><th>ID</th><th>Título</th><th>Categoría</th><th>Fuente</th><th>Asignado a</th><th>Estado</th><th>Actualización</th></tr></thead>
            <tbody>
              {(casos ?? []).map((c: any) => (
                <tr key={c.id}>
                  <td className="muted">#{String(c.numero).padStart(5, '0')}</td>
                  <td>
                    <Link href={'/casos/' + c.id}>{c.titulo}</Link>
                    {c.descripcion && <div className="muted" style={{ fontSize: '.82rem' }}>{String(c.descripcion).slice(0, 60)}</div>}
                  </td>
                  <td>{c.categoria ? <span className="insignia">{c.categoria}</span> : '—'}</td>
                  <td>{c.fuente_url ? <a href={c.fuente_url} target="_blank" rel="noopener noreferrer">{c.fuente || 'enlace'}</a> : (c.fuente || '—')}</td>
                  <td>{nombres.get(c.asignado_a) ?? '—'}</td>
                  <td><EstadoCaso estado={c.estado} /></td>
                  <td className="muted" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{new Date(c.actualizado_en).toLocaleString('es-VE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="fila" style={{ gap: 6 }}><Icono nombre="ok" size={20} /> Listos para redacción <span className="insignia ok">{conf.count ?? 0}</span></h2>
      <p className="muted" style={{ marginTop: -6 }}>Casos confirmados y activos, listos para pasar a la siguiente etapa.</p>
      {(listos ?? []).length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Aún no hay casos confirmados.</p></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
          {(listos ?? []).map((c: any) => (
            <Link key={c.id} href={'/casos/' + c.id} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="muted" style={{ fontSize: '.8rem' }}>#{String(c.numero).padStart(5, '0')}</div>
              <strong>{c.titulo}</strong>
              <div className="muted" style={{ fontSize: '.85rem', marginTop: 6 }}>{nombres.get(c.asignado_a) ?? 'Sin asignar'}</div>
              <div style={{ marginTop: 8 }}><EstadoCaso estado="confirmado" /></div>
            </Link>
          ))}
        </div>
      )}
    </AnimarEntrada>
  );
}
