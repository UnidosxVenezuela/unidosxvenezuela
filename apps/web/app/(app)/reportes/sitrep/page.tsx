import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ESTADOS_CASO, ETIQUETA_ESTADO_CASO, ETIQUETA_PRIORIDAD,
  AREAS_DESTINO, ETIQUETA_AREA_DESTINO, ESTADOS_DERIVACION, ETIQUETA_ESTADO_DERIVACION,
  CANALES_DIFUSION, ETIQUETA_CANAL_DIFUSION,
} from '@/lib/constantes';
import { consultarSitrep, URGENCIAS_ORDEN } from '@/lib/export/sitrep';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonImprimir from '@/components/BotonImprimir';

export const metadata = { title: 'SitRep — Reporte de situación' };
export const dynamic = 'force-dynamic';

/** SitRep (0196): la FOTO agregada de un vistazo de toda la respuesta —panorama de
 *  solicitudes por estado y urgencia, derivaciones por área, pulso de Logística y
 *  Difusión, y KPIs— lista para imprimir (PDF) o descargar (CSV) y compartir con la
 *  coordinación. Solo Coordinación (admin). */
export default async function SitrepPage() {
  await requireCoordinacion();
  const supabase = await createClient();
  const d = await consultarSitrep(supabase);

  if (!d) {
    return (
      <AnimarEntrada>
        <div className="pagina-cab"><h1 className="fila" style={{ gap: 8 }}><Icono nombre="documento" size={24} /> SitRep</h1></div>
        <EstadoVacio icono="documento" titulo="Aún no disponible"
          texto="El reporte de situación estará listo cuando se aplique la migración 0196 en la base de datos." />
      </AnimarEntrada>
    );
  }

  const kpis = d.kpis ?? {};
  const porEstado = d.por_estado ?? {};
  const porUrgencia = d.por_urgencia ?? {};
  const logistica = d.logistica ?? {};
  const difusion = d.difusion ?? {};
  const porCanal = difusion.por_canal ?? {};

  // Matriz área × estado.
  const celda = new Map<string, number>();
  const personasArea = new Map<string, number>();
  (d.matriz ?? []).forEach((m) => {
    celda.set(m.area + '·' + m.estado, Number(m.n));
    personasArea.set(m.area, (personasArea.get(m.area) ?? 0) + Number(m.personas));
  });
  const totalArea = (a: string) => ESTADOS_DERIVACION.reduce((s, e) => s + (celda.get(a + '·' + e) ?? 0), 0);
  const totalEstado = (e: string) => AREAS_DESTINO.reduce((s, a) => s + (celda.get(a + '·' + e) ?? 0), 0);
  const areasConDatos = AREAS_DESTINO.filter((a) => totalArea(a) > 0);

  const totalEmbudo = ESTADOS_CASO.reduce((s, e) => s + (porEstado[e] ?? 0), 0);
  const totalUrg = URGENCIAS_ORDEN.reduce((s, p) => s + (porUrgencia[p] ?? 0), 0) + (porUrgencia['sin'] ?? 0);
  const totalLog = ESTADOS_DERIVACION.reduce((s, e) => s + (logistica[e] ?? 0), 0);

  const TILES: { k: string; etiqueta: string; icono: string }[] = [
    { k: 'solicitudes_total', etiqueta: 'Solicitudes', icono: 'documento' },
    { k: 'activas', etiqueta: 'Activas', icono: 'ok' },
    { k: 'personas_afectadas', etiqueta: 'Personas afectadas', icono: 'usuario' },
    { k: 'publicadas', etiqueta: 'Publicadas', icono: 'tablon' },
    { k: 'derivaciones_abiertas', etiqueta: 'Derivaciones abiertas', icono: 'buscar' },
    { k: 'derivaciones_total', etiqueta: 'Derivaciones (histórico)', icono: 'historial' },
  ];

  const urgColor: Record<string, string> = { critica: '#dc2626', alta: '#ea580c', media: '#ca8a04', baja: '#16a34a', sin: 'var(--muted)' };

  return (
    <AnimarEntrada>
      <div className="pagina-cab no-print">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="documento" size={24} /> SitRep · Reporte de situación</h1>
          <p className="muted sub">Foto agregada de toda la respuesta, lista para imprimir o compartir.</p>
        </div>
        <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link href="/coordinacion" className="btn btn-sm"><Icono nombre="panel" size={15} /> Coordinación</Link>
          <a className="btn btn-sm" href="/reportes/sitrep/export"><Icono nombre="documento" size={15} /> Descargar CSV</a>
          <BotonImprimir label="Imprimir / PDF" />
        </div>
      </div>

      <p className="muted sub" style={{ marginTop: 0 }}>Generado {fechaHora(new Date())} · Excluye la categoría restringida «Desaparecidos».</p>

      {/* KPIs de cabecera */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 8 }}>
        {TILES.map((t) => (
          <div key={t.k} className="tarjeta" style={{ padding: 14 }}>
            <div className="muted fila" style={{ gap: 6, fontSize: '.82rem' }}><Icono nombre={t.icono} size={15} /> {t.etiqueta}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: 4 }}>{Number(kpis[t.k] ?? 0).toLocaleString('es')}</div>
          </div>
        ))}
      </div>

      {/* Panorama: por estado + por urgencia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Solicitudes por estado <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>({totalEmbudo})</span></h2>
          {totalEmbudo === 0 ? <p className="muted" style={{ margin: 0 }}>Sin solicitudes.</p> : ESTADOS_CASO.map((e) => {
            const n = porEstado[e] ?? 0;
            const pct = totalEmbudo ? Math.round((n / totalEmbudo) * 100) : 0;
            return (
              <div key={e} style={{ marginBottom: 8 }}>
                <div className="fila" style={{ justifyContent: 'space-between', fontSize: '.9rem' }}>
                  <span>{ETIQUETA_ESTADO_CASO[e]}</span><strong>{n}</strong>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--sup2)', marginTop: 3 }}>
                  <div style={{ height: '100%', width: pct + '%', borderRadius: 3, background: 'var(--acento, #2563eb)' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Solicitudes por urgencia <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>({totalUrg})</span></h2>
          {totalUrg === 0 ? <p className="muted" style={{ margin: 0 }}>Sin datos de urgencia.</p> : (
            <>
              {URGENCIAS_ORDEN.map((p) => {
                const n = porUrgencia[p] ?? 0;
                const pct = totalUrg ? Math.round((n / totalUrg) * 100) : 0;
                return (
                  <div key={p} style={{ marginBottom: 8 }}>
                    <div className="fila" style={{ justifyContent: 'space-between', fontSize: '.9rem' }}>
                      <span className="fila" style={{ gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: urgColor[p] ?? 'var(--muted)' }} /> {ETIQUETA_PRIORIDAD[p]}</span><strong>{n}</strong>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--sup2)', marginTop: 3 }}>
                      <div style={{ height: '100%', width: pct + '%', borderRadius: 3, background: urgColor[p] ?? 'var(--muted)' }} />
                    </div>
                  </div>
                );
              })}
              {(porUrgencia['sin'] ?? 0) > 0 && (
                <div className="fila muted" style={{ justifyContent: 'space-between', fontSize: '.85rem', marginTop: 4 }}>
                  <span>Sin urgencia indicada</span><span>{porUrgencia['sin']}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Derivaciones por área × estado */}
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Derivaciones por área × estado</h2>
        {areasConDatos.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Aún no hay derivaciones registradas.</p>
        ) : (
          <div className="tabla-scroll"><table>
            <thead>
              <tr>
                <th>Área</th>
                {ESTADOS_DERIVACION.map((e) => <th key={e} style={{ textAlign: 'center' }}>{ETIQUETA_ESTADO_DERIVACION[e]}</th>)}
                <th style={{ textAlign: 'center' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Personas</th>
              </tr>
            </thead>
            <tbody>
              {areasConDatos.map((a) => (
                <tr key={a}>
                  <td><strong>{ETIQUETA_AREA_DESTINO[a]}</strong></td>
                  {ESTADOS_DERIVACION.map((e) => {
                    const n = celda.get(a + '·' + e) ?? 0;
                    return <td key={e} style={{ textAlign: 'center', fontWeight: n ? 600 : 400, color: n ? 'var(--texto)' : 'var(--muted)' }}>{n || '·'}</td>;
                  })}
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{totalArea(a)}</td>
                  <td style={{ textAlign: 'center' }} className="muted">{(personasArea.get(a) ?? 0).toLocaleString('es')}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--borde)' }}>
                <td><strong>Total</strong></td>
                {ESTADOS_DERIVACION.map((e) => <td key={e} style={{ textAlign: 'center', fontWeight: 700 }}>{totalEstado(e) || '·'}</td>)}
                <td style={{ textAlign: 'center', fontWeight: 800 }}>{AREAS_DESTINO.reduce((s, a) => s + totalArea(a), 0)}</td>
                <td></td>
              </tr>
            </tbody>
          </table></div>
        )}
      </div>

      {/* Logística + Difusión */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}><Icono nombre="camion" size={17} /> Logística <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>({totalLog} derivaciones)</span></h2>
          {totalLog === 0 ? <p className="muted" style={{ margin: 0 }}>Sin derivaciones a Logística.</p> : (
            <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
              {ESTADOS_DERIVACION.map((e) => (
                <div key={e} className="tarjeta" style={{ padding: '8px 12px', minWidth: 90, flex: '1 1 90px' }}>
                  <div className="muted" style={{ fontSize: '.78rem' }}>{ETIQUETA_ESTADO_DERIVACION[e]}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{logistica[e] ?? 0}</div>
                </div>
              ))}
            </div>
          )}
          <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 0' }}>Las «Cerrada» equivalen a entregas resueltas por Logística.</p>
        </div>

        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}><Icono nombre="tablon" size={17} /> Difusión</h2>
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div className="tarjeta" style={{ padding: '8px 12px', minWidth: 120, flex: '1 1 120px' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>Publicadas</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{Number(difusion.publicadas ?? 0).toLocaleString('es')}</div>
            </div>
            <div className="tarjeta" style={{ padding: '8px 12px', minWidth: 120, flex: '1 1 120px' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>Confirmadas sin publicar</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: (difusion.confirmadas_sin_publicar ?? 0) > 0 ? '#ea580c' : 'var(--texto)' }}>{Number(difusion.confirmadas_sin_publicar ?? 0).toLocaleString('es')}</div>
            </div>
          </div>
          {Object.keys(porCanal).length > 0 && (
            <>
              <div className="muted" style={{ fontSize: '.82rem', margin: '4px 0 4px' }}>Publicaciones por canal</div>
              <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                {CANALES_DIFUSION.filter((c) => porCanal[c] != null).map((c) => (
                  <span key={c} className="pill">{ETIQUETA_CANAL_DIFUSION[c] ?? c}: <strong>{porCanal[c]}</strong></span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AnimarEntrada>
  );
}
