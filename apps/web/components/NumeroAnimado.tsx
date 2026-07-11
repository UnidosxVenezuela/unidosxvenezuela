'use client';
import { useLayoutEffect, useRef } from 'react';
import { animate } from 'animejs';
import { sinMovimiento } from '@/lib/anime';

/**
 * Número que "cuenta" de 0 al valor al montar (para KPIs del panel). Da vida y
 * lleva el ojo a la métrica sin ser gratuito: dura poco y arranca rápido
 * (ease-out). El SSR pinta el valor final, así que sin JS o con `reduced-motion`
 * se ve el número correcto de inmediato (nunca engaña con un número a medias).
 */
export default function NumeroAnimado({ valor, duracion = 750 }: { valor: number; duracion?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Sin movimiento o nada que contar → mostrar el valor final directo.
    if (sinMovimiento() || valor === 0) { el.textContent = String(valor); return; }
    const obj = { v: 0 };
    el.textContent = '0'; // fija el inicio antes de pintar (evita parpadeo del valor final)
    const a = animate(obj, {
      v: valor,
      duration: duracion,
      ease: 'outCubic', // arranca rápido: sensación de velocidad
      onUpdate: () => { el.textContent = String(Math.round(obj.v)); },
      onComplete: () => { el.textContent = String(valor); }, // exactitud al cerrar
    });
    return () => { a.revert(); el.textContent = String(valor); };
  }, [valor, duracion]);

  return <span ref={ref}>{valor}</span>;
}
