'use client';
import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Botón de envío para `<form action={serverAction}>`: se deshabilita y muestra un
 * estado de carga mientras la acción está en curso. Evita el doble envío y da
 * feedback en conexiones lentas (útil en campo). Debe renderizarse DENTRO del form.
 */
export default function BotonEnviar(
  { children, cargando = 'Guardando…', className = 'btn btn-primario', disabled, ...rest }:
  { children: ReactNode; cargando?: string } & ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...rest} className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? cargando : children}
    </button>
  );
}
