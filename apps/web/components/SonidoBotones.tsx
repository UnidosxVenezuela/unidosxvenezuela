'use client';
import { useEffect } from 'react';
import { clic } from '@/lib/sonido';

/**
 * Reproduce un clic suave al presionar cualquier botón (button, .btn, .icono-btn).
 * Escucha en fase de captura para sonar aunque el botón navegue o detenga la
 * propagación. Montado una sola vez en el Shell.
 */
export default function SonidoBotones() {
  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      const obj = (e.target as HTMLElement | null)?.closest('button, .btn');
      if (!obj) return;
      if (obj instanceof HTMLButtonElement && obj.disabled) return;
      if (obj.getAttribute('aria-disabled') === 'true') return;
      clic();
    };
    document.addEventListener('click', alClic, true);
    return () => document.removeEventListener('click', alClic, true);
  }, []);
  return null;
}
