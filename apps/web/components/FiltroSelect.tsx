'use client';
import type { SelectHTMLAttributes } from 'react';

/**
 * Select de filtro que aplica al instante: al cambiar, envía su formulario (GET) sin
 * necesidad de pulsar «Filtrar». Se usa en listados como /casos.
 */
export default function FiltroSelect({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {children}
    </select>
  );
}
