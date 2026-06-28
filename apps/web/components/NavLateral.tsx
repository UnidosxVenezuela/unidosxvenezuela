'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icono from './Icono';

const ENLACES = [
  { href: '/dashboard', etiqueta: 'Panel', icono: 'panel' },
  { href: '/tareas', etiqueta: 'Tareas', icono: 'tareas' },
  { href: '/grupos', etiqueta: 'Grupos', icono: 'grupos' },
  { href: '/tablon', etiqueta: 'Tablón', icono: 'tablon' },
  { href: '/notificaciones', etiqueta: 'Avisos', icono: 'avisos' },
] as const;

export default function NavLateral({ coord }: { coord: boolean }) {
  const ruta = usePathname();
  const enlaces = coord
    ? [...ENLACES, { href: '/admin/usuarios', etiqueta: 'Administración', icono: 'admin' }]
    : ENLACES;

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
