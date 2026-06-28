'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  { href: '/dashboard', etiqueta: 'Panel' },
  { href: '/tareas', etiqueta: 'Tareas' },
  { href: '/grupos', etiqueta: 'Grupos' },
  { href: '/tablon', etiqueta: 'Tablón' },
  { href: '/notificaciones', etiqueta: 'Avisos' },
] as const;

export default function NavLateral({ coord }: { coord: boolean }) {
  const ruta = usePathname();
  const enlaces = coord
    ? [...ENLACES, { href: '/admin/usuarios', etiqueta: 'Administración' }]
    : ENLACES;

  return (
    <nav className="nav-lateral">
      {enlaces.map((e) => {
        const activo = ruta === e.href || ruta.startsWith(e.href + '/');
        return (
          <Link key={e.href} href={e.href} className={activo ? 'activo' : undefined}>
            {e.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
