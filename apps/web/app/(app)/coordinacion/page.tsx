import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  AREAS_DESTINO, ETIQUETA_AREA_DESTINO, ESTADOS_DERIVACION, ETIQUETA_ESTADO_DERIVACION,
  ESTADOS_CASO, ETIQUETA_ESTADO_CASO,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';

export const metadata = { title: 'Coordinación' };

/** Tablero de Coordinación cross-área (0195): la foto AGREGADA de toda la respuesta
 *  (matriz de derivaciones por área × estado + embudo de solicitudes + KPIs), que ni
 *  el Panel («pendiente de mí») ni /seguimiento (caso a caso) daban. Solo Coordinación. */
export default async function CoordinacionPage() {
  await requireCoordinacion();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('resumen_coordinacion');
  const r = (data ?? {}) as any;
  const matriz = (r.matriz ?? []) as { area: string; estado: string; n: number; personas: number }[];
  const kpis = (r.kpis ?? {}) as Record<string, number>;
  const casosPorEstado = (r.casos_por_estado ?? {}) as Record<string, number>;

  // Índice (área,estado) → nº, y totales por fila/columna/personas.
  const celda = new Map<string, number>();
  const personasArea = new Map<string, number>();
  matriz.forEach((m) => {
    celda.set(m.area + '·' + m.estado, Number(m.n));
    personasArea.set(m.area, (personasArea.get(m.area) ?? 0) + Number(m.personas));
  });
  const totalArea = (a: string) => ESTADOS_DERIVACION.reduce((s, e) => s + (celda.get(a + '·' + e) ?? 0), 0);
  const totalEstado = (e: string) => AREAS_DESTINO.reduce((s, a) => s + (celda.get(a + '·' + e) ?? 0), 0);
  const areasConDatos = AREAS_DESTINO.filter((a) => totalArea(a) > 0);
  const totalCasosEmbudo = ESTADOS_CASO.reduce((s, e) => s + (casosPorEstado[e] ?? 0), 0);

  const TILES: { k: string; etiqueta: string; icono: string }[] = [
    { k: 'casos_activos', etiqueta: 'Solicitudes activas', icono: 'documento' },
    { k: 'derivaciones_abiertas', etiqueta: 'Derivaciones abiertas', icono: 'buscar' },
    { k: 'personas_afectadas', etiqueta: 'Personas afectadas', icono: 'usuario' },
    { k: 'derivaciones_total', etiqueta: 'Derivaciones (histórico)', icono: 'historial' },
  ];

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="panel" size={24} /> Coordinación</h1>
          <p className="muted sub">La foto agregada de toda la respuesta: por dónde va cada área y cuánto está en juego.</p>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <Link href="/seguimiento" className="btn btn-sm"><Icono nombre="buscar" size={15} /> Buscar una solicitud</Link>
        </div>
      </div>

      {error ? (
        <EstadoVacio icono="panel" titulo="Aún no disponible"
          texto="El resumen de coordinación estará listo cuando se aplique la migración 0195 en la base de datos." />
      ) : (
        <>
          {/* KPIs de cabecera */}
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 8 }}>
            {TILES.map((t) => (
              <div key={t.k} className="tarjeta" style={{ padding: 14 }}>
                <div className="muted fila" style={{ gap: 6, fontSize: '.82rem' }}><Icono nombre={t.icono} size={15} /> {t.etiqueta}</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 4 }}>{Number(kpis[t.k] ?? 0).toLocaleString('es')}</div>
              </div>
            ))}
          </div>

          {/* Matriz derivaciones: área × estado */}
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
                        const abierta = e !== 'cerrada';
                        return <td key={e} style={{ textAlign: 'center', fontWeight: n ? 600 : 400, color: n && abierta ? 'var(--texto)' : 'var(--muted)' }}>{n || '·'}</td>;
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
            <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 0' }}>Cada celda cuenta las derivaciones en ese estado. «Personas» suma las personas afectadas de las solicitudes derivadas a esa área.</p>
          </div>

          {/* Embudo de solicitudes por estado */}
          <div className="tarjeta" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Solicitudes por estado <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>({totalCasosEmbudo})</span></h2>
            <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
              {ESTADOS_CASO.map((e) => {
                const n = casosPorEstado[e] ?? 0;
                const pct = totalCasosEmbudo ? Math.round((n / totalCasosEmbudo) * 100) : 0;
                return (
                  <div key={e} className="tarjeta" style={{ padding: '8px 12px', minWidth: 120, flex: '1 1 120px' }}>
                    <div className="muted" style={{ fontSize: '.8rem' }}>{ETIQUETA_ESTADO_CASO[e] ?? e}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{n}</div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--sup2)', marginTop: 4 }}>
                      <div style={{ height: '100%', width: pct + '%', borderRadius: 2, background: 'var(--acento, #2563eb)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 0' }}>Excluye la categoría restringida «Desaparecidos».</p>
          </div>
        </>
      )}
    </AnimarEntrada>
  );
}
