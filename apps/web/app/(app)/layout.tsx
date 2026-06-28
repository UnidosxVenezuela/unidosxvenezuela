import Link from 'next/link';
import { requireUsuario, esCoordinacion, puedeVerAliados } from '@/lib/auth';
import CerrarSesion from '@/components/CerrarSesion';
import CampanaNotificaciones from '@/components/CampanaNotificaciones';
import NavLateral from '@/components/NavLateral';
import RegistrarActividad from '@/components/RegistrarActividad';
import Icono from '@/components/Icono';

function iniciales(nombre?: string | null, email?: string | null) {
  const base = ((nombre || email || '?').trim()) || '?';
  const partes = base.split(/\s+/).filter(Boolean);
  const dos = ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
  return dos || base.charAt(0).toUpperCase();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await requireUsuario();
  const coord = esCoordinacion(perfil?.rol);

  // Bloqueo total: una cuenta sin verificar (y que no sea coordinación) solo
  // ve una pantalla de espera, sin navegación ni contenido, hasta su aprobación.
  if (perfil && !perfil.verificado && !coord) {
    return (
      <main className="auth-pantalla">
        <div className="auth-caja" style={{ textAlign: 'center' }}>
          <div className="auth-marca"><span className="punto" /> UnidosXVenezuela</div>
          <div className="tarjeta">
            <Icono nombre="reloj" size={44} />
            <h1 style={{ marginTop: 8 }}>Cuenta pendiente de aprobación</h1>
            <p className="muted">
              Recibimos tu solicitud. Un administrador revisará tu cuenta y te dará
              acceso. Te avisaremos por correo cuando esté lista. Gracias por sumarte. 💛💙❤️
            </p>
            <CerrarSesion />
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <RegistrarActividad />
      <aside className="sidebar">
        <div className="tricolor" />
        <div className="marca"><span className="punto" /> UnidosXVenezuela</div>
        <NavLateral coord={coord} aliados={puedeVerAliados(perfil?.rol)} />
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
          {children}
        </main>
      </div>
    </div>
  );
}
