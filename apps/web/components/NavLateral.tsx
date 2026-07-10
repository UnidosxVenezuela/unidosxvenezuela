'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icono from './Icono';
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
    enlaces.push({ href: '/insumos', etiqueta: 'Insumos', icono: 'camion' });
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

  return (
    <nav className="nav-lateral" aria-label="Navegación principal">
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
