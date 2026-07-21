import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ESTADOS_OPORTUNIDAD, ETIQUETA_ESTADO_OPORTUNIDAD, tonoEstadoOportunidad } from '@/lib/constantes';
import { consultarResumenAlianzas, consultarEmpresasAlianzas, diasAVerificado } from '@/lib/export/alianzas';
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
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
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
          <Link href="/captacion" className="btn btn-sm"><Icono nombre="enlace" size={15} /> Captación</Link>
          <a className="btn btn-sm" href="/reportes/alianzas/export"><Icono nombre="documento" size={15} /> Descargar CSV</a>
          <BotonImprimir label="Imprimir / PDF" />
        </div>
      </div>

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
