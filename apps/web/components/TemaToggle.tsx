'use client';
import { useEffect, useState } from 'react';
import Icono from './Icono';

/**
 * Interruptor claro/oscuro de la barra superior. El tema vive en el atributo
 * `data-tema` de <html> (los tokens de globals.css reaccionan a él) y se
 * persiste en localStorage; el layout raíz lo re-aplica antes del primer
 * pintado para que no parpadee.
 */
export default function TemaToggle() {
  const [oscuro, setOscuro] = useState(false);

  // El servidor no conoce la preferencia: se lee al montar (el atributo ya lo
  // puso el script del layout, así que no hay salto visual, solo se sincroniza
  // el ícono del botón).
  useEffect(() => { setOscuro(document.documentElement.dataset.tema === 'oscuro'); }, []);

  const alternar = () => {
    const n = !oscuro;
    setOscuro(n);
    if (n) document.documentElement.dataset.tema = 'oscuro';
    else delete document.documentElement.dataset.tema;
    try { localStorage.setItem('uxv:tema', n ? 'oscuro' : 'claro'); } catch {}
  };

  return (
    <button
      type="button"
      className="icono-btn"
      onClick={alternar}
      aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={oscuro ? 'Tema claro' : 'Tema oscuro'}
    >
      <Icono nombre={oscuro ? 'sol' : 'luna'} size={19} />
    </button>
  );
}
