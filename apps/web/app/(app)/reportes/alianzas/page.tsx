import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ESTADOS_OPORTUNIDAD, ETIQUETA_ESTADO_OPORTUNIDAD, tonoEstadoOportunidad } from '@/lib/constantes';
import { consultarResumenAlianzas, consultarEmpresasAlianzas, diasAVerificado, ETIQUETA_ORIGEN_OPORTUNIDAD } from '@/lib/export/alianzas';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import Pill from '@/components/Pill';
import BotonImprimir from '@/components/BotonImprimir';

export const metadata = { title: 'Reportería · Alianzas Estratégicas' };
export const dynamic = 'force-dynamic';

/** Reportería de Alianzas Estratégicas (0200): el respaldo formal del registro «Captado»
 *  para presentar a las empresas —cuántas empresas, por estado/rubro/score, el tiempo a
 *  verificado, y la tabla de empresas con su volumen/insumos— imprimible (PDF) y
 *  descargable (CSV). Departamento de Alianzas (o admin). */
export default async function ReporteAlianzasPage() {
  const { perfil } = await requireUsuario();
  // Consulta cruzada (0226): Logística lee la reportería del departamento que le
  // consigue los recursos. `resumen_alianzas()` ya abrió su gate a las dos áreas.
  const esAli = puedeAlianzas(perfil);
  const soloLectura = !esAli && puedeLogistica(perfil);
  if (!esAli && !soloLectura) redirect('/dashboard');
  const supabase = await createClient();
  const [resumen, empresas] = await Promise.all([
    consultarResumenAlianzas(supabase),
    consultarEmpresasAlianzas(supabase),
  ]);

  if (!resumen && empresas.length === 0) {
    return (
      <AnimarEntrada>
        <div className="pagina-cab"><h1 className="fila" style={{ gap: 8 }}><Icono nombre="documento" size={24} /> Reportería · Alianzas</h1></div>
        <EstadoVacio icono="documento" titulo="Aún no disponible"
          texto="La reportería estará lista cuando se aplique la migración 0200 y haya empresas registradas en Captación/Prospección." />
      </AnimarEntrada>
    );
  }

  const k = resumen?.kpis ?? {};
  const porEstado = resumen?.por_estado ?? {};
  const porRubro = resumen?.por_rubro ?? {};
  const porScore = resumen?.por_score ?? {};
  // Claves de 0228. Si la migración no está aplicada llegan `undefined` y su bloque
  // sencillamente no se pinta (el reporte de 0200 sigue completo).
  const afiliados = resumen?.afiliados;
  const escalado = resumen?.escalado;
  const capacidad = resumen?.capacidad;
  const correos = resumen?.correos;
  const porOrigen = resumen?.por_origen;
  const transporte = resumen?.transporte;
  const totalEmpresas = Number(k.total_empresas ?? empresas.length);
  const rubros = Object.entries(porRubro).sort((a, b) => Number(b[1]) - Number(a[1]));
  const prom = k.prom_dias_verificado;

  const TILES: { etiqueta: string; valor: string; icono: string; sub?: string }[] = [
    { etiqueta: 'Empresas captadas', valor: totalEmpresas.toLocaleString('es'), icono: 'enlace', sub: 'Total del registro' },
    { etiqueta: 'Verificadas 🟠', valor: Number(k.verificadas ?? 0).toLocaleString('es'), icono: 'ok', sub: 'Datos confirmados' },
    { etiqueta: 'Enviadas a Logística 🟢', valor: Number(k.enviadas_logistica ?? 0).toLocaleString('es'), icono: 'cohete', sub: 'Listas para operar' },
    { etiqueta: 'Tiempo a verificado', valor: prom == null ? '—' : `${prom} días`, icono: 'reloj', sub: 'Promedio Pendiente → Verificado' },
  ];

  const totalPorEstado = ESTADOS_OPORTUNIDAD.reduce((s, e) => s + Number(porEstado[e] ?? 0), 0);

  return (
    <AnimarEntrada>
      <div className="pagina-cab no-print">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="documento" size={24} /> Reportería · Alianzas Estratégicas</h1>
          <p className="muted sub">Respaldo del registro «Captado» para presentar a las empresas.</p>
        </div>
        <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
          {esAli
            ? <Link href="/captacion" className="btn btn-sm"><Icono nombre="enlace" size={15} /> Empresas y aliados</Link>
            : <Link href="/alianzas/proveedores" className="btn btn-sm"><Icono nombre="caja" size={15} /> Aliados y capacidad</Link>}
          <a className="btn btn-sm" href="/reportes/alianzas/export"><Icono nombre="documento" size={15} /> Descargar CSV</a>
          <BotonImprimir label="Imprimir / PDF" />
        </div>
      </div>

      {soloLectura && (
        <div className="aviso no-print" style={{ marginBottom: 12 }}>
          <Icono nombre="ojo" size={15} /> Estás viendo la reportería de Alianzas <strong>en modo consulta</strong>:
          con qué aliados se ha logrado contar y cuánto han entregado de lo que prometieron.
        </div>
      )}

      <p className="muted sub" style={{ marginTop: 0 }}>Generado {fechaHora(new Date())} · {totalEmpresas} empresas en el registro de Alianzas Estratégicas.</p>

      {/* KPIs de cabecera */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 8 }}>
        {TILES.map((t) => (
          <div key={t.etiqueta} className="tarjeta" style={{ padding: 14 }}>
            <div className="muted fila" style={{ gap: 6, fontSize: '.82rem' }}><Icono nombre={t.icono} size={15} /> {t.etiqueta}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 4 }}>{t.valor}</div>
            {t.sub && <div className="muted" style={{ fontSize: '.76rem' }}>{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* Por estado + por rubro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Empresas por estado <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>({totalPorEstado})</span></h2>
          {totalPorEstado === 0 ? <p className="muted" style={{ margin: 0 }}>Sin empresas.</p> : ESTADOS_OPORTUNIDAD.map((e) => {
            const n = Number(porEstado[e] ?? 0);
            const pct = totalPorEstado ? Math.round((n / totalPorEstado) * 100) : 0;
            return (
              <div key={e} style={{ marginBottom: 8 }}>
                <div className="fila" style={{ justifyContent: 'space-between', fontSize: '.9rem' }}>
                  <span>{ETIQUETA_ESTADO_OPORTUNIDAD[e]}</span><strong>{n}</strong>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--sup2)', marginTop: 3 }}>
                  <div style={{ height: '100%', width: pct + '%', borderRadius: 3, background: 'var(--acento, #2563eb)' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Empresas por rubro</h2>
          {rubros.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin rubros registrados.</p> : (
            <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
              {rubros.map(([r, n]) => <span key={r} className="pill">{r}: <strong>{Number(n)}</strong></span>)}
            </div>
          )}
          {Object.keys(porScore).length > 0 && (
            <>
              <div className="muted" style={{ fontSize: '.82rem', margin: '12px 0 4px' }}>Score de confiabilidad</div>
              <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                {[5, 4, 3, 2, 1].map((s) => porScore[String(s)] != null && (
                  <span key={s} className="pill">{'★'.repeat(s)}: <strong>{Number(porScore[String(s)])}</strong></span>
                ))}
                {porScore['sin'] != null && <span className="pill muted">Sin evaluar: <strong>{Number(porScore['sin'])}</strong></span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ampliación 0228: el departamento entero. Cada bloque se pinta solo si la RPC
          trae su clave, así que una base sin 0228 aplicada muestra el reporte de 0200. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
        {afiliados && (
          <div className="tarjeta">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Afiliación</h2>
            <table className="tabla"><tbody>
              <tr><td>Personas afiliadas</td><td style={{ textAlign: 'right' }}><strong>{Number(afiliados.total ?? 0)}</strong></td></tr>
              <tr><td>Activas</td><td style={{ textAlign: 'right' }}><strong>{Number(afiliados.activos ?? 0)}</strong></td></tr>
              <tr><td>Con cuenta en la plataforma</td><td style={{ textAlign: 'right' }}>{Number(afiliados.con_cuenta ?? 0)}</td></tr>
              {Object.entries(afiliados.por_tipo ?? {}).map(([t, n]) => (
                <tr key={t}><td className="muted">{t === 'profesional' ? 'Profesionales' : 'Voluntarios'}</td>
                  <td style={{ textAlign: 'right' }}>{Number(n)}</td></tr>
              ))}
            </tbody></table>
            {(afiliados.por_cargo ?? []).length > 0 && (
              <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {(afiliados.por_cargo ?? []).slice(0, 8).map((c) => (
                  <span key={c.cargo} className="pill">{c.cargo}: <strong>{c.n}</strong></span>
                ))}
              </div>
            )}
          </div>
        )}

        {escalado && (
          <div className="tarjeta">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Lo que Logística nos escala</h2>
            <table className="tabla"><tbody>
              <tr><td>Solicitudes escaladas</td><td style={{ textAlign: 'right' }}><strong>{Number(escalado.a_alianzas ?? 0)}</strong></td></tr>
              <tr><td>Aún sin resolver</td><td style={{ textAlign: 'right', color: Number(escalado.escalado_pendiente ?? 0) > 0 ? '#ea580c' : undefined }}>
                <strong>{Number(escalado.escalado_pendiente ?? 0)}</strong></td></tr>
              <tr><td>Resueltas</td><td style={{ textAlign: 'right' }}>{Number(escalado.escalado_resuelto ?? 0)}</td></tr>
              <tr><td>Voluntariado profesional</td><td style={{ textAlign: 'right' }}>{Number(escalado.voluntariado ?? 0)}</td></tr>
            </tbody></table>
          </div>
        )}

        {capacidad && (
          <div className="tarjeta">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Capacidad conseguida</h2>
            <table className="tabla"><tbody>
              <tr><td>Compromisos vigentes</td><td style={{ textAlign: 'right' }}><strong>{Number(capacidad.compromisos ?? 0)}</strong></td></tr>
              <tr><td>Aliados que aportan</td><td style={{ textAlign: 'right' }}>{Number(capacidad.proveedores ?? 0)}</td></tr>
              <tr><td>Comprometido</td><td style={{ textAlign: 'right' }}>{Number(capacidad.comprometido ?? 0).toLocaleString('es-VE')}</td></tr>
              <tr><td>Entregado de verdad</td><td style={{ textAlign: 'right' }}><strong>{Number(capacidad.entregado ?? 0).toLocaleString('es-VE')}</strong></td></tr>
              <tr><td>Aún disponible</td><td style={{ textAlign: 'right' }}>{Number(capacidad.restante ?? 0).toLocaleString('es-VE')}</td></tr>
            </tbody></table>
            <p className="muted" style={{ fontSize: '.78rem', marginTop: 8, marginBottom: 0 }}>
              {Number(capacidad.recurrentes ?? 0)} acuerdo(s) recurrente(s) y {Number(capacidad.puntuales ?? 0)} puntual(es).
              Prometer no es entregar: la fila de «entregado» es la que cuenta.
            </p>
          </div>
        )}

        {correos && (
          <div className="tarjeta">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Correo institucional</h2>
            <table className="tabla"><tbody>
              <tr><td>Envíos registrados</td><td style={{ textAlign: 'right' }}><strong>{Number(correos.total ?? 0)}</strong></td></tr>
              <tr><td>Entregados a Resend</td><td style={{ textAlign: 'right' }}>{Number(correos.enviados ?? 0)}</td></tr>
              <tr><td>Fallidos</td><td style={{ textAlign: 'right', color: Number(correos.fallidos ?? 0) > 0 ? '#ea580c' : undefined }}>
                {Number(correos.fallidos ?? 0)}</td></tr>
              <tr><td>Último envío</td><td style={{ textAlign: 'right' }} className="muted">{correos.ultimo ? fechaHora(correos.ultimo) : '—'}</td></tr>
            </tbody></table>
            {(correos.por_plantilla ?? []).length > 0 && (
              <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {(correos.por_plantilla ?? []).slice(0, 6).map((p) => (
                  <span key={p.plantilla} className="pill">{p.plantilla}: <strong>{p.n}</strong></span>
                ))}
              </div>
            )}
          </div>
        )}

        {porOrigen && Object.keys(porOrigen).length > 0 && (
          <div className="tarjeta">
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Cómo llegaron</h2>
            <table className="tabla"><tbody>
              {Object.entries(porOrigen).map(([o, n]) => (
                <tr key={o}><td>{ETIQUETA_ORIGEN_OPORTUNIDAD[o] ?? o}</td>
                  <td style={{ textAlign: 'right' }}><strong>{Number(n)}</strong></td></tr>
              ))}
              {transporte && (
                <tr><td className="muted">Con transporte propio</td>
                  <td style={{ textAlign: 'right' }}>{Number(transporte.con_transporte ?? 0)}</td></tr>
              )}
            </tbody></table>
          </div>
        )}
      </div>

      {/* Respaldo: tabla de empresas con su volumen / insumos */}
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Registro de empresas <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>({empresas.length})</span></h2>
        {empresas.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Aún no hay empresas registradas.</p>
        ) : (
          <div className="tabla-scroll"><table>
            <thead>
              <tr>
                <th>Empresa</th><th>Rubro</th><th>Estado</th>
                <th>Volumen / insumos</th><th style={{ textAlign: 'center' }}>Score</th><th style={{ textAlign: 'center' }}>Días a verif.</th>
              </tr>
            </thead>
            <tbody>
              {empresas.slice(0, 200).map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.titulo}</strong></td>
                  <td className="muted">{o.rubro ?? '—'}</td>
                  <td><Pill tono={tonoEstadoOportunidad(o.estado)} punto={false}>{ETIQUETA_ESTADO_OPORTUNIDAD[o.estado as keyof typeof ETIQUETA_ESTADO_OPORTUNIDAD] ?? o.estado}</Pill></td>
                  <td>{o.volumen ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{o.score_confiabilidad != null ? '★'.repeat(o.score_confiabilidad) : '—'}</td>
                  <td style={{ textAlign: 'center' }} className="muted">{diasAVerificado(o) === '' ? '—' : diasAVerificado(o)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {empresas.length > 200 && <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 0' }}>Se muestran las primeras 200. Descarga el CSV para el listado completo.</p>}
      </div>
    </AnimarEntrada>
  );
}
