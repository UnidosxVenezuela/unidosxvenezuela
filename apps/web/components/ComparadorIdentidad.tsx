'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Comparador de identidad: botón «Comparar» que abre un modal para cotejar el rostro
 * (selfie con el documento a la vista) contra la cédula, lado a lado y con zoom, para
 * revisar la segunda verificación con detalle. Accesible: rol dialog, foco al abrir,
 * Escape y clic en el fondo para cerrar, y bloquea el scroll del fondo mientras abre.
 */
export default function ComparadorIdentidad({ selfieUrl, docUrl, nombre }: {
  selfieUrl: string | null;
  docUrl: string | null;
  nombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [zoom, setZoom] = useState(1);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    cerrarRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [abierto]);

  if (!selfieUrl && !docUrl) return null;
  const fotos: { u: string | null; t: string }[] = [
    { u: selfieUrl, t: 'Rostro + documento' },
    { u: docUrl, t: 'Documento' },
  ];

  return (
    <>
      <button type="button" className="btn" onClick={() => { setZoom(1); setAbierto(true); }}>
        🔍 Comparar
      </button>
      {abierto && (
        <div
          className="comparador-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={'Comparar identidad de ' + nombre}
          onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}
        >
          <div className="comparador-caja">
            <div className="comparador-barra">
              <strong style={{ fontSize: '.95rem' }}>Comparar · {nombre}</strong>
              <div className="fila" style={{ gap: 6 }}>
                <button type="button" className="comparador-ctrl" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}>−</button>
                <span className="muted" style={{ minWidth: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</span>
                <button type="button" className="comparador-ctrl" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(1)))}>+</button>
                <button ref={cerrarRef} type="button" className="comparador-ctrl" aria-label="Cerrar comparador" onClick={() => setAbierto(false)}>✕</button>
              </div>
            </div>
            <div className="comparador-fotos">
              {fotos.map((img, i) => (
                <figure key={i} className="comparador-foto">
                  <figcaption>{img.t}</figcaption>
                  <div className="comparador-lienzo">
                    {img.u
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={img.u} alt={img.t + ' de ' + nombre} style={{ transform: `scale(${zoom})` }} />
                      : <span className="muted" style={{ padding: 20 }}>Sin imagen</span>}
                  </div>
                </figure>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
