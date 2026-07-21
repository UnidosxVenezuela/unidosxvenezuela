import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_CANAL_DIFUSION } from '@/lib/constantes';
import { consultarDifusion, horasLegible } from '@/lib/export/difusion';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonImprimir from '@/components/BotonImprimir';

export const metadata = { title: 'Analítica de difusión' };
export const dynamic = 'force-dynamic';

/** Analítica del pipeline de difusión (0197): qué se publica por canal, cuánto tarda
 *  una solicitud desde que se CONFIRMA hasta que se PUBLICA, y cuántas confirmadas
 *  siguen en cola. Para Redacción/Redes/admin. Imprimible (PDF) + CSV. */
export default async function DifusionPage() {
  const { perfil } = await requireUsuario();
  const puede = esAdministrador(perfil) || esAdminRedes(perfil) || rolesDe(perfil).includes('redaccion');
  if (!puede) redirect('/dashboard');

  const supabase = await createClient();
  const d = await consultarDifusion(supabase);

  if (!d) {
    return (
      <AnimarEntrada>
        <div className="pagina-cab"><h1 className="fila" style={{ gap: 8 }}><Icono nombre="tablon" size={24} /> Analítica de difusión</h1></div>
        <EstadoVacio icono="tablon" titulo="Aún no disponible"
          texto="La analítica de difusión estará lista cuando se aplique la migración 0197 en la base de datos." />
      </AnimarEntrada>
    );
  }

  const k = d.kpis ?? {};
  const porCanal = (d.por_canal ?? []) as { canal: string; publicadas: number; pendientes: number }[];
  const pend = d.pendientes ?? {};
  const plazo = d.plazo ?? {};
  const maxCanal = porCanal.reduce((m, c) => Math.max(m, Number(c.publicadas), Number(c.pendientes)), 0);

  const TILES: { k: string; etiqueta: string; icono: string }[] = [
    { k: 'publicadas', etiqueta: 'Solicitudes publicadas', icono: 'ok' },
    { k: 'piezas_por_canal', etiqueta: 'Piezas publicadas', icono: 'tablon' },
    { k: 'canales_activos', etiqueta: 'Canales activos', icono: 'enlace' },
    { k: 'sin_publicar', etiqueta: 'Confirmadas sin publicar', icono: 'reloj' },
  ];

  return (
    <AnimarEntrada>
      <div className="pagina-cab no-print">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="tablon" size={24} /> Analítica de difusión</h1>
          <p className="muted sub">Cuánto se publica, por dónde y en qué plazo desde la confirmación.</p>
        </div>
        <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link href="/envio-redaccion" className="btn btn-sm"><Icono nombre="cohete" size={15} /> Envío a Redacción</Link>
          <a className="btn btn-sm" href="/reportes/difusion/export"><Icono nombre="documento" size={15} /> Descargar CSV</a>
          <BotonImprimir label="Imprimir / PDF" />
        </div>
      </div>

      <p className="muted sub" style={{ marginTop: 0 }}>Generado {fechaHora(new Date())} · Excluye la categoría restringida «Desaparecidos».</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 8 }}>
        {TILES.map((t) => (
          <div key={t.k} className="tarjeta" style={{ padding: 14 }}>
            <div className="muted fila" style={{ gap: 6, fontSize: '.82rem' }}><Icono nombre={t.icono} size={15} /> {t.etiqueta}</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 4, color: t.k === 'sin_publicar' && Number(k[t.k] ?? 0) > 0 ? '#ea580c' : 'var(--texto)' }}>{Number(k[t.k] ?? 0).toLocaleString('es')}</div>
          </div>
        ))}
      </div>

      {/* Publicaciones por canal */}
      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Publicaciones por canal</h2>
        {porCanal.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Aún no hay publicaciones registradas por canal.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {porCanal.map((c) => {
              const pub = Number(c.publicadas);
              const pen = Number(c.pendientes);
              const pctPub = maxCanal ? Math.round((pub / maxCanal) * 100) : 0;
              return (
                <div key={c.canal}>
                  <div className="fila" style={{ justifyContent: 'space-between', fontSize: '.9rem', marginBottom: 3 }}>
                    <strong>{ETIQUETA_CANAL_DIFUSION[c.canal] ?? c.canal}</strong>
                    <span className="muted">{pub} publicada(s){pen > 0 ? ` · ${pen} pendiente(s)` : ''}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--sup2)' }}>
                    <div style={{ height: '100%', width: pctPub + '%', borderRadius: 4, background: 'var(--acento, #2563eb)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cola + Plazo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}><Icono nombre="reloj" size={17} /> Cola de publicación</h2>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>Solicitudes confirmadas que todavía no se publican.</p>
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="tarjeta" style={{ padding: '8px 12px', minWidth: 110, flex: '1 1 110px' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>Sin publicar</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: Number(pend.total ?? 0) > 0 ? '#ea580c' : 'var(--texto)' }}>{Number(pend.total ?? 0)}</div>
            </div>
            <div className="tarjeta" style={{ padding: '8px 12px', minWidth: 110, flex: '1 1 110px' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>Espera promedio</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{horasLegible(pend.espera_prom_horas)}</div>
            </div>
            <div className="tarjeta" style={{ padding: '8px 12px', minWidth: 110, flex: '1 1 110px' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>Espera máxima</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{horasLegible(pend.espera_max_horas)}</div>
            </div>
          </div>
        </div>

        <div className="tarjeta">
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}><Icono nombre="historial" size={17} /> Plazo de publicación</h2>
          <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>Tiempo desde que se confirma hasta que se publica.</p>
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="tarjeta" style={{ padding: '8px 12px', minWidth: 110, flex: '1 1 110px' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>Promedio</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{horasLegible(plazo.prom_horas)}</div>
            </div>
            <div className="tarjeta" style={{ padding: '8px 12px', minWidth: 110, flex: '1 1 110px' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>Mediana</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{horasLegible(plazo.mediana_horas)}</div>
            </div>
            <div className="tarjeta" style={{ padding: '8px 12px', minWidth: 110, flex: '1 1 110px' }}>
              <div className="muted" style={{ fontSize: '.78rem' }}>Publicadas medidas</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{Number(plazo.publicadas ?? 0)}</div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: '.78rem', margin: '8px 0 0' }}>El plazo se mide desde que se registra la confirmación; las solicitudes anteriores a esa marca usan su fecha de ingreso.</p>
        </div>
      </div>
    </AnimarEntrada>
  );
}
