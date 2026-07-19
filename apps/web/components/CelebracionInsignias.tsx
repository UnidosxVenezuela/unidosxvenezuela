'use client';
import { useEffect, useState } from 'react';
import MedallaInsignia, { type NivelInsignia } from './MedallaInsignia';

export type MedallaCelebrable = {
  estilo: 'E' | 'D';
  nivel: NivelInsignia | null;
  icono: string | null;
  texto: string | null;
  nombre: string;
  descripcion: string;
};

const CONF = ['#FFCE00', '#0033A0', '#CF142B', '#FFCE00', '#3a5cd0', '#CF142B', '#FFCE00', '#0f8a55'];

/**
 * Celebración de una insignia (rediseño / Claude Design): un botón abre un modal a pantalla
 * completa con la medalla grande que se ARMA por capas (MedallaInsignia `animada`), un aura
 * pulsante y confeti cayendo. Cada apertura reinicia la animación (key por ronda). Respeta
 * `prefers-reduced-motion` desde globals.css.
 *
 * `compacto`: botón pequeño para reproducir la animación de UNA insignia ya ganada desde su
 * tarjeta en la vitrina (así los miembros que la ganaron antes de este parche también pueden
 * verla). Sin `compacto`, el botón grande «Ver la celebración» del encabezado (última ganada).
 */
export default function CelebracionInsignias({ medalla, compacto = false }: { medalla: MedallaCelebrable | null; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [ronda, setRonda] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onKey);
    // Bloquea el scroll del fondo mientras la celebración está abierta.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [abierto]);

  function celebrar() { setRonda((r) => r + 1); setAbierto(true); }

  return (
    <>
      {compacto ? (
        <button
          type="button"
          className="btn"
          style={{ minHeight: 30, padding: '2px 12px', borderRadius: 999, fontSize: '.82rem' }}
          onClick={celebrar}
          title={medalla ? `Ver la animación de «${medalla.nombre}»` : 'Ver la animación'}
        >
          ✨ Ver animación
        </button>
      ) : (
        <button type="button" className="btn btn-acento" onClick={celebrar}>✨ Ver la celebración</button>
      )}

      {abierto && medalla && (
        <div className="celeb-overlay" onClick={() => setAbierto(false)}>
          {/* Confeti cayendo (decorativo). */}
          {Array.from({ length: 9 }, (_, i) => (
            <span key={`${ronda}-${i}`} aria-hidden className="celeb-confeti"
              style={{
                left: 8 + i * 10 + '%',
                background: CONF[i % CONF.length],
                borderRadius: i % 2 ? '999px' : '2px',
                animationDelay: (i * 0.12).toFixed(2) + 's',
                animationDuration: (1.6 + (i % 4) * 0.15).toFixed(2) + 's',
              }} />
          ))}

          <div role="dialog" aria-label={`Insignia: ${medalla.nombre}`} className="celeb-card"
            onClick={(e) => e.stopPropagation()}>
            <div aria-hidden className="celeb-aura" />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              <MedallaInsignia
                key={ronda}
                uid={'celeb-' + ronda}
                estilo={medalla.estilo}
                nivel={medalla.nivel}
                icono={medalla.icono}
                texto={medalla.texto}
                size={170}
                title={medalla.nombre}
                animada
              />
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ambar-solido, #a16207)', marginTop: 14 }}>¡Nueva insignia!</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-.01em', margin: '4px 0 6px' }}>{medalla.nombre}</h2>
              <p style={{ color: 'var(--texto2, #556074)', margin: '0 0 20px', fontSize: '.92rem' }}>{medalla.descripcion} 💛💙❤️</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primario" style={{ minHeight: 44 }} onClick={() => setAbierto(false)}>¡Genial!</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
