'use client';
import { useEffect, useRef, useState } from 'react';
import Icono from './Icono';

/**
 * Menú de acciones por fila (botón "⋮" con popover). Cierra al hacer clic
 * afuera o con Escape. Acepta como hijos enlaces o formularios; al activarse
 * cualquiera de ellos el menú se cierra. Solo presentación: la autorización
 * sigue viviendo en la RLS y en las server actions.
 */
export default function MenuFila({ children, etiqueta = 'Acciones' }: { children: React.ReactNode; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // No cerrar si el clic ocurre dentro de un diálogo de confirmación (portal fuera
      // del menú): así un BotonConfirmar dentro del menú se resuelve sin desmontarse.
      if (ref.current && !ref.current.contains(t) && !t.closest?.('.confirm-backdrop')) setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [abierto]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={abierto} aria-label={etiqueta}
        onClick={() => setAbierto((v) => !v)} style={{ minHeight: 34, padding: '4px 8px' }}>
        <Icono nombre="puntos" size={18} />
      </button>
      {abierto && (
        <div role="menu" className="menu-fila" onClick={() => setAbierto(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
