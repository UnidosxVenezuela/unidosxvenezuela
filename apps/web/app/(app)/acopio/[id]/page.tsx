import QRCode from 'qrcode';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import { nombreMostrado } from '@/lib/nombre';
import { ETIQUETA_TIPO_INSUMO, TIPOS_INSUMO, ETIQUETA_URGENCIA, URGENCIAS, claseUrgencia } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import BotonConfirmar from '@/components/BotonConfirmar';
import EscanearProducto from '../EscanearProducto';
import {
  agregarProducto, registrarDonacion, registrarSalida, traspasarStock, importarInventario,
  solicitarTraspaso, aprobarSolicitud, resolverSolicitud,
  ajustarCantidad, fijarCantidad, fijarMinimo, eliminarProducto, agregarNecesidad, resolverNecesidad,
} from './actions';

const UNIDADES = ['unidades', 'cajas', 'paquetes', 'kg', 'litros', 'bolsas'];
const fmt = (n: any) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','); };

const MOV: Record<string, { etiqueta: string; signo: '+' | '−' | '='; clase: string }> = {
  entrada:          { etiqueta: 'Entrada',            signo: '+', clase: 'ok' },
  donacion:         { etiqueta: 'Donación',           signo: '+', clase: 'ok' },
  traspaso_entrada: { etiqueta: 'Traspaso recibido',  signo: '+', clase: 'ok' },
  salida:           { etiqueta: 'Salida',             signo: '−', clase: 'critica' },
  traspaso_salida:  { etiqueta: 'Traspaso enviado',   signo: '−', clase: 'critica' },
  ajuste:           { etiqueta: 'Ajuste',             signo: '=', clase: 'neutra' },
};

export default async function CentroAcopioPage({ params, searchParams }: { params: { id: string }; searchParams: { q?: string } }) {
  const { perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const supabase = await createClient();
  const id = params.id;

  // Quién puede entrar: gestores y voluntarios del centro. Los voluntarios SOLO suman.
  const [{ data: puedeSumar }, { data: puedeGestionar }] = await Promise.all([
    supabase.rpc('puede_sumar_acopio', { p_punto: id }),
    supabase.rpc('puede_gestionar_acopio', { p_punto: id }),
  ]);
  if (!puedeSumar) redirect('/acopio');
  const gestor = !!puedeGestionar;

  const [{ data: centro }, { data: inv }, { data: nec }, { data: mov }, { data: centros }, { data: sol }] = await Promise.all([
    supabase.from('puntos_acopio').select('id, nombre, direccion, telefono, horario, activo, camas_total, camas_ocupadas').eq('id', id).single(),
    supabase.from('inventario_acopio').select('*').eq('punto_id', id).order('producto'),
    supabase.from('necesidades_acopio').select('*').eq('punto_id', id).eq('resuelta', false).order('creado_en', { ascending: false }),
    supabase.from('movimientos_acopio').select('*, perfiles(nombre_completo)').eq('punto_id', id).order('creado_en', { ascending: false }).limit(30),
    supabase.from('puntos_acopio').select('id, nombre, activo').order('nombre'),
    supabase.from('solicitudes_traspaso')
      .select('*, origen:puntos_acopio!origen_id(nombre), destino:puntos_acopio!destino_id(nombre), solicitante:perfiles!solicitante_id(nombre_completo)')
      .or(`origen_id.eq.${id},destino_id.eq.${id}`).eq('estado', 'pendiente').order('creado_en', { ascending: false }),
  ]);
  if (!centro) return <div className="tarjeta"><h2>Centro no encontrado</h2><Link href="/acopio">Volver</Link></div>;

  const inventarioAll = (inv ?? []) as any[];
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const inventario = q
    ? inventarioAll.filter((i) => String(i.producto).toLowerCase().includes(q) || String(i.codigo ?? '').toLowerCase().includes(q))
    : inventarioAll;
  const necesidades = (nec ?? []) as any[];
  const movimientos = (mov ?? []) as any[];
  const otrosCentros = ((centros ?? []) as any[]).filter((c) => c.id !== id);
  const nombrePunto = new Map<string, string>(((centros ?? []) as any[]).map((c) => [c.id, c.nombre]));
  const solicitudes = (sol ?? []) as any[];
  const solRecibidas = solicitudes.filter((s) => s.origen_id === id); // otros me piden (yo decido)
  const solEnviadas = solicitudes.filter((s) => s.destino_id === id); // yo pedí a otros
  const totalItems = inventarioAll.reduce((s, i) => s + Number(i.cantidad || 0), 0);
  const esBajo = (i: any) => Number(i.minimo) > 0 && Number(i.cantidad) <= Number(i.minimo);
  const bajoStock = inventarioAll.filter(esBajo);

  // QR que abre ESTE inventario en el teléfono.
  const host = headers().get('host') || 'unidosxvenezuela.com';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const base = `${proto}://${host}`;
  const qr = await QRCode.toDataURL(`${base}/acopio/${id}`, { width: 220, margin: 1 });

  return (
    <div>
      <RealtimeRefrescar tabla="inventario_acopio" filtro={'punto_id=eq.' + id} />
      <RealtimeRefrescar tabla="necesidades_acopio" filtro={'punto_id=eq.' + id} />
      <RealtimeRefrescar tabla="movimientos_acopio" filtro={'punto_id=eq.' + id} />
      <RealtimeRefrescar tabla="solicitudes_traspaso" filtro={'origen_id=eq.' + id} />
      <RealtimeRefrescar tabla="solicitudes_traspaso" filtro={'destino_id=eq.' + id} />
      <Link href="/acopio" className="muted">← Centros de acopio</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="acopio" size={24} /> {centro.nombre}</h1>
          <p className="muted sub">
            {[centro.direccion, centro.horario, centro.telefono].filter(Boolean).join(' · ') || 'Inventario y necesidades del centro.'}
            {!gestor && <> · <strong>Voluntario</strong>: puedes registrar entradas y donaciones.</>}
          </p>
          {Number(centro.camas_total) > 0 && (() => {
            const total = Number(centro.camas_total); const ocup = Math.max(0, Math.min(Number(centro.camas_ocupadas), total)); const libres = total - ocup;
            return <p className="sub" style={{ margin: '2px 0 0' }}>🛏 Albergue: <strong>{ocup}/{total}</strong> camas · {libres} libres</p>;
          })()}
        </div>
        {gestor && (
          <div className="fila" style={{ gap: 8 }}>
            <a className="btn" href={'/acopio/' + id + '/imprimir'}><Icono nombre="documento" size={16} /> Imprimir</a>
            <a className="btn" href={'/acopio/' + id + '/etiquetas'}><Icono nombre="enlace" size={16} /> Etiquetas QR</a>
          </div>
        )}
      </div>

      <div className="grupo-grid">
        <div className="grupo-main">
          {/* Inventario */}
          <h2 className="fila" style={{ gap: 6, flexWrap: 'wrap' }}><Icono nombre="caja" size={20} /> Inventario <Pill tono="neutra" punto={false}>{inventarioAll.length} productos · {fmt(totalItems)} uds.</Pill>{bajoStock.length > 0 && <Pill tono="critica" punto={false}>{bajoStock.length} bajo stock</Pill>}</h2>

          <div className="tarjeta">
            <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="mas" size={16} /> Ingresar producto</h3>
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
                {gestor && <div className="campo"><label>Mínimo (alerta, opcional)</label><input name="minimo" className="input" type="number" min={0} step="any" defaultValue={0} /></div>}
              </div>
              <button className="btn btn-primario" type="submit"><Icono nombre="mas" size={16} /> Ingresar al inventario</button>
              <p className="muted" style={{ fontSize: '.8rem', marginBottom: 0 }}>Si el producto ya existe, se suma a su cantidad.</p>
            </form>
          </div>

          {gestor && (
            <div className="tarjeta" style={{ marginTop: 10 }}>
              <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="documento" size={16} /> Importar inventario (CSV)</h3>
              <form action={importarInventario}>
                <input type="hidden" name="punto_id" value={id} />
                <div className="grid grid-2">
                  <div className="campo"><label>Archivo CSV</label><input name="archivo" className="input" type="file" accept=".csv,text/csv" required /></div>
                  <div className="campo"><label>Modo</label>
                    <select name="modo" className="input" defaultValue="sumar">
                      <option value="sumar">Sumar a lo existente</option>
                      <option value="reemplazar">Reemplazar cantidades</option>
                    </select>
                  </div>
                </div>
                <button className="btn" type="submit"><Icono nombre="documento" size={16} /> Importar</button>
                <p className="muted" style={{ fontSize: '.8rem', marginBottom: 0 }}>Encabezados reconocidos: <strong>Producto</strong>, Cantidad, Unidad, Categoría, Código, Mínimo. Tip: usa «Descargar CSV» (en Imprimir) para ver el formato exacto.</p>
              </form>
            </div>
          )}

          {/* Donación / Salida / Traspaso */}
          <div className="grid grid-2" style={{ marginTop: 10 }}>
            <div className="tarjeta">
              <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="corazon" size={16} /> Registrar donación</h3>
              <form action={registrarDonacion}>
                <input type="hidden" name="punto_id" value={id} />
                <div className="campo"><label>Producto donado</label><input name="producto" className="input" required placeholder="Ej. Arroz 1kg" /></div>
                <div className="grid grid-2">
                  <div className="campo"><label>Cantidad</label><input name="cantidad" className="input" type="number" min={0} step="any" defaultValue={1} /></div>
                  <div className="campo"><label>Unidad</label>
                    <select name="unidad" className="input" defaultValue="unidades">{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                  </div>
                  <div className="campo"><label>Categoría</label>
                    <select name="categoria" className="input" defaultValue=""><option value="">—</option>{TIPOS_INSUMO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_INSUMO[t]}</option>)}</select>
                  </div>
                  <div className="campo"><label>Donante (opcional)</label><input name="donante" className="input" placeholder="quién donó" /></div>
                </div>
                <button className="btn btn-acento" type="submit" style={{ width: '100%' }}><Icono nombre="mas" size={16} /> Registrar donación</button>
              </form>
            </div>

            {gestor && inventarioAll.length > 0 && (
              <div className="tarjeta">
                <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="salida" size={16} /> Registrar salida / consumo</h3>
                <form action={registrarSalida}>
                  <input type="hidden" name="punto_id" value={id} />
                  <div className="campo"><label>Producto</label>
                    <select name="item_id" className="input" required defaultValue="">
                      <option value="" disabled>Elige…</option>
                      {inventarioAll.map((it) => <option key={it.id} value={it.id}>{it.producto} ({fmt(it.cantidad)} {it.unidad || ''})</option>)}
                    </select>
                  </div>
                  <div className="grid grid-2">
                    <div className="campo"><label>Cantidad que sale</label><input name="cantidad" className="input" type="number" min={0} step="any" defaultValue={1} /></div>
                    <div className="campo"><label>Motivo (opcional)</label><input name="motivo" className="input" placeholder="entrega, consumo…" /></div>
                  </div>
                  <button className="btn" type="submit" style={{ width: '100%' }}><Icono nombre="salida" size={16} /> Registrar salida</button>
                </form>
              </div>
            )}
          </div>

          {gestor && inventarioAll.length > 0 && otrosCentros.length > 0 && (
            <div className="tarjeta" style={{ marginTop: 10 }}>
              <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="enlace" size={16} /> Traspasar a otro centro</h3>
              <form action={traspasarStock}>
                <input type="hidden" name="punto_id" value={id} />
                <div className="grid grid-2">
                  <div className="campo"><label>Producto</label>
                    <select name="producto" className="input" required defaultValue="">
                      <option value="" disabled>Elige…</option>
                      {inventarioAll.map((it) => <option key={it.id} value={it.producto}>{it.producto} ({fmt(it.cantidad)} {it.unidad || ''})</option>)}
                    </select>
                  </div>
                  <div className="campo"><label>Centro de destino</label>
                    <select name="destino" className="input" required defaultValue="">
                      <option value="" disabled>Elige…</option>
                      {otrosCentros.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (inactivo)'}</option>)}
                    </select>
                  </div>
                  <div className="campo"><label>Cantidad</label><input name="cantidad" className="input" type="number" min={0} step="any" defaultValue={1} /></div>
                  <div className="campo"><label>Nota (opcional)</label><input name="nota" className="input" placeholder="motivo del traspaso" /></div>
                </div>
                <button className="btn btn-primario" type="submit" style={{ width: '100%' }}><Icono nombre="enlace" size={16} /> Traspasar</button>
                <p className="muted" style={{ fontSize: '.8rem', marginBottom: 0 }}>Descuenta aquí y suma en el destino, dejando registro en ambos.</p>
              </form>
            </div>
          )}

          {gestor && (solRecibidas.length > 0 || solEnviadas.length > 0 || otrosCentros.length > 0) && (
            <div style={{ marginTop: 14 }}>
              <h2 className="fila" style={{ gap: 6 }}><Icono nombre="enlace" size={20} /> Solicitudes de traspaso {solRecibidas.length > 0 && <Pill tono="aviso" punto={false}>{solRecibidas.length} por responder</Pill>}</h2>

              {solRecibidas.length > 0 && (
                <div className="tarjeta">
                  <h3 className="aside-titulo" style={{ marginTop: 0 }}>Solicitudes recibidas (deciden aquí)</h3>
                  {solRecibidas.map((s) => (
                    <div key={s.id} className="fila" style={{ justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--borde)', padding: '8px 0', flexWrap: 'wrap' }}>
                      <div>
                        <strong>{s.destino?.nombre ?? 'Un centro'}</strong> pide <strong>{fmt(s.cantidad)}</strong> de <strong>{s.producto}</strong>
                        {s.solicitante?.nombre_completo && <div className="muted" style={{ fontSize: '.8rem' }}>Solicita: {nombreMostrado(s.solicitante.nombre_completo, esAdmin)}</div>}
                        {s.nota && <div className="muted" style={{ fontSize: '.8rem' }}>{s.nota}</div>}
                      </div>
                      <div className="fila" style={{ gap: 6 }}>
                        <form action={aprobarSolicitud}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="solicitud_id" value={s.id} /><button className="btn btn-primario" style={{ minHeight: 32, padding: '2px 10px' }}><Icono nombre="ok" size={15} /> Aprobar</button></form>
                        <form action={resolverSolicitud}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="solicitud_id" value={s.id} /><input type="hidden" name="estado" value="rechazada" /><button className="btn" style={{ minHeight: 32, padding: '2px 10px' }}>Rechazar</button></form>
                      </div>
                    </div>
                  ))}
                  <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 0' }}>Al aprobar se descuenta de aquí y se suma en el centro solicitante (queda en la bitácora).</p>
                </div>
              )}

              {solEnviadas.length > 0 && (
                <div className="tarjeta" style={{ marginTop: 10 }}>
                  <h3 className="aside-titulo" style={{ marginTop: 0 }}>Mis solicitudes (esperando respuesta)</h3>
                  {solEnviadas.map((s) => (
                    <div key={s.id} className="fila" style={{ justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--borde)', padding: '8px 0', flexWrap: 'wrap' }}>
                      <div>Pediste <strong>{fmt(s.cantidad)}</strong> de <strong>{s.producto}</strong> a <strong>{s.origen?.nombre ?? 'un centro'}</strong> <Pill tono="neutra" punto={false}>pendiente</Pill></div>
                      <form action={resolverSolicitud}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="solicitud_id" value={s.id} /><input type="hidden" name="estado" value="cancelada" /><button className="btn" style={{ minHeight: 32, padding: '2px 10px' }}>Cancelar</button></form>
                    </div>
                  ))}
                </div>
              )}

              {otrosCentros.length > 0 && (
                <div className="tarjeta" style={{ marginTop: 10 }}>
                  <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="mas" size={16} /> Solicitar a otro centro</h3>
                  <form action={solicitarTraspaso}>
                    <input type="hidden" name="punto_id" value={id} />
                    <div className="grid grid-2">
                      <div className="campo"><label>Pedir a</label>
                        <select name="origen" className="input" required defaultValue="">
                          <option value="" disabled>Elige el centro…</option>
                          {otrosCentros.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (inactivo)'}</option>)}
                        </select>
                      </div>
                      <div className="campo"><label>Producto</label><input name="producto" className="input" required placeholder="Ej. Agua 5L" /></div>
                      <div className="campo"><label>Cantidad</label><input name="cantidad" className="input" type="number" min={0} step="any" defaultValue={1} /></div>
                      <div className="campo"><label>Nota (opcional)</label><input name="nota" className="input" placeholder="para qué / urgencia" /></div>
                    </div>
                    <button className="btn btn-acento" type="submit" style={{ width: '100%' }}><Icono nombre="enlace" size={16} /> Enviar solicitud</button>
                    <p className="muted" style={{ fontSize: '.8rem', marginBottom: 0 }}>El líder de ese centro recibe la solicitud y decide si la aprueba.</p>
                  </form>
                </div>
              )}
            </div>
          )}

          {inventarioAll.length > 0 && (
            <form method="get" className="fila" style={{ gap: 8, margin: '14px 0 10px' }}>
              <input name="q" className="input crece" placeholder="Buscar producto o código…" defaultValue={searchParams.q ?? ''} />
              <button className="btn" type="submit"><Icono nombre="buscar" size={16} /></button>
              {q && <a className="btn" href={'/acopio/' + id}>Limpiar</a>}
            </form>
          )}
          {inventario.length === 0 ? (
            <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>{q ? 'Sin resultados para «' + searchParams.q + '».' : 'Sin productos todavía. Agrega el primero arriba (o escanea su código).'}</p></div>
          ) : (
            <div className="tarjeta"><div className="tabla-scroll"><table>
              <thead><tr><th>Producto</th><th>Categoría</th><th>Cantidad</th>{gestor && <th aria-label="Acciones"></th>}</tr></thead>
              <tbody>
                {inventario.map((it) => (
                  <tr key={it.id}>
                    <td><strong>{it.producto}</strong> {esBajo(it) && <Pill tono="critica" punto={false}>Bajo</Pill>}{it.codigo && <div className="muted" style={{ fontSize: '.75rem' }}>{it.codigo}</div>}{Number(it.minimo) > 0 && <div className="muted" style={{ fontSize: '.72rem' }}>mín: {fmt(it.minimo)}</div>}</td>
                    <td>{it.categoria ? (ETIQUETA_TIPO_INSUMO[it.categoria] ?? it.categoria) : '—'}</td>
                    {gestor ? (
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
                          <form action={fijarMinimo} className="fila" style={{ gap: 4 }}>
                            <input type="hidden" name="punto_id" value={id} /><input type="hidden" name="item_id" value={it.id} />
                            <input name="minimo" className="input" type="number" min={0} step="any" defaultValue={fmt(it.minimo)} style={{ width: 60, minHeight: 32 }} aria-label="Mínimo" title="Mínimo para alerta de bajo stock" />
                            <button className="btn" style={{ minHeight: 32, padding: '2px 8px' }} title="Guardar mínimo">mín</button>
                          </form>
                          <form action={eliminarProducto}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="item_id" value={it.id} />
                            <BotonConfirmar mensaje={'¿Eliminar ' + it.producto + ' del inventario?'} className="btn btn-peligro" style={{ minHeight: 32, padding: '2px 8px' }}><Icono nombre="basura" size={15} /></BotonConfirmar>
                          </form>
                        </div>
                      </td>
                    ) : (
                      <td><strong>{fmt(it.cantidad)}</strong> <span className="muted" style={{ fontSize: '.8rem' }}>{it.unidad || ''}</span></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table></div></div>
          )}

          {/* Bitácora de movimientos */}
          {movimientos.length > 0 && (
            <>
              <h2 className="fila" style={{ gap: 6, marginTop: 18 }}><Icono nombre="historial" size={20} /> Movimientos recientes</h2>
              <div className="tarjeta"><div className="tabla-scroll"><table>
                <thead><tr><th>Cuándo</th><th>Movimiento</th><th>Producto</th><th>Cantidad</th><th>Quién</th></tr></thead>
                <tbody>
                  {movimientos.map((m) => {
                    const meta = MOV[m.tipo] ?? { etiqueta: m.tipo, signo: '=', clase: 'neutra' };
                    const otro = m.relacionado_punto_id ? nombrePunto.get(m.relacionado_punto_id) : null;
                    return (
                      <tr key={m.id}>
                        <td className="muted" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{fechaHora(m.creado_en)}</td>
                        <td><Pill tono={tonoDeClase(meta.clase)} punto={false}>{meta.etiqueta}</Pill>{otro && <div className="muted" style={{ fontSize: '.78rem' }}>{m.tipo === 'traspaso_salida' ? '→ ' : '← '}{otro}</div>}{m.donante && <div className="muted" style={{ fontSize: '.78rem' }}>de {m.donante}</div>}{m.nota && <div className="muted" style={{ fontSize: '.78rem' }}>{m.nota}</div>}</td>
                        <td>{m.producto}</td>
                        <td><strong>{meta.signo} {fmt(m.cantidad)}</strong> <span className="muted" style={{ fontSize: '.8rem' }}>{m.unidad || ''}</span></td>
                        <td className="muted" style={{ fontSize: '.82rem' }}>{nombreMostrado(m.perfiles?.nombre_completo, esAdmin) || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div></div>
            </>
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
                {gestor && (
                  <form action={resolverNecesidad}><input type="hidden" name="punto_id" value={id} /><input type="hidden" name="nec_id" value={n.id} />
                    <button className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Marcar resuelta"><Icono nombre="ok" size={15} /></button>
                  </form>
                )}
              </div>
            ))}
            {gestor && (
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
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
