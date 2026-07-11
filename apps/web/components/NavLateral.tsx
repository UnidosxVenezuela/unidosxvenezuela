'use client';
import { useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { animate } from 'animejs';
import Icono from './Icono';
import { sinMovimiento } from '@/lib/anime';
import { ETIQUETA_AREA_ADMIN } from '@/lib/constantes';
import type { NavFlags } from '@/lib/nav-flags';

/**
 * Menú por función: cada quien ve SOLO sus herramientas (según su grupo/rol).
 * Base para todos: Panel, Grupos, Mis horas, Avisos y Ayuda. El admin ve todo.
 */
export default function NavLateral({ flags }: { flags: NavFlags }) {
  const ruta = usePathname();
  const enlaces: { href: string; etiqueta: string; icono: string }[] = [
    { href: '/dashboard', etiqueta: 'Panel', icono: 'panel' },
    { href: '/grupos', etiqueta: 'Grupos', icono: 'grupos' },
  ];
  // «Solicitudes» es la mesa de Recopilación/Verificación: toda información llega como
  // solicitud con ubicación. Los módulos de Búsqueda de personas y Digitalización se
  // retiraron del menú (la plataforma ya no hace esas labores); sus rutas/datos previos
  // siguen existiendo, solo no se enlazan aquí.
  if (flags.gestionCasos || flags.verificacion) {
    enlaces.push({ href: '/casos', etiqueta: 'Solicitudes', icono: flags.verificacion ? 'ok' : 'documento' });
  }
  if (flags.envioRedaccion) enlaces.push({ href: '/envio-redaccion', etiqueta: 'Envío a Redacción', icono: 'cohete' });
  if (flags.psicosocial) enlaces.push({ href: '/psicosocial', etiqueta: 'Apoyo Psicosocial', icono: 'corazon' });
  if (flags.acopio) enlaces.push({ href: '/mapa', etiqueta: 'Mapa', icono: 'mapa' });
  if (flags.acopio) {
    enlaces.push({ href: '/acopio', etiqueta: 'Centros de acopio', icono: 'acopio' });
    enlaces.push({ href: '/insumos', etiqueta: 'Donaciones e Insumos', icono: 'camion' });
  }
  // Oportunidades de donación (ofertas): Recopilación las capta sin ver toda la
  // sección de Logística. Quien ya tiene «Donaciones e Insumos» las alcanza desde
  // ahí (evita resaltar dos ítems por el prefijo /insumos compartido).
  if (!flags.acopio && flags.gestionCasos) {
    enlaces.push({ href: '/insumos/oportunidades', etiqueta: 'Oportunidades de donación', icono: 'corazon' });
  }
  if (flags.aliados) enlaces.push({ href: '/aliados', etiqueta: 'Datos aliados', icono: 'enlace' });
  if (flags.contenido) enlaces.push({ href: '/contenido', etiqueta: 'Contenido', icono: 'imagen' });
  if (flags.captacion) enlaces.push({ href: '/captacion', etiqueta: 'Captación', icono: 'enlace' });
  if (flags.admin) {
    enlaces.push({ href: '/tablon', etiqueta: 'Tablón', icono: 'tablon' });
  }
  enlaces.push({ href: '/horas', etiqueta: 'Mis horas', icono: 'reloj' });
  enlaces.push({ href: '/notificaciones', etiqueta: 'Avisos', icono: 'avisos' });
  enlaces.push({ href: '/verificacion', etiqueta: 'Verificación', icono: 'llave' });
  // Panel de administración: el admin de área ve SU sección acotada; las secciones
  // globales (verificaciones de identidad, registro de actividad, tablón) son solo
  // del admin general.
  if (flags.panelAdmin) {
    enlaces.push({
      href: '/admin/usuarios', icono: 'admin',
      etiqueta: flags.areaAdmin ? 'Admin · ' + ETIQUETA_AREA_ADMIN[flags.areaAdmin] : 'Administración',
    });
  }
  if (flags.admin) {
    enlaces.push({ href: '/admin/verificaciones', etiqueta: 'Verificaciones', icono: 'llave' });
    enlaces.push({ href: '/admin/logs', etiqueta: 'Registro de actividad', icono: 'historial' });
  }
  enlaces.push({ href: '/ayuda', etiqueta: 'Ayuda', icono: 'ayuda' });

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
