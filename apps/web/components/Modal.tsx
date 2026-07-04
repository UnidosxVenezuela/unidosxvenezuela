'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icono from './Icono';

/**
 * Ventana flotante (modal) reutilizable. Un botón dispara el overlay; el contenido
 * (children) puede incluir formularios con Server Actions. Cierra con Escape, con la
 * «X» o al tocar fuera. Reusa el mismo backdrop que BotonConfirmar. Al enviar una
 * Server Action que redirige, la página navega y el modal se cierra solo.
 */
export default function Modal({ etiqueta, titulo, children, className = 'btn', icono, ancho = 480, tituloIcono }: {
  etiqueta: ReactNode;
  titulo: string;
  children: ReactNode;
  className?: string;
  icono?: string;        // ícono del botón que abre
  ancho?: number;        // ancho máximo del cuadro
  tituloIcono?: string;  // ícono junto al título del modal
}) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [abierto]);

  return (
    <>
      <button type="button" className={className} onClick={() => setAbierto(true)}>
        {icono && <Icono nombre={icono} size={16} />} {etiqueta}
      </button>
      {abierto && createPortal(
        <div className="confirm-backdrop" role="presentation" onClick={() => setAbierto(false)}>
          <div className="modal-caja" role="dialog" aria-modal="true" aria-label={titulo}
            onClick={(e) => e.stopPropagation()} style={{ maxWidth: ancho }}>
            <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 }}>
              <h3 className="fila" style={{ margin: 0, gap: 8 }}>{tituloIcono && <Icono nombre={tituloIcono} size={18} />}{titulo}</h3>
              <button type="button" className="btn" onClick={() => setAbierto(false)} aria-label="Cerrar" style={{ minHeight: 34, padding: '4px 10px' }}><Icono nombre="cerrar" size={16} /></button>
            </div>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
