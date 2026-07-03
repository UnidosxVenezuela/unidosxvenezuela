'use client';
import { useEffect, useState, type ReactNode } from 'react';

// Ayuda visual: consejos contextuales, amigables y DESACTIVABLES. Preferencia
// guardada en el navegador (localStorage); no requiere base de datos.
const KEY = 'uxv_consejos';        // '0' = desactivado (por defecto activado)
const PREFIJO = 'uxv_consejo_';    // marca de consejos cerrados individualmente
const EVT = 'uxv-consejos';

export function consejosActivos(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(KEY) !== '0';
}

/** Interruptor global de consejos (barra superior). Al activar, reaparecen todos. */
export function ToggleConsejos() {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(consejosActivos()); }, []);
  function toggle() {
    const next = !on;
    setOn(next);
    localStorage.setItem(KEY, next ? '1' : '0');
    if (next) { // reactivar: limpiar los cerrados individualmente
      Object.keys(localStorage).filter((k) => k.startsWith(PREFIJO)).forEach((k) => localStorage.removeItem(k));
    }
    window.dispatchEvent(new Event(EVT));
  }
  return (
    <button type="button" className="btn-consejos" onClick={toggle} aria-pressed={on}
      title={on ? 'Consejos activados — clic para ocultarlos' : 'Consejos desactivados — clic para mostrarlos'}>
      <span aria-hidden>💡</span> {on ? 'Consejos' : 'Consejos off'}
    </button>
  );
}

/** Tarjeta de consejo contextual. Se oculta si los consejos están desactivados o
 *  si el usuario cerró este consejo en particular. Diseño suave y amigable. */
export default function Consejo({ id, titulo, children }: { id: string; titulo?: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const rec = () => setVisible(consejosActivos() && localStorage.getItem(PREFIJO + id) !== '0');
    rec();
    window.addEventListener(EVT, rec);
    return () => window.removeEventListener(EVT, rec);
  }, [id]);
  if (!visible) return null;
  return (
    <div className="consejo" role="note">
      <span className="consejo-icono" aria-hidden>💡</span>
      <div className="consejo-cuerpo">
        {titulo && <strong>{titulo}</strong>}
        <div>{children}</div>
      </div>
      <button type="button" className="consejo-x" aria-label="Ocultar este consejo"
        onClick={() => { localStorage.setItem(PREFIJO + id, '0'); setVisible(false); }}>✕</button>
    </div>
  );
}
