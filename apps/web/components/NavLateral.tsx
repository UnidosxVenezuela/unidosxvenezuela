'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icono from './Icono';

const ENLACES = [
  { href: '/dashboard', etiqueta: 'Panel', icono: 'panel' },
  { href: '/tareas', etiqueta: 'Tareas', icono: 'tareas' },
  { href: '/grupos', etiqueta: 'Grupos', icono: 'grupos' },
  { href: '/tablon', etiqueta: 'Tablón', icono: 'tablon' },
  { href: '/mapa', etiqueta: 'Mapa', icono: 'mapa' },
  { href: '/acopio', etiqueta: 'Centros de acopio', icono: 'acopio' },
  { href: '/insumos', etiqueta: 'Insumos', icono: 'camion' },
  { href: '/horas', etiqueta: 'Mis horas', icono: 'reloj' },
  { href: '/notificaciones', etiqueta: 'Avisos', icono: 'avisos' },
] as const;

export default function NavLateral({ coord, aliados, verificacion, contenido, espacios }: { coord: boolean; aliados?: boolean; verificacion?: boolean; contenido?: boolean; espacios?: boolean }) {
  const ruta = usePathname();
  let enlaces: { href: string; etiqueta: string; icono: string }[] = [...ENLACES];
  if (espacios) enlaces.push({ href: '/espacios', etiqueta: 'Espacios de trabajo', icono: 'pizarra' });
  if (aliados) enlaces.push({ href: '/aliados', etiqueta: 'Datos aliados', icono: 'enlace' });
  if (verificacion) enlaces.push({ href: '/casos', etiqueta: 'Verificación de casos', icono: 'ok' });
  if (contenido) enlaces.push({ href: '/contenido', etiqueta: 'Contenido', icono: 'documento' });
  if (coord) enlaces.push({ href: '/admin/usuarios', etiqueta: 'Administración', icono: 'admin' });
  if (coord) enlaces.push({ href: '/admin/logs', etiqueta: 'Registro de actividad', icono: 'historial' });
  enlaces.push({ href: '/ayuda', etiqueta: 'Ayuda', icono: 'ayuda' });

  return (
    <nav className="nav-lateral">
      {enlaces.map((e) => {
        const activo = ruta === e.href || ruta.startsWith(e.href + '/');
        return (
          <Link key={e.href} href={e.href} className={activo ? 'activo' : undefined}>
            <Icono nombre={e.icono} />
            {e.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
