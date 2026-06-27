import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import CerrarSesion from '@/components/CerrarSesion';
import CampanaNotificaciones from '@/components/CampanaNotificaciones';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { perfil } = await requireUsuario();
  const coord = esCoordinacion(perfil?.rol);

  return (
    <div>
      <nav className="barra">
        <span className="marca">Unidos</span>
        <Link href="/dashboard">Panel</Link>
        <Link href="/tareas">Tareas</Link>
        <Link href="/grupos">Grupos</Link>
        <Link href="/tablon">Tablón</Link>
        <Link href="/mapa">Mapa</Link>
        {coord && <Link href="/admin/usuarios">Administración</Link>}
        <CampanaNotificaciones />
        <Link href="/perfil">{perfil?.nombre_completo || 'Mi perfil'}</Link>
        <CerrarSesion />
      </nav>
      <main className="contenedor">
        {perfil && !perfil.verificado && (
          <div className="tarjeta" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
            <strong>Cuenta pendiente de verificación.</strong>{' '}
            <span className="muted">
              La coordinación debe verificar tu identidad para darte acceso operativo completo.
            </span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
