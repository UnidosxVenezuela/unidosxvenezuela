import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import CerrarSesion from '@/components/CerrarSesion';
import CampanaNotificaciones from '@/components/CampanaNotificaciones';
import NavLateral from '@/components/NavLateral';

function iniciales(nombre?: string | null, email?: string | null) {
  const base = ((nombre || email || '?').trim()) || '?';
  const partes = base.split(/\s+/).filter(Boolean);
  const dos = ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
  return dos || base.charAt(0).toUpperCase();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await requireUsuario();
  const coord = esCoordinacion(perfil?.rol);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="tricolor" />
        <div className="marca"><span className="punto" /> Unidos</div>
        <NavLateral coord={coord} />
        <div className="sidebar-pie">
          <Link href="/perfil" className="sidebar-usuario">
            <span className="avatar">{iniciales(perfil?.nombre_completo, user?.email)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {perfil?.nombre_completo || user?.email}
            </span>
          </Link>
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <CampanaNotificaciones />
            <CerrarSesion />
          </div>
        </div>
      </aside>

      <div className="contenido">
        <main className="contenedor">
          {perfil && !perfil.verificado && (
            <div className="tarjeta" style={{ borderColor: 'var(--amarillo)', background: '#fffbeb' }}>
              <strong>Cuenta pendiente de verificación.</strong>{' '}
              <span className="muted">
                La coordinación debe verificar tu identidad para darte acceso operativo completo.
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
