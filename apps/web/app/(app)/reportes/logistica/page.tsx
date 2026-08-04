import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_INSUMO } from '@/lib/constantes';
import { consultarLogistica, horasLegible, num, pct } from '@/lib/export/logistica';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonImprimir from '@/components/BotonImprimir';

export const metadata = { title: 'Reportería · Logística' };
export const dynamic = 'force-dynamic';

/** Reportería de Logística (0227): cuánto se pide, cuánto se cubre de verdad, en qué
 *  plazo se entrega y quién sostiene la respuesta. Para Logística y —en consulta,
 *  0226— para Alianzas, que es quien le consigue los recursos. Imprimible + CSV. */
export default async function ReporteLogisticaPage() {
  const { perfil } = await requireUsuario();
  // Gates con los HELPERS: `puedeLogistica` incluye al mando del grupo (0214).
  const esLog = puedeLogistica(perfil);
  const esAli = puedeAlianzas(perfil);
  if (!esLog && !esAli) redirect('/dashboard');

  const supabase = await createClient();
  const d = await consultarLogistica(supabase);

  if (!d) {
    return (
      <AnimarEntrada>
        <div className="pagina-cab"><h1 className="fila" style={{ gap: 8 }}><Icono nombre="caja" size={24} /> Reportería de Logística</h1></div>
        <EstadoVacio icono="caja" titulo="Aún no disponible"
          texto="La reportería de Logística estará lista cuando se aplique la migración 0227 en la base de datos." />
      </AnimarEntrada>
    );
  }

  const k = d.kpis ?? {};
  const cob = d.cobertura_items ?? {};
  const plazos = d.plazos ?? {};
  const esc = d.escalados ?? {};
  const cap = d.capacidad ?? {};
  const porTipo = d.por_tipo ?? [];
  const porEstado = Object.entries(d.por_estado ?? {});
  const top = d.top_proveedores ?? [];
  const maxTipo = porTipo.reduce((m, t) => Math.max(m, Number(t.n)), 0);
  const maxProv = top.reduce((m, p) => Math.max(m, Number(p.total)), 0);

  // Los dos tramos de la barra de cobertura: lo nuestro y lo de terceros.
  const pedida = Number(cob.cantidad_pedida ?? 0);
  const cubierta = Number(cob.cantidad_cubierta ?? 0);
  const terceros = Number(cob.cantidad_terceros ?? 0);
  const propio = Math.max(cubierta - terceros, 0);
  const anchoPropio = pedida > 0 ? Math.min(100, (propio / pedida) * 100) : 0;
  const anchoTercero = pedida > 0 ? Math.min(100 - anchoPropio, (terceros / pedida) * 100) : 0;

  const TILES: { valor: number; etiqueta: string; icono: string; alerta?: boolean }[] = [
    { valor: Number(k.total_solicitudes ?? 0), etiqueta: 'Solicitudes totales', icono: 'caja' },
    { valor: Number(k.activas ?? 0), etiqueta: 'Activas', icono: 'reloj' },
    { valor: Number(k.entregadas ?? 0), etiqueta: 'Entregadas', icono: 'ok' },
    { valor: Number(k.no_disponibles ?? 0), etiqueta: 'Sin disponibilidad', icono: 'aviso', alerta: true },
  ];

  return (
    <AnimarEntrada>
      <div className="pagina-cab no-print">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="caja" size={24} /> Reportería de Logística</h1>
          <p className="muted sub">Cuánto se pide, cuánto se cubre de verdad y en qué plazo se entrega.</p>
        </div>
        <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link href="/insumos" className="btn btn-sm"><Icono nombre="caja" size={15} /> Panel de Logística</Link>
          <a className="btn btn-sm" href="/reportes/logistica/export"><Icono nombre="documento" size={15} /> Descargar CSV</a>
          <BotonImprimir label="Imprimir / PDF" />
        </div>
      </div>

      {!esLog && esAli && (
        <div className="aviso no-print" style={{ marginBottom: 12 }}>
          <Icono nombre="ojo" size={15} /> Estás viendo la reportería de Logística <strong>en modo consulta</strong>.
          Es el rendimiento del área a la que Alianzas le consigue los recursos.
        </div>
      )}

      <p className="muted sub" style={{ marginTop: 0 }}>Generado {fechaHora(new Date())}</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 8 }}>
        {TILES.map((t) => (
          <div key={t.etiqueta} className="tarjeta" style={{ padding: 14 }}>
            <div className="muted fila" style={{ gap: 6, fontSize: '.82rem' }}><Icono nombre={t.icono} size={15} /> {t.etiqueta}</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 4, color: t.alerta && t.valor > 0 ? '#ea580c' : 'var(--texto)' }}>
              {t.valor.toLocaleString('es')}
            </div>
          </div>
        ))}
      </div>

      {/* Cobertura real — lo nuestro separado de lo de terceros */}
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Cobertura del desglose</h2>
        {pedida === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no hay solicitudes con desglose por ítem derivado a Logística.</p>
        ) : (
          <>
            <div className="fila" style={{ justifyContent: 'space-between', fontSize: '.9rem', marginBottom: 4 }}>
              <strong>{num(cubierta)} de {num(pedida)} cubierto</strong>
              <span className="muted">{pct(cob.pct_cubierto)} en total</span>
            </div>
            <div style={{ height: 12, borderRadius: 6, background: 'var(--sup2)', overflow: 'hidden', display: 'flex' }}>
              <div title="Cubierto con capacidad propia" style={{ width: anchoPropio + '%', background: 'var(--acento, #2563eb)' }} />
              <div title="Cubierto por terceros" style={{ width: anchoTercero + '%', background: '#0d9488' }} />
            </div>
            <div className="fila" style={{ gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: '.85rem' }}>
              <span className="fila" style={{ gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--acento, #2563eb)', display: 'inline-block' }} />
                Capacidad propia: <strong>{num(propio)}</strong> ({pct(cob.pct_propio)})
              </span>
              <span className="fila" style={{ gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#0d9488', display: 'inline-block' }} />
                Cubierto por terceros: <strong>{num(terceros)}</strong>
              </span>
            </div>
            <p className="muted" style={{ fontSize: '.8rem', marginTop: 10, marginBottom: 0 }}>
              Lo que cubrió otra ONG o un particular se cuenta aparte: no es capacidad de respuesta de la organización.
              Del desglose, <strong>{Number(cob.items_cumplidos ?? 0)}</strong> de <strong>{Number(cob.items_totales ?? 0)}</strong> ítems
              están cumplidos y <strong>{Number(cob.items_por_tercero ?? 0)}</strong> los cubrió un tercero.
            </p>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
        {/* Plazos */}
        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Plazos de entrega</h2>
          {Number(plazos.medidas ?? 0) === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Aún no hay entregas selladas con las que medir el plazo.</p>
          ) : (
            <table className="tabla"><tbody>
              <tr><td>Entregas medidas</td><td style={{ textAlign: 'right' }}><strong>{Number(plazos.medidas)}</strong></td></tr>
              <tr><td>Promedio (alta → entrega)</td><td style={{ textAlign: 'right' }}><strong>{horasLegible(plazos.prom_horas)}</strong></td></tr>
              <tr><td>Mediana</td><td style={{ textAlign: 'right' }}><strong>{horasLegible(plazos.mediana_horas)}</strong></td></tr>
              <tr><td>Máximo</td><td style={{ textAlign: 'right' }}>{horasLegible(plazos.max_horas)}</td></tr>
            </tbody></table>
          )}
        </div>

        {/* Por estado */}
        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Por estado</h2>
          {porEstado.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Sin solicitudes registradas.</p>
          ) : (
            <table className="tabla"><tbody>
              {porEstado.map(([estado, n]) => (
                <tr key={estado}>
                  <td>{ETIQUETA_ESTADO_INSUMO[estado] ?? estado}</td>
                  <td style={{ textAlign: 'right' }}><strong>{Number(n).toLocaleString('es')}</strong></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      {/* Por tipo de insumo */}
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Por tipo de insumo</h2>
        {porTipo.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Sin solicitudes registradas.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {porTipo.map((t) => {
              const ancho = maxTipo ? Math.round((Number(t.n) / maxTipo) * 100) : 0;
              return (
                <div key={t.tipo}>
                  <div className="fila" style={{ justifyContent: 'space-between', fontSize: '.9rem', marginBottom: 3 }}>
                    <strong>{ETIQUETA_TIPO_INSUMO[t.tipo] ?? t.tipo}</strong>
                    <span className="muted">{t.n} solicitud(es) · {t.entregadas} entregada(s)</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--sup2)' }}>
                    <div style={{ height: '100%', width: ancho + '%', borderRadius: 4, background: 'var(--acento, #2563eb)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quién sostiene la respuesta */}
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Quién sostiene la respuesta</h2>
        {top.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no hay aportes registrados de proveedores.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {top.map((p) => {
              const ancho = maxProv ? Math.round((Number(p.total) / maxProv) * 100) : 0;
              return (
                <div key={p.nombre}>
                  <div className="fila" style={{ justifyContent: 'space-between', fontSize: '.9rem', marginBottom: 3 }}>
                    <strong>{p.nombre}</strong>
                    <span className="muted">{num(p.total)} en {p.n_aportes} aporte(s)</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--sup2)' }}>
                    <div style={{ height: '100%', width: ancho + '%', borderRadius: 4, background: 'var(--acento, #2563eb)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 10, marginBottom: 0 }}>
          Solo aportes de la organización y sus aliados: lo cubierto por terceros no se atribuye a ningún proveedor.
        </p>
      </div>

      {/* Escalado y capacidad viva */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Escalado a Alianzas</h2>
          <table className="tabla"><tbody>
            <tr><td>Solicitudes escaladas</td><td style={{ textAlign: 'right' }}><strong>{Number(esc.a_alianzas ?? 0)}</strong></td></tr>
            <tr><td>Voluntariado profesional</td><td style={{ textAlign: 'right' }}><strong>{Number(esc.voluntariado ?? 0)}</strong></td></tr>
          </tbody></table>
        </div>
        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Capacidad comprometida</h2>
          <table className="tabla"><tbody>
            <tr><td>Compromisos vigentes</td><td style={{ textAlign: 'right' }}><strong>{Number(cap.compromisos ?? 0)}</strong></td></tr>
            <tr><td>Aliados con capacidad</td><td style={{ textAlign: 'right' }}><strong>{Number(cap.proveedores ?? 0)}</strong></td></tr>
            <tr><td>Capacidad restante</td><td style={{ textAlign: 'right' }}><strong>{num(cap.restante)}</strong></td></tr>
          </tbody></table>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: 8, marginBottom: 0 }}>
            Lo que los aliados aún pueden dar en su ventana vigente. <Link href="/insumos/proveedores">Ver el detalle</Link>.
          </p>
        </div>
      </div>
    </AnimarEntrada>
  );
}
