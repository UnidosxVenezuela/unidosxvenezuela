'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Icono from './Icono';

/**
 * Aviso de apertura a Colombia (agosto 2026), tras el terremoto de magnitud 7,4.
 *
 * Se muestra UNA VEZ por persona y se recuerda en `localStorage`. No es una alerta ni
 * una interrupción cada vez que se entra: quien ya lo leyó no vuelve a verlo. La clave
 * lleva versión para poder volver a mostrarlo si el mensaje cambia de verdad —subir la
 * versión por cualquier retoque de estilo sería usar la atención del equipo sin motivo.
 *
 * Sobre el tono: esto no anuncia una función, informa de una emergencia con gente
 * dentro. Nada de «¡Novedad!» ni de celebrar la ampliación. Se nombra lo que pasó, se
 * dice qué se puede hacer y se sale del camino.
 *
 * Accesibilidad: `role="dialog"` + `aria-modal`, cierra con Escape, con la «X», con el
 * botón y tocando fuera; el foco entra en el botón de cierre al abrir y vuelve a lo que
 * estaba enfocado al cerrar. Si `localStorage` no está disponible (modo privado, ajustes
 * estrictos) el aviso simplemente no se muestra: mejor perder el aviso que atrapar a
 * alguien en una ventana que no puede recordar haber cerrado.
 */
const CLAVE = 'aviso-colombia-v1';

export default function AvisoColombia() {
  const [abierto, setAbierto] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const previo = useRef<Element | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE)) return;
      previo.current = document.activeElement;
      setAbierto(true);
    } catch {
      /* Sin almacenamiento no se muestra: ver la nota de arriba. */
    }
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    cerrarRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  function cerrar() {
    try { window.localStorage.setItem(CLAVE, '1'); } catch { /* se cierra igual */ }
    setAbierto(false);
    (previo.current as HTMLElement | null)?.focus?.();
  }

  if (!abierto) return null;

  return createPortal(
    <div className="confirm-backdrop" role="presentation" onClick={cerrar}>
      <div className="modal-caja" role="dialog" aria-modal="true" aria-labelledby="aviso-co-tit"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h3 id="aviso-co-tit" className="fila" style={{ margin: 0, gap: 8 }}>
            <span aria-hidden="true">🇨🇴</span> Colombia también necesita ayuda
          </h3>
          <button ref={cerrarRef} type="button" className="btn" onClick={cerrar}
            aria-label="Cerrar el aviso" style={{ minHeight: 32, padding: '2px 9px', flexShrink: 0 }}>
            <Icono nombre="cerrar" size={16} />
          </button>
        </div>

        <p style={{ marginTop: 12 }}>
          Un terremoto de <strong>magnitud 7,4</strong> golpeó Colombia. Hay familias empezando los días
          más difíciles, y aquí sabemos bien lo que es eso.
        </p>
        <p>
          La plataforma <strong>ya está lista para recibir solicitudes de Colombia</strong>. Si te llega
          información de allá, repórtala como siempre: al indicar la ubicación, <strong>elige el país</strong>.
        </p>
        <p className="muted" style={{ fontSize: '.88rem' }}>
          Lo demás no cambia — la misma verificación, el mismo cuidado con los datos de la gente y el mismo
          equipo. Cada solicitud queda marcada con su país, así que nada se mezcla.
        </p>

        <div className="confirm-acciones" style={{ marginTop: 16 }}>
          <Link href="/ayuda" className="btn" onClick={cerrar}>Cómo reportar</Link>
          <button type="button" className="btn btn-primario" onClick={cerrar}>Entendido</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
