'use client';
import { useRef } from 'react';

// Colores de marca + acentos para el confeti (rojo/azul/amarillo de Venezuela + verdes/rosa).
const COLORES = ['#0033A0', '#FFCE00', '#CF142B', '#0f8a55', '#a92d6e', '#0e7a6d'];

/**
 * Botón «Ver la celebración» que lanza una lluvia de confeti sobre la vitrina de
 * insignias. Puro CSS (una animación por pieza), así respeta `prefers-reduced-motion`
 * desde la hoja de estilos; el JS solo siembra las piezas y las retira al terminar.
 */
export default function CelebracionInsignias() {
  const capa = useRef<HTMLDivElement>(null);

  function celebrar() {
    const cont = capa.current;
    if (!cont) return;
    // Respeta a quien pidió menos movimiento: no animamos nada.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    cont.innerHTML = '';
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('span');
      p.className = 'confeti-pieza';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = COLORES[i % COLORES.length] ?? '#0033A0';
      p.style.setProperty('--dur', (1.6 + Math.random() * 1.4).toFixed(2) + 's');
      p.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
      p.style.setProperty('--dx', Math.round(Math.random() * 200 - 100) + 'px');
      p.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
      p.addEventListener('animationend', () => p.remove());
      cont.appendChild(p);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-acento" onClick={celebrar}>✨ Ver la celebración</button>
      <div ref={capa} className="confeti-capa" aria-hidden="true" />
    </>
  );
}
