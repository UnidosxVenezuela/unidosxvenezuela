import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_INSUMO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonEnviar from '@/components/BotonEnviar';
import EstadoVacio from '@/components/EstadoVacio';
import Kpi from '@/components/Kpi';
import Pill from '@/components/Pill';
import Consejo from '@/components/Consejos';
import { InsigniasCapacidad, conUnidad, type Capacidad } from '@/components/CapacidadProveedor';
import { guardarProveedorAliado, concretarAliadoDesdeCrm } from './actions';

export const metadata = { title: 'Aliados y su capacidad' };
export const dynamic = 'force-dynamic';

/**
 * ALIADOS Y SU CAPACIDAD (0224) — la pantalla donde Alianzas declara CON QUÉ se puede
 * contar. Es la mitad que faltaba del acuerdo: hasta ahora, del aliado que el
 * departamento conseguía solo quedaba el teléfono, y Logística pedía a ciegas.
 *
 * Aquí se registra el aliado (a mano o CONCRETÁNDOLO desde el CRM, que conserva el
 * vínculo) y desde su ficha se declara qué puede cubrir, cuánto y cada cuánto. Lo que se
 * escriba aquí es exactamente lo que Logística ve en `/insumos/proveedores` como
 * capacidad restante.
 */
export default async function AliadosCapacidadPage() {
  const { perfil } = await requireUsuario();
  // Las dos áreas entran: Alianzas declara el acuerdo, Logística corrige lo que constata
  // en la operación. Es el mismo gate que la RPC (`puede_logistica() or puede_alianzas()`).
  const esAlianzas = puedeAlianzas(perfil);
  const esLogistica = puedeLogistica(perfil);
  if (!esAlianzas && !esLogistica) redirect('/dashboard');
  const supabase = await createClient();

  // Una sola llamada trae la capacidad de TODOS con su ventana y su restante ya
  // calculados (0224). Best-effort: sin la migración, la página degrada al directorio.
  const [capRes, provRes, oportRes] = await Promise.all([
    supabase.rpc('capacidades_de_proveedor', { p_proveedor: null, p_solo_vigentes: false }),
    supabase.from('proveedores').select('id, nombre, tipo, contacto, notas, activo, oportunidad_id').order('nombre'),
    supabase.from('oportunidades').select('id, titulo, categoria, estado').order('titulo'),
  ]);
  const caps = (capRes.error ? [] : (capRes.data ?? [])) as Capacidad[];
  const proveedores = (provRes.data ?? []) as any[];
  const oportunidades = (oportRes.error ? [] : (oportRes.data ?? [])) as any[];
  const sinMigracion = !!capRes.error;

  // Las entidades del CRM que todavía no se concretaron en un proveedor.
  const yaEnlazadas = new Set(proveedores.map((p) => p.oportunidad_id).filter(Boolean));
  const disponibles = oportunidades.filter((o) => !yaEnlazadas.has(o.id));

  const porProveedor = new Map<string, Capacidad[]>();
  for (const c of caps) {
    const k = String(c.proveedor_id ?? '');
    if (!porProveedor.has(k)) porProveedor.set(k, []);
    porProveedor.get(k)!.push(c);
  }

  const vigentes = caps.filter((c) => c.vigente);
  const recurrentes = vigentes.filter((c) => c.periodicidad !== 'unica').length;
  const puntuales = vigentes.filter((c) => c.periodicidad === 'unica').length;
  const caducanPronto = vigentes.filter((c) => typeof c.caduca_en === 'number' && c.caduca_en! <= 15).length;
  const activos = proveedores.filter((p) => p.activo !== false).length;

  return (
    <AnimarEntrada>
      <Consejo id="alianzas-capacidad" titulo="Con qué se puede contar">
        De cada aliado que el departamento concreta hay que dejar claro <strong>qué puede cubrir</strong>, <strong>cuánto</strong> y <strong>cada cuánto</strong>. Un aliado que ofrece <em>50 comidas semanales</em> no es lo mismo que uno que dona <em>500 colchones una sola vez</em>: lo primero se renueva cada semana, lo segundo se agota. Al declararlo aquí, Logística ve en todo momento la <strong>capacidad que le queda</strong> a cada uno y deja de pedir a ciegas.
      </Consejo>

      <Link href="/alianzas" className="muted">← Alianzas Estratégicas</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="caja" size={24} /> Aliados y su capacidad</h1>
          <p className="muted sub">Lo que cada aliado se comprometió a cubrir, con su periodicidad y su vigencia. Es lo que Logística ve como capacidad de respuesta disponible.</p>
        </div>
      </div>

      {sinMigracion && (
        <div className="tarjeta" style={{ borderColor: 'var(--critica)' }}>
          <strong>Falta aplicar la migración 0224</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '.86rem' }}>
            Las capacidades no se pueden leer todavía en esta base de datos. El directorio de aliados sí funciona.
          </p>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Aliados activos" valor={activos} sub={proveedores.length + ' en total'} color="var(--azul)" icono="usuario" tinte="#eef2ff" />
        <Kpi etiqueta="Compromisos recurrentes" valor={recurrentes} sub="Se renuevan solos" color="#0e7a6d" icono="refrescar" tinte="#d9f3ef" />
        <Kpi etiqueta="De una sola vez" valor={puntuales} sub="No se renuevan" color="#7c3aed" icono="reloj" tinte="#ede9fe" />
        <Kpi etiqueta="Caducan pronto" valor={caducanPronto} sub="En 15 días o menos" color="#ea580c" icono="avisos" tinte="#ffedd5" />
      </div>

      {/* Concretar un aliado del CRM: conserva el vínculo (proveedores.oportunidad_id). */}
      {disponibles.length > 0 && (
        <form action={concretarAliadoDesdeCrm} className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Concretar un aliado del CRM</h2>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>
            La empresa u organización que ya se trabajó en «Empresas y aliados» pasa a ser un aliado con el que Logística puede contar, sin volver a escribir sus datos y conservando su historia.
          </p>
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="campo" style={{ flex: 1, minWidth: 240 }}>
              <label>Entidad del CRM</label>
              <select name="oportunidad_id" className="input" required defaultValue="">
                <option value="" disabled>Elige una…</option>
                {disponibles.map((o) => (
                  <option key={o.id} value={o.id}>{o.titulo}{o.categoria ? ' · ' + o.categoria : ''}</option>
                ))}
              </select>
            </div>
            <BotonEnviar cargando="Concretando…"><Icono nombre="enlace" size={16} /> Concretar</BotonEnviar>
          </div>
        </form>
      )}

      {/* Alta manual: no todo aliado nace en el CRM. */}
      <details className="tarjeta">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Registrar un aliado que no está en el CRM</summary>
        <form action={guardarProveedorAliado} style={{ marginTop: 10 }}>
          <div className="grid grid-2">
            <div className="campo"><label>Nombre</label><input name="nombre" className="input" required maxLength={160} /></div>
            <div className="campo"><label>Tipo</label><input name="tipo" className="input" maxLength={60} placeholder="Empresa, fundación, mayorista, transportista…" /></div>
            <div className="campo"><label>Contacto (tel / WhatsApp)</label><input name="contacto" className="input" maxLength={160} /></div>
            <div className="campo"><label>Notas</label><input name="notas" className="input" maxLength={500} /></div>
          </div>
          <BotonEnviar><Icono nombre="mas" size={16} /> Registrar aliado</BotonEnviar>
        </form>
      </details>

      {proveedores.length === 0 ? (
        <EstadoVacio icono="usuario" titulo="Todavía no hay aliados"
          texto="Concreta una entidad del CRM o registra un aliado a mano; después declara con qué puede colaborar." />
      ) : (
        <div className="fila" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch', marginTop: 12 }}>
          {proveedores.map((p) => {
            const suyas = porProveedor.get(p.id) ?? [];
            const activas = suyas.filter((c) => c.activa !== false);
            const conMargen = suyas.filter((c) => c.vigente && Number(c.restante ?? 0) > 0).length;
            return (
              <Link key={p.id} href={'/alianzas/proveedores/' + p.id} className="tarjeta"
                style={{ textDecoration: 'none', color: 'inherit', padding: 12, opacity: p.activo === false ? .65 : 1 }}>
                <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <strong>{p.nombre}</strong>
                    {p.tipo && <span className="insignia">{p.tipo}</span>}
                    {p.oportunidad_id && <Pill tono="info" punto={false}>Del CRM</Pill>}
                    {p.activo === false && <Pill tono="neutra" punto={false}>Dado de baja</Pill>}
                  </span>
                  <span className="muted" style={{ fontSize: '.82rem' }}>
                    {activas.length === 0
                      ? 'Sin capacidad declarada'
                      : conMargen + ' de ' + activas.length + ' con margen hoy'}
                  </span>
                </div>
                {p.contacto && (
                  <div className="muted fila" style={{ gap: 4, marginTop: 4, fontSize: '.82rem' }}>
                    <Icono nombre="whatsapp" size={13} /> {p.contacto}
                  </div>
                )}
                {activas.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4 }}>
                    {activas.slice(0, 4).map((c) => (
                      <li key={c.id} className="fila" style={{ gap: 8, flexWrap: 'wrap', fontSize: '.82rem', alignItems: 'center' }}>
                        <span className="insignia" style={{ fontSize: '.7rem' }}>{ETIQUETA_TIPO_INSUMO[c.tipo ?? 'otro'] ?? c.tipo}</span>
                        <span>{c.descripcion}</span>
                        <strong>{conUnidad(c.cantidad, c.unidad)}</strong>
                        <InsigniasCapacidad cap={c} />
                      </li>
                    ))}
                    {activas.length > 4 && <li className="muted" style={{ fontSize: '.78rem' }}>y {activas.length - 4} más…</li>}
                  </ul>
                )}
                {activas.length === 0 && !sinMigracion && (
                  <p className="muted" style={{ margin: '6px 0 0', fontSize: '.82rem' }}>
                    Falta lo importante: declarar qué puede cubrir y cada cuánto, para que Logística sepa con qué cuenta.
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* El vocabulario, a la vista: si Alianzas y Logística no leen igual estas palabras,
          el dato deja de significar lo mismo en las dos pantallas. */}
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '.95rem' }}>Cómo se lee cada compromiso</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: '.85rem', display: 'grid', gap: 4 }}>
          <li><strong>Una sola vez:</strong> la cantidad es un total que se agota. Si dona 500 colchones y ya se pidieron 200, quedan 300 para siempre.</li>
          <li><strong>Recurrente</strong> (semanal, quincenal, mensual, trimestral): la cantidad <em>vuelve a llenarse</em> cada periodo, contando desde la fecha de inicio del acuerdo.</li>
          <li><strong>Por tiempo limitado:</strong> cualquiera de las anteriores con <em>fecha de fin</em>. Al pasar esa fecha deja de contarse, y la pantalla lo dice con todas sus letras.</li>
          <li>Lo que Logística pide se descuenta de la ventana en curso. Si se corrige o se anula una entrega, la capacidad vuelve en el acto: sale de lo aportado de verdad, no de una estimación.</li>
        </ul>
      </div>
    </AnimarEntrada>
  );
}
