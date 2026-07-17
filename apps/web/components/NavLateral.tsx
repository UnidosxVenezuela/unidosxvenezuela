'use client';
import { useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { animate } from 'animejs';
import Icono from './Icono';
import { sinMovimiento } from '@/lib/anime';
import { destinosNav } from '@/lib/nav-destinos';
import type { NavFlags } from '@/lib/nav-flags';

/**
 * Menú por función: cada quien ve SOLO sus herramientas (según su grupo/rol).
 * Base para todos: Panel, Grupos, Mis horas, Avisos y Ayuda. El admin ve todo.
 */
export default function NavLateral({ flags }: { flags: NavFlags }) {
  const ruta = usePathname();
  // Los destinos por función viven en un solo lugar (compartidos con la paleta ⌘K).
  const enlaces = destinosNav(flags);

  const navRef = useRef<HTMLElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const iniciado = useRef(false);

  // La barra amarilla del ítem activo se desliza a su posición al cambiar de ruta
  // (instantánea la primera vez; sin movimiento si se pide reduced-motion). Sin JS,
  // el ítem activo conserva su fondo resaltado.
  useLayoutEffect(() => {
    const nav = navRef.current, ind = indRef.current;
    if (!nav || !ind) return;
    const activo = nav.querySelector<HTMLElement>('a.activo');
    if (!activo) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.height = activo.offsetHeight + 'px';
    const y = activo.offsetTop;
    if (!iniciado.current || sinMovimiento()) {
      ind.style.transform = `translateY(${y}px)`;
      iniciado.current = true;
    } else {
      animate(ind, { translateY: y, duration: 320, ease: 'outCubic' });
    }
  }, [ruta]);

  return (
    <nav ref={navRef} className="nav-lateral" aria-label="Navegación principal">
      <span ref={indRef} className="nav-indicador" aria-hidden="true" style={{ opacity: 0 }} />
      {enlaces.map((e) => {
        const activo = ruta === e.href || ruta.startsWith(e.href + '/');
        return (
          <Link key={e.href + e.etiqueta} href={e.href} className={activo ? 'activo' : undefined} aria-current={activo ? 'page' : undefined}>
            <Icono nombre={e.icono} />
            {e.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
