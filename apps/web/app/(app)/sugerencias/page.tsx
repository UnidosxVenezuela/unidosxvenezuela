// Mis reportes (0234). Cada quien ve LO SUYO, con el estado y la respuesta.
// Sin esta página, reportar sería gritar a un pozo: nadie sabría si llegó ni qué se
// decidió, y a la tercera se deja de reportar.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import { ESTADO_SUGERENCIA, TIPO_SUGERENCIA, tonoEstadoSugerencia } from '@/lib/sugerencias';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import EstadoVacio from '@/components/EstadoVacio';

export const dynamic = 'force-dynamic';

export default async function MisSugerenciasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sugerencias')
    .select('id, tipo, mensaje, ruta, estado, nota_admin, atendida_en, creado_en')
    .order('creado_en', { ascending: false })
    .limit(100);

  // A prueba de fallos: si 0234 no está aplicada, se avisa y el resto de la app sigue.
  if (error) {
    return (
      <div>
        <h1 className="fila" style={{ gap: 8 }}><Icono nombre="bombilla" size={24} /> Mis reportes</h1>
        <div className="tarjeta">
          <p className="muted" style={{ margin: 0 }}>
            El buzón todavía no está disponible: falta aplicar la migración <code>0234</code>.
          </p>
        </div>
      </div>
    );
  }

  const filas = (data ?? []) as any[];

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 className="fila" style={{ gap: 8 }}><Icono nombre="bombilla" size={24} /> Mis reportes</h1>
      <p className="muted">
        Lo que has contado —problemas e ideas— con lo que ha decidido coordinación. Para
        enviar uno nuevo, usa el botón redondo pequeño de abajo a la derecha, en cualquier
        pantalla.
      </p>

      {filas.length === 0 ? (
        <EstadoVacio
          icono="bombilla"
          titulo="Todavía no has reportado nada"
          texto="Si algo falla o se te ocurre cómo mejorarlo, cuéntalo desde el botón pequeño de abajo a la derecha. Se envía con la página en la que estés."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filas.map((s) => (
            <article key={s.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span className="fila" style={{ gap: 6 }}>
                  <Icono nombre={s.tipo === 'idea' ? 'cohete' : 'avisos'} size={16} />
                  <strong>{TIPO_SUGERENCIA[s.tipo as 'problema' | 'idea'] ?? s.tipo}</strong>
                </span>
                <Pill tono={tonoEstadoSugerencia(s.estado)} punto={false}>
                  {ESTADO_SUGERENCIA[s.estado as keyof typeof ESTADO_SUGERENCIA] ?? s.estado}
                </Pill>
              </div>

              <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{s.mensaje}</p>

              <div className="muted" style={{ fontSize: '.82rem', marginTop: 6 }}>
                {fechaHora(s.creado_en)}
                {s.ruta && <> · <Link href={s.ruta as any}>{s.ruta}</Link></>}
              </div>

              {s.nota_admin && (
                <div className="tarjeta" style={{ marginTop: 10, background: 'var(--sup2)' }}>
                  <div className="muted" style={{ fontSize: '.8rem' }}>
                    Respuesta de coordinación{s.atendida_en ? ' · ' + fechaHora(s.atendida_en) : ''}
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{s.nota_admin}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
