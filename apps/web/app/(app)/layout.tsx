import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { flagsDeNavegacion } from '@/lib/nav-flags';
import { createClient } from '@/lib/supabase/server';
import CerrarSesion from '@/components/CerrarSesion';
import RegistrarActividad from '@/components/RegistrarActividad';
import Shell from '@/components/Shell';
import Toast from '@/components/Toast';
import Icono from '@/components/Icono';
import { Suspense } from 'react';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await requireUsuario();
  const coord = esCoordinacion(perfil);
  const supabase = await createClient();
  const flags = await flagsDeNavegacion(supabase, user!.id, perfil);

  // Bloqueo total: una cuenta sin verificar (y que no sea coordinación) solo
  // ve una pantalla de espera, sin navegación ni contenido, hasta su aprobación.
  if (perfil && !perfil.verificado && !coord) {
    return (
      <main className="auth-pantalla">
        <div className="auth-caja" style={{ textAlign: 'center' }}>
          <div className="auth-marca"><span className="punto" /> Apoyo por Venezuela</div>
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
    <>
      <Suspense fallback={null}><Toast /></Suspense>
      <RegistrarActividad />
      <Shell
        usuario={{
          nombre: perfil?.nombre_completo || user?.email || '',
          rol: perfil?.rol,
          email: user?.email,
          avatarUrl: perfil?.avatar_url ?? null,
          estadoPresencia: (perfil as { estado_presencia?: string | null } | null)?.estado_presencia ?? 'conectado',
        }}
        nav={flags}
      >
        {children}
      </Shell>
    </>
  );
}
