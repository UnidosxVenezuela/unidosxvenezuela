'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Botón submit que pide confirmación con un diálogo in-app (no el `window.confirm`
 * nativo) antes de enviar el formulario. Al confirmar, envía el formulario con
 * `requestSubmit` para disparar su Server Action. Cierra con Escape o al tocar
 * fuera. Mantiene la misma firma que antes (mensaje, children, className, ...props).
 */
export default function BotonConfirmar(
  { mensaje, children, className = 'btn', confirmar = 'Sí, continuar', cancelar = 'Cancelar', ...props }:
  { mensaje: string; children: ReactNode; confirmar?: string; cancelar?: string } & ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const [abierto, setAbierto] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  function confirmarYEnviar() {
    setAbierto(false);
    btnRef.current?.form?.requestSubmit(btnRef.current);
  }

  return (
    <>
      <button {...props} ref={btnRef} type="submit" className={className}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierto(true); }}>
        {children}
      </button>
      {abierto && createPortal(
        <div className="confirm-backdrop" role="presentation" onClick={() => setAbierto(false)}>
          <div className="confirm-caja" role="alertdialog" aria-modal="true" aria-label={mensaje}
            onClick={(e) => e.stopPropagation()}>
            <p className="confirm-msg">{mensaje}</p>
            <div className="confirm-acciones">
              <button type="button" className="btn" onClick={() => setAbierto(false)} autoFocus>{cancelar}</button>
              <button type="button" className="btn btn-primario" onClick={confirmarYEnviar}>{confirmar}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
