import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Icono from '@/components/Icono';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import BotonConfirmar from '@/components/BotonConfirmar';
import EstadoVacio from '@/components/EstadoVacio';
import Kpi from '@/components/Kpi';
import Pill from '@/components/Pill';
import TarjetaCapacidad, { conUnidad, type Capacidad } from '@/components/CapacidadProveedor';
import { crearProveedor, eliminarProveedor } from '../actions';

export default async function ProveedoresPage() {
  const { perfil } = await requireUsuario();
  if (!puedeLogistica(perfil)) redirect('/dashboard');
  const gestor = puedeLogistica(perfil);
  const puedeDeclarar = puedeAlianzas(perfil);
  const supabase = await createClient();

  // La capacidad viene ya calculada de la base (0224): ventana en curso, consumo y
  // RESTANTE. Best-effort — sin la migración aplicada, la página degrada al directorio
  // de siempre (mismo patrón que /insumos/[id]).
  const [provRes, capRes, rankRes] = await Promise.all([
    supabase.from('proveedores').select('id, nombre, tipo, contacto, notas, activo, oportunidad_id').order('nombre'),
    supabase.rpc('capacidades_de_proveedor', { p_proveedor: null, p_solo_vigentes: false }),
    // Cuánto ha aportado de verdad cada uno (0225): lo que convierte el directorio en
    // un criterio para decidir a quién pedir. Excluye lo cubierto por terceros.
    supabase.rpc('ranking_proveedores', { p_limite: 100 }),
  ]);
  const proveedores = (provRes.data ?? []) as any[];
  const caps = (capRes.error ? [] : (capRes.data ?? [])) as Capacidad[];
  const aportadoPor = new Map<string, { total: number; n_aportes: number; ultima: string | null }>();
  for (const r of (rankRes.error ? [] : (rankRes.data ?? [])) as any[]) {
    aportadoPor.set(String(r.proveedor_id), {
      total: Number(r.total ?? 0), n_aportes: Number(r.n_aportes ?? 0), ultima: r.ultima ?? null,
    });
  }

  const porProveedor = new Map<string, Capacidad[]>();
  for (const c of caps) {
    if (c.activa === false) continue;              // las retiradas no se cuentan
    const k = String(c.proveedor_id ?? '');
    if (!porProveedor.has(k)) porProveedor.set(k, []);
    porProveedor.get(k)!.push(c);
  }

  const vigentes = caps.filter((c) => c.vigente);
  const conMargen = vigentes.filter((c) => Number(c.restante ?? 0) > 0);
  const caducanPronto = vigentes.filter((c) => typeof c.caduca_en === 'number' && c.caduca_en! <= 15);
  const puntuales = vigentes.filter((c) => c.periodicidad === 'unica');

  return (
    <div>
      {/* Si Alianzas declara o corrige un compromiso, la capacidad de respuesta cambia y
          tiene que verse sin recargar (0224 añadió la tabla a la publicación de Realtime). */}
      <RealtimeRefrescar tabla="proveedor_capacidades" />
      <Link href="/insumos" className="muted">← Logística</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div><h1>Proveedores</h1><p className="muted sub">Directorio de proveedores y transportistas, y la <strong>capacidad de respuesta</strong> con la que se cuenta hoy.</p></div>
      </div>

      {/* CON QUÉ SE CUENTA HOY — lo primero que ve Logística. Los números son de la
          VENTANA VIGENTE de cada compromiso: en una capacidad semanal, esta semana. */}
      {caps.length > 0 && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '4px 0 16px' }}>
            <Kpi etiqueta="Compromisos con margen" valor={conMargen.length} sub={'de ' + vigentes.length + ' vigentes'} color="#0e7a6d" icono="ok" tinte="#d9f3ef" />
            <Kpi etiqueta="Aliados que responden" valor={new Set(conMargen.map((c) => c.proveedor_id)).size} sub="Con capacidad disponible ahora" color="var(--azul)" icono="usuario" tinte="#eef2ff" />
            <Kpi etiqueta="De una sola vez" valor={puntuales.length} sub="No se renuevan al gastarse" color="#7c3aed" icono="reloj" tinte="#ede9fe" />
            <Kpi etiqueta="Caducan pronto" valor={caducanPronto.length} sub="En 15 días o menos" color="#ea580c" icono="avisos" tinte="#ffedd5" />
          </div>

          {caducanPronto.length > 0 && (
            <div className="tarjeta" style={{ borderColor: 'var(--alta)' }}>
              <strong className="fila" style={{ gap: 6 }}><Icono nombre="avisos" size={16} /> Acuerdos que están por vencerse</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '.85rem', display: 'grid', gap: 2 }}>
                {caducanPronto.map((c) => (
                  <li key={c.id}>
                    <strong>{c.proveedor}</strong> · {c.descripcion} ({conUnidad(c.cantidad, c.unidad)}) —{' '}
                    {c.caduca_en === 0 ? 'caduca hoy' : c.caduca_en === 1 ? 'caduca mañana' : 'caduca en ' + c.caduca_en + ' días'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {gestor && (
        <form action={crearProveedor} className="tarjeta" style={{ maxWidth: 640 }}>
          <div className="grid grid-2">
            <div className="campo"><label>Nombre</label><input name="nombre" className="input" required /></div>
            <div className="campo"><label>Tipo</label><input name="tipo" className="input" placeholder="Farmacia, mayorista, transportista…" /></div>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Contacto (tel / WhatsApp)</label><input name="contacto" className="input" /></div>
            <div className="campo"><label>Notas</label><input name="notas" className="input" /></div>
          </div>
          <button className="btn btn-primario" type="submit"><Icono nombre="mas" size={16} /> Agregar proveedor</button>
        </form>
      )}

      {proveedores.length === 0 ? (
        <EstadoVacio icono="usuario" titulo="Sin proveedores" texto="Agrega proveedores y transportistas para asignarlos a las solicitudes." />
      ) : (
        <div className="grid grid-2">
          {proveedores.map((p) => {
            const suyas = porProveedor.get(p.id) ?? [];
            const disponibles = suyas.filter((c) => c.vigente && Number(c.restante ?? 0) > 0);
            const hist = aportadoPor.get(String(p.id));
            return (
              <div key={p.id} className="tarjeta" style={{ opacity: p.activo === false ? .65 : 1 }}>
                <div className="fila" style={{ justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                  <strong>{p.nombre}</strong>
                  <span className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {p.tipo && <span className="insignia">{p.tipo}</span>}
                    {p.oportunidad_id && <Pill tono="info" punto={false}>Aliado de Alianzas</Pill>}
                    {p.activo === false && <Pill tono="neutra" punto={false}>Dado de baja</Pill>}
                  </span>
                </div>
                {p.contacto && <div className="muted fila" style={{ gap: 4, marginTop: 4 }}><Icono nombre="whatsapp" size={14} /> {p.contacto}</div>}
                {p.notas && <p className="muted" style={{ margin: '6px 0 0', fontSize: '.85rem' }}>{p.notas}</p>}

                {/* CUÁNTO HA APORTADO DE VERDAD (0225): el otro lado del criterio. La
                    capacidad dice con qué se puede contar; esto, con quién se ha podido. */}
                {hist && (
                  <div className="fila" style={{ gap: 6, marginTop: 8, fontSize: '.82rem', flexWrap: 'wrap' }}>
                    <Icono nombre="ok" size={14} />
                    <span>
                      Ha aportado <strong>{hist.total % 1 === 0 ? hist.total.toLocaleString('es-VE') : hist.total.toFixed(1)}</strong>
                      {' '}en {hist.n_aportes} entrega(s)
                    </span>
                    <Link href={'/alianzas/proveedores/' + p.id} className="muted" style={{ textDecoration: 'underline' }}>ver historial</Link>
                  </div>
                )}

                {/* LA CAPACIDAD RESTANTE: el dato por el que Logística entra aquí. */}
                {suyas.length > 0 ? (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <div className="muted" style={{ fontSize: '.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      Capacidad comprometida
                      {disponibles.length > 0 && <> · <span style={{ color: 'var(--ok)' }}>{disponibles.length} con margen hoy</span></>}
                    </div>
                    {suyas.map((c) => <TarjetaCapacidad key={c.id} cap={c} />)}
                  </div>
                ) : (
                  <p className="muted" style={{ margin: '10px 0 0', fontSize: '.8rem' }}>
                    Sin capacidad declarada.{' '}
                    {puedeDeclarar
                      ? <Link href={'/alianzas/proveedores/' + p.id}>Declararla en Alianzas →</Link>
                      : 'Alianzas Estratégicas la declara al cerrar el acuerdo.'}
                  </p>
                )}

                <div className="fila" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {puedeDeclarar && (
                    <Link href={'/alianzas/proveedores/' + p.id} className="btn" style={{ minHeight: 32, padding: '2px 10px', fontSize: '.8rem' }}>
                      <Icono nombre="pizarra" size={14} /> Editar capacidad
                    </Link>
                  )}
                  {gestor && (
                    <form action={eliminarProveedor}>
                      <input type="hidden" name="id" value={p.id} />
                      <BotonConfirmar mensaje={'¿Eliminar a ' + p.nombre + '? Se borrarán también las capacidades que tuviera declaradas.'} className="btn btn-peligro" style={{ minHeight: 32, padding: '2px 10px' }}><Icono nombre="basura" size={14} /> Quitar</BotonConfirmar>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {caps.length === 0 && proveedores.length > 0 && (
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 12 }}>
          Todavía no hay capacidad declarada. Cuando Alianzas Estratégicas cierre un acuerdo y anote qué puede cubrir cada aliado y cada cuánto, aquí aparecerá <strong>cuánto le queda</strong> en cada momento, descontando lo que ya se le pidió.
        </p>
      )}
    </div>
  );
}
