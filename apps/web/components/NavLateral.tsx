'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icono from './Icono';
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
  if (flags.gestionCasos || flags.verificacion || flags.busqueda) {
    const icono = flags.verificacion ? 'ok' : flags.busqueda ? 'buscar' : 'documento';
    enlaces.push({ href: '/casos', etiqueta: 'Casos', icono });
  }
  if (flags.busqueda) enlaces.push({ href: '/coincidencias', etiqueta: 'Coincidencias', icono: 'enlace' });
  if (flags.envioRedaccion) enlaces.push({ href: '/envio-redaccion', etiqueta: 'Envío a Redacción', icono: 'cohete' });
  if (flags.psicosocial) enlaces.push({ href: '/psicosocial', etiqueta: 'Apoyo Psicosocial', icono: 'corazon' });
  if (flags.acopio || flags.digitalizacion) enlaces.push({ href: '/mapa', etiqueta: 'Mapa', icono: 'mapa' });
  if (flags.acopio) {
    enlaces.push({ href: '/acopio', etiqueta: 'Centros de acopio', icono: 'acopio' });
    enlaces.push({ href: '/insumos', etiqueta: 'Insumos', icono: 'camion' });
  }
  if (flags.digitalizacion) enlaces.push({ href: '/digitalizacion', etiqueta: 'Digitalización', icono: 'imagen' });
  if (flags.aliados) enlaces.push({ href: '/aliados', etiqueta: 'Datos aliados', icono: 'enlace' });
  if (flags.contenido) enlaces.push({ href: '/contenido', etiqueta: 'Contenido', icono: 'imagen' });
  if (flags.admin) {
    enlaces.push({ href: '/tablon', etiqueta: 'Tablón', icono: 'tablon' });
  }
  enlaces.push({ href: '/horas', etiqueta: 'Mis horas', icono: 'reloj' });
  enlaces.push({ href: '/notificaciones', etiqueta: 'Avisos', icono: 'avisos' });
  enlaces.push({ href: '/verificacion', etiqueta: 'Verificación', icono: 'llave' });
  if (flags.admin) {
    enlaces.push({ href: '/admin/usuarios', etiqueta: 'Administración', icono: 'admin' });
    enlaces.push({ href: '/admin/verificaciones', etiqueta: 'Verificaciones', icono: 'llave' });
    enlaces.push({ href: '/admin/logs', etiqueta: 'Registro de actividad', icono: 'historial' });
  }
  enlaces.push({ href: '/ayuda', etiqueta: 'Ayuda', icono: 'ayuda' });

  return (
    <nav className="nav-lateral">
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
