import QRCode from 'qrcode';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_TIPO_INSUMO, TIPOS_INSUMO, ETIQUETA_URGENCIA, URGENCIAS, claseUrgencia } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import BotonConfirmar from '@/components/BotonConfirmar';
import EscanearProducto from '../EscanearProducto';
import { agregarProducto, ajustarCantidad, fijarCantidad, eliminarProducto, agregarNecesidad, resolverNecesidad } from './actions';

const UNIDADES = ['unidades', 'cajas', 'paquetes', 'kg', 'litros', 'bolsas'];
const fmt = (n: any) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','); };

export default async function CentroAcopioPage({ params }: { params: { id: string } }) {
  await requireUsuario();
  const supabase = await createClient();
  const id = params.id;

  const { data: ok } = await supabase.rpc('puede_gestionar_acopio', { p_punto: id });
  if (!ok) redirect('/acopio');

  const [{ data: centro }, { data: inv }, { data: nec }] = await Promise.all([
    supabase.from('puntos_acopio').select('id, nombre, direccion, telefono, horario, activo').eq('id', id).single(),
    supabase.from('inventario_acopio').select('*').eq('punto_id', id).order('producto'),
    supabase.from('necesidades_acopio').select('*').eq('punto_id', id).eq('resuelta', false).order('creado_en', { ascending: false }),
  ]);
  if (!centro) return <div className="tarjeta"><h2>Centro no encontrado</h2><Link href="/acopio">Volver</Link></div>;

  const inventario = (inv ?? []) as any[];
  const necesidades = (nec ?? []) as any[];
  const totalItems = inventario.reduce((s, i) => s + Number(i.cantidad || 0), 0);

  // QR que abre ESTE inventario en el teléfono.
  const host = headers().get('host') || 'unidosxvnezuela.com';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const url = `${proto}://${host}/acopio/${id}`;
  const qr = await QRCode.toDataURL(url, { width: 220, margin: 1 });

  return (
    <div>
      <RealtimeRefrescar tabla="inventario_acopio" filtro={'punto_id=eq.' + id} />
      <RealtimeRefrescar tabla="necesidades_acopio" filtro={'punto_id=eq.' + id} />
      <Link href="/acopio" className="muted">← Centros de acopio</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="acopio" size={24} /> {centro.nombre}</h1>
          <p className="muted sub">
            {[centro.direccion, centro.horario, centro.telefono].filter(Boolean).join(' · ') || 'Inventario y necesidades del centro.'}
          </p>
        </div>
      </div>

      <div className="grupo-grid">
        <div className="grupo-main">
          {/* Inventario */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="caja" size={20} /> Inventario <Pill tono="neutra" punto={false}>{inventario.length} productos · {fmt(totalItems)} uds.</Pill></h2>

          <div className="tarjeta">
            <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="mas" size={16} /> Agregar / ingresar producto</h3>
            <EscanearProducto />
            <form action={agregarProducto}>
              <input type="hidden" name="punto_id" value={id} />
              <div className="grid grid-2">
                <div className="campo"><label>Producto</label><input id="producto" name="producto" className="input" required placeholder="Ej. Agua 5L" /></div>
                <div className="campo"><label>Código (opcional)</label><input id="codigo" name="codigo" className="input" placeholder="código de barras/QR" /></div>
                <div className="campo"><label>Categoría</label>
                  <select name="categoria" className="input" defaultValue="">
                    <option value="">—</option>
                    {TIPOS_INSUMO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_INSUMO[t]}</option>)}
                  </select>
                </div>
                <div className="campo"><label>Unidad</label>
                  <select name="unidad" className="input" defaultValue="unidades">
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="campo"><label>Cantidad a ingresar</label><input name="cantidad" className="input" type="number" min={0} step="any" defaultValue={1} /></div>
              </div>
              <button className="btn btn-primario" type="submit"><Icono nombre="mas" size={16} /> Ingresar al inventario</button>
              <p className="muted" style={{ fontSize: '.8rem', marginBottom: 0 }}>Si el producto ya existe, se suma a su cantidad.</p>
            </form>
          </div>

          {inventario.length === 0 ? (
            <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Sin productos todavía. Agrega el primero arriba (o escanea su código).</p></div>
          ) : (
            <div className="tarjeta"><div className="tabla-scroll"><table>
              <thead><tr><th>Producto</th><th>Categoría</th><th>Cantidad</th><th aria-label="Acciones"></th></tr></thead>
              <tbody>
                {inventario.map((it) => (
                  <tr key={it.id}>
                    <td><strong>{it.producto}</strong>{it.codigo && <div className="muted" style={{ fontSize: '.75rem' }}>{it.codigo}</div>}</td>
                    <td>{it.categoria ? (ETIQUETA_TIPO_INSUMO[it.categoria] ?? it.categoria) : '—'}</td>
                    <td>
                      <div className="fila" style={{ gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <form action={ajustarCantidad}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="item_id" value={it.id} /><input type="hidden" name="delta" value="-1" /><button className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Restar">−</button></form>
                        <strong style={{ minWidth: 44, textAlign: 'center' }}>{fmt(it.cantidad)}</strong>
                        <span className="muted" style={{ fontSize: '.8rem' }}>{it.unidad || ''}</span>
                        <form action={ajustarCantidad}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="item_id" value={it.id} /><input type="hidden" name="delta" value="1" /><button className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Sumar">+</button></form>
                        <form action={fijarCantidad} className="fila" style={{ gap: 4 }}>
                          <input type="hidden" name="punto_id" value={id} /><input type="hidden" name="item_id" value={it.id} />
                          <input name="cantidad" className="input" type="number" min={0} step="any" defaultValue={fmt(it.cantidad)} style={{ width: 72, minHeight: 32 }} aria-label="Fijar cantidad" />
                          <button className="btn" style={{ minHeight: 32, padding: '2px 8px' }}>Fijar</button>
                        </form>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <form action={eliminarProducto}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="item_id" value={it.id} />
                        <BotonConfirmar mensaje={'¿Eliminar ' + it.producto + ' del inventario?'} className="btn btn-peligro" style={{ minHeight: 32, padding: '2px 8px' }}><Icono nombre="basura" size={15} /></BotonConfirmar>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div></div>
          )}
        </div>

        <aside className="grupo-aside">
          {/* QR para el teléfono */}
          <div className="tarjeta" style={{ textAlign: 'center' }}>
            <h3 className="aside-titulo" style={{ marginTop: 0, justifyContent: 'center' }}><Icono nombre="enlace" size={16} /> Abrir en el teléfono</h3>
            <img src={qr} alt="Código QR del centro" style={{ width: 200, height: 200, maxWidth: '100%' }} />
            <p className="muted" style={{ fontSize: '.8rem', marginBottom: 0 }}>Escanea para gestionar este inventario desde el celular. Imprímelo y pégalo en el centro.</p>
          </div>

          {/* Necesidades urgentes */}
          <div className="tarjeta">
            <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="avisos" size={16} /> Necesidades / solicitudes</h3>
            {necesidades.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Sin necesidades marcadas.</p>
            ) : necesidades.map((n) => (
              <div key={n.id} className="fila" style={{ justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--borde)', padding: '8px 0' }}>
                <div>
                  <span className="fila" style={{ gap: 6 }}><Pill tono={tonoDeClase(claseUrgencia(n.urgencia))} punto={false}>{ETIQUETA_URGENCIA[n.urgencia as keyof typeof ETIQUETA_URGENCIA] ?? n.urgencia}</Pill> <strong>{n.producto}</strong></span>
                  {n.nota && <div className="muted" style={{ fontSize: '.82rem' }}>{n.nota}</div>}
                </div>
                <form action={resolverNecesidad}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="nec_id" value={n.id} />
                  <button className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Marcar resuelta"><Icono nombre="ok" size={15} /></button>
                </form>
              </div>
            ))}
            <form action={agregarNecesidad} style={{ marginTop: 10 }}>
              <input type="hidden" name="punto_id" value={id} />
              <div className="campo"><label>¿Qué se necesita?</label><input name="producto" className="input" required placeholder="Ej. Pañales talla G" /></div>
              <div className="grid grid-2">
                <div className="campo"><label>Urgencia</label>
                  <select name="urgencia" className="input" defaultValue="media">{URGENCIAS.map((u) => <option key={u} value={u}>{ETIQUETA_URGENCIA[u]}</option>)}</select>
                </div>
                <div className="campo"><label>Categoría</label>
                  <select name="categoria" className="input" defaultValue=""><option value="">—</option>{TIPOS_INSUMO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_INSUMO[t]}</option>)}</select>
                </div>
              </div>
              <div className="campo"><label>Nota (opcional)</label><input name="nota" className="input" placeholder="detalle o cantidad aproximada" /></div>
              <button className="btn btn-acento" type="submit" style={{ width: '100%' }}><Icono nombre="mas" size={16} /> Marcar necesidad</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
