'use client';
import type { ReactNode } from 'react';

/** Botón submit que pide confirmación antes de enviar el formulario. */
export default function BotonConfirmar(
  { mensaje, children, className = 'btn', ...props }:
  { mensaje: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button {...props} type="submit" className={className}
      onClick={(e) => { if (!window.confirm(mensaje)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
