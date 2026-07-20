import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_URGENCIA } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';

export const metadata = { title: 'Tablero de red' };

const fmt = (n: any) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','); };
// Clave normalizada del producto: sin acentos, minúsculas, espacios colapsados. V1
// empareja por NOMBRE (con la salvedad de que «Agua 5L» y «agua» no se cruzan): un
// catálogo con producto_id sería la mejora de fase 2.
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

type Centro = { punto_id: string; nombre: string };
type Excedente = Centro & { excedente: number; unidad: string | null; producto: string };
type Falta = Centro & { falta: number; necesidad: boolean; urgencia: string | null };
type Prod = {
  clave: string; nombre: string; categoria: string | null; unidades: Set<string>;
  total: number; centros: number; superavit: Excedente[]; deficit: Falta[];
};

/**
 * Tablero de red (V1, solo lectura): la «foto» del acopio que hoy no existe. Cruza las
 * existencias de TODOS los centros contra sus mínimos y las necesidades abiertas para
 * responder «quién tiene de sobra y quién necesita», y así mover el sobrante al
 * faltante. El superávit solo se cuenta cuando el centro fijó un mínimo y está por
 * encima (excedente confirmado); el déficit sale de estar bajo mínimo o de una
 * necesidad marcada. No mueve inventario — eso es el traspaso ya existente (0071).
 */
export default async function TableroRedPage() {
  const { perfil } = await requireUsuario();
  const supabase = await createClient();
  const { data: lider, error } = await supabase.rpc('es_lider_acopio');
  const rolesG = [perfil?.rol, ...((perfil?.roles_extra as string[] | null) ?? [])];
  const acceso = error ? (rolesG.includes('admin') || rolesG.includes('logistica') || rolesG.includes('admin_logistica')) : !!lider;
  if (!acceso) redirect('/dashboard');

  const [{ data: invData }, { data: necData }] = await Promise.all([
    supabase.from('inventario_acopio').select('punto_id, producto, categoria, unidad, cantidad, minimo, puntos_acopio(nombre, activo)'),
    supabase.from('necesidades_acopio').select('punto_id, producto, categoria, urgencia, puntos_acopio(nombre, activo)').eq('resuelta', false),
  ]);
  const inv = ((invData ?? []) as any[]).filter((r) => r.puntos_acopio?.activo !== false);
  const nec = ((necData ?? []) as any[]).filter((r) => r.puntos_acopio?.activo !== false);
  const centrosActivos = new Set<string>(inv.map((r) => r.punto_id));

  const mapa = new Map<string, Prod>();
  const get = (producto: string, categoria: string | null) => {
    const k = norm(producto);
    let p = mapa.get(k);
    if (!p) { p = { clave: k, nombre: producto, categoria: categoria ?? null, unidades: new Set(), total: 0, centros: 0, superavit: [], deficit: [] }; mapa.set(k, p); }
    if (!p.categoria && categoria) p.categoria = categoria;
    return p;
  };

  for (const r of inv) {
    const p = get(r.producto, r.categoria);
    const cant = Number(r.cantidad) || 0;
    const min = r.minimo == null ? 0 : Number(r.minimo) || 0;
    p.total += cant; p.centros += 1;
    if (r.unidad) p.unidades.add(r.unidad);
    const nombre = r.puntos_acopio?.nombre ?? 'Centro';
    if (min > 0 && cant > min) p.superavit.push({ punto_id: r.punto_id, nombre, excedente: cant - min, unidad: r.unidad ?? null, producto: r.producto });
    else if (min > 0 && cant < min) p.deficit.push({ punto_id: r.punto_id, nombre, falta: min - cant, necesidad: false, urgencia: null });
  }
  // Necesidades explícitas → déficit (aunque el centro no tenga fila de inventario).
  for (const r of nec) {
    const p = get(r.producto, r.categoria);
    const nombre = r.puntos_acopio?.nombre ?? 'Centro';
    const ex = p.deficit.find((d) => d.punto_id === r.punto_id);
    if (ex) { ex.necesidad = true; ex.urgencia = r.urgencia ?? null; }
    else p.deficit.push({ punto_id: r.punto_id, nombre, falta: 0, necesidad: true, urgencia: r.urgencia ?? null });
  }

  const productos = [...mapa.values()];
  productos.forEach((p) => {
    p.superavit.sort((a, b) => b.excedente - a.excedente);
    p.deficit.sort((a, b) => (Number(b.necesidad) - Number(a.necesidad)) || (b.falta - a.falta));
  });

  // Oportunidades: superávit en un centro Y déficit/necesidad en otro (del mismo producto).
  const oportunidades = productos
    .filter((p) => p.superavit.length > 0 && p.deficit.length > 0)
    .sort((a, b) => b.deficit.length - a.deficit.length || (b.superavit[0]?.excedente ?? 0) - (a.superavit[0]?.excedente ?? 0));
  // Déficit sin cobertura en la red: se necesita pero NADIE tiene excedente → conseguir fuera.
  const sinCobertura = productos
    .filter((p) => p.deficit.length > 0 && p.superavit.length === 0)
    .sort((a, b) => b.deficit.length - a.deficit.length);
  // Inventario de la red por producto (todo lo que hay), de mayor a menor presencia.
  const porProducto = [...productos].sort((a, b) => b.centros - a.centros || b.total - a.total);

  const uni = (p: Prod) => (p.unidades.size === 1 ? [...p.unidades][0] : '');

  return (
    <div>
      <RealtimeRefrescar tabla="inventario_acopio" />
      <RealtimeRefrescar tabla="necesidades_acopio" />
      <Link href="/acopio" className="muted">← Centros de acopio</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="grupos" size={24} /> Tablero de red</h1>
          <p className="muted sub">La foto de toda la red: quién tiene de sobra y quién necesita, para mover el sobrante al faltante. Solo lectura — el traspaso se pide desde cada centro.</p>
        </div>
        <div className="fila" style={{ gap: 6 }}>
          {oportunidades.length > 0 && <Pill tono="ok" punto={false}>{oportunidades.length} oportunidades</Pill>}
          {sinCobertura.length > 0 && <Pill tono="critica" punto={false}>{sinCobertura.length} sin cobertura</Pill>}
          <Pill tono="neutra" punto={false}>{centrosActivos.size} centros</Pill>
        </div>
      </div>

      {/* Oportunidades de traspaso: superávit ↔ déficit */}
      <h2 className="fila" style={{ gap: 6 }}><Icono nombre="camion" size={20} /> Oportunidades de traspaso</h2>
      {oportunidades.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>
          Ahora mismo no hay un producto que sobre en un centro y falte en otro. Para sugerir traspasos, cada centro debe fijar el <strong>mínimo</strong> de sus productos.
        </p></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {oportunidades.map((p) => (
            <div key={p.clave} className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <strong style={{ fontSize: '1.02rem' }}>{p.nombre}</strong>
                  {p.categoria && <div className="muted" style={{ fontSize: '.78rem' }}>{ETIQUETA_TIPO_INSUMO[p.categoria] ?? p.categoria}</div>}
                </div>
                <Pill tono="neutra" punto={false}>{fmt(p.total)}{uni(p) ? ' ' + uni(p) : ''} en red</Pill>
              </div>
              <div>
                <div className="muted" style={{ fontSize: '.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--verde, #1c8a5c)' }}>▲ De sobra</div>
                {p.superavit.slice(0, 4).map((s) => (
                  <div key={s.punto_id} className="fila" style={{ justifyContent: 'space-between', gap: 8, fontSize: '.9rem' }}>
                    <Link href={'/acopio/' + s.punto_id}>{s.nombre}</Link>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>+{fmt(s.excedente)}{s.unidad ? ' ' + s.unidad : ''}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="muted" style={{ fontSize: '.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--rojo, #bb2138)' }}>▼ Necesita</div>
                {p.deficit.slice(0, 4).map((d) => (
                  <div key={d.punto_id} className="fila" style={{ justifyContent: 'space-between', gap: 8, fontSize: '.9rem' }}>
                    <Link href={'/acopio/' + d.punto_id}>{d.nombre}</Link>
                    <span className="fila" style={{ gap: 6, whiteSpace: 'nowrap' }}>
                      {d.necesidad && <Pill tono={d.urgencia === 'alta' ? 'critica' : 'aviso'} punto={false}>{ETIQUETA_URGENCIA[d.urgencia as keyof typeof ETIQUETA_URGENCIA] ?? 'necesita'}</Pill>}
                      {d.falta > 0 && <span style={{ fontWeight: 600 }}>−{fmt(d.falta)}</span>}
                    </span>
                  </div>
                ))}
              </div>
              {(() => {
                // Emparejador: precarga el traspaso directo desde el mayor excedente hacia el
                // primer centro en déficit que NO sea el mismo (la RPC exige origen ≠ destino).
                const top = p.superavit[0];
                const need = p.deficit.find((d) => d.punto_id !== top?.punto_id);
                if (!top || !need) return null;
                const sug = Math.min(top.excedente, need.falta > 0 ? need.falta : top.excedente);
                const href = `/acopio/${top.punto_id}?tr_producto=${encodeURIComponent(top.producto)}&tr_destino=${need.punto_id}&tr_cant=${sug}#traspasar`;
                return (
                  <div style={{ borderTop: '1px dashed var(--borde)', paddingTop: 10 }}>
                    <Link href={href} className="btn btn-acento" style={{ width: '100%', justifyContent: 'center' }}>
                      <Icono nombre="camion" size={16} /> Preparar traspaso
                    </Link>
                    <div className="muted" style={{ fontSize: '.8rem', marginTop: 6, textAlign: 'center' }}>
                      {top.nombre} → {need.nombre} · sugerido {fmt(sug)}{uni(p) ? ' ' + uni(p) : ''}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* Déficit sin cobertura interna */}
      {sinCobertura.length > 0 && (
        <>
          <h2 className="fila" style={{ gap: 6, marginTop: 18 }}><Icono nombre="avisos" size={20} /> Necesario, pero nadie tiene de sobra</h2>
          <p className="muted" style={{ marginTop: 0 }}>Estos productos hacen falta y ningún centro de la red tiene excedente: hay que conseguirlos por fuera (donaciones / captación).</p>
          <div className="tarjeta"><div className="tabla-scroll"><table>
            <thead><tr><th>Producto</th><th>Categoría</th><th>Centros que lo necesitan</th></tr></thead>
            <tbody>
              {sinCobertura.map((p) => (
                <tr key={p.clave}>
                  <td><strong>{p.nombre}</strong></td>
                  <td className="muted">{p.categoria ? (ETIQUETA_TIPO_INSUMO[p.categoria] ?? p.categoria) : '—'}</td>
                  <td>{p.deficit.map((d) => d.nombre).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        </>
      )}

      {/* Inventario de la red por producto */}
      <h2 className="fila" style={{ gap: 6, marginTop: 18 }}><Icono nombre="caja" size={20} /> Inventario de la red por producto</h2>
      {porProducto.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Aún no hay existencias registradas en los centros.</p></div>
      ) : (
        <div className="tarjeta"><div className="tabla-scroll"><table>
          <thead><tr><th>Producto</th><th>Categoría</th><th>Total en red</th><th>Centros</th><th>De sobra</th><th>Necesitan</th></tr></thead>
          <tbody>
            {porProducto.map((p) => (
              <tr key={p.clave}>
                <td><strong>{p.nombre}</strong></td>
                <td className="muted">{p.categoria ? (ETIQUETA_TIPO_INSUMO[p.categoria] ?? p.categoria) : '—'}</td>
                <td>{fmt(p.total)} <span className="muted" style={{ fontSize: '.8rem' }}>{uni(p)}</span></td>
                <td className="muted">{p.centros}</td>
                <td>{p.superavit.length > 0 ? <Pill tono="ok" punto={false}>{p.superavit.length}</Pill> : <span className="muted">—</span>}</td>
                <td>{p.deficit.length > 0 ? <Pill tono="critica" punto={false}>{p.deficit.length}</Pill> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}

      <p className="muted" style={{ fontSize: '.8rem', marginTop: 14 }}>
        El emparejamiento es por nombre de producto: «Agua 5L» y «agua» no se cruzan. Fija el <strong>mínimo</strong> de cada producto en tu centro para que aparezcan las oportunidades.
      </p>
    </div>
  );
}
