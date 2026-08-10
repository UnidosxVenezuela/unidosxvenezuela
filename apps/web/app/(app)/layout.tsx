import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { flagsDeNavegacion } from '@/lib/nav-flags';
import { createClient } from '@/lib/supabase/server';
import CerrarSesion from '@/components/CerrarSesion';
import RegistrarActividad from '@/components/RegistrarActividad';
import Shell from '@/components/Shell';
import Toast from '@/components/Toast';
import ClaveTemporalModal from '@/components/ClaveTemporalModal';
import AvisoColombia from '@/components/AvisoColombia';
import ChatFlotante from '@/components/ChatFlotante';
import CelebracionProveedor from '@/components/CelebracionProveedor';
import Icono from '@/components/Icono';
import { Suspense } from 'react';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await requireUsuario();
  const coord = esCoordinacion(perfil);
  const supabase = await createClient();
  const flags = await flagsDeNavegacion(supabase, user!.id, perfil);

  // Mensajes de conversación sin leer, para el acceso flotante (0233). Una función que
  // devuelve un entero, no la bandeja entera: esto se pinta en todas las pantallas.
  // Degrada a cero si la migración aún no está aplicada.
  const { data: sinLeerData } = await supabase.rpc('mis_hilos_sin_leer');
  const sinLeer = typeof sinLeerData === 'number' ? sinLeerData : 0;

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
      <Suspense fallback={null}><ClaveTemporalModal /></Suspense>
      {/* Apertura a Colombia (0230). Se muestra una vez por persona y se recuerda; va
          DESPUÉS del modal de clave temporal para no taparlo —esa contraseña no se
          vuelve a mostrar nunca y perderla sí tiene coste—. */}
      <AvisoColombia />
      {/* Celebración tras un hito (`?celebrar=`). Va DESPUÉS del <Toast/>: el
          toast dice el hecho y limpia la URL; esto pone el reconocimiento. */}
      <Suspense fallback={null}><CelebracionProveedor /></Suspense>
      <RegistrarActividad />
      <Shell
        usuario={{
          nombre: perfil?.nombre_completo || user?.email || '',
          rol: perfil?.rol,
          email: user?.email,
          avatarUrl: perfil?.avatar_url ?? null,
          estadoPresencia: (perfil as { estado_presencia?: string | null } | null)?.estado_presencia ?? 'conectado',
          telegramVinculado: !!(perfil as { telegram_chat_id?: string | null } | null)?.telegram_chat_id,
        }}
        nav={flags}
      >
        {children}
      </Shell>
      {/* Acceso flotante a las conversaciones. Va FUERA del <Shell> a propósito: es
          `position: fixed` y así no depende de que ningún contenedor de la maqueta
          tenga `transform`, que rompería el anclaje al viewport. */}
      <ChatFlotante sinLeerInicial={sinLeer} miId={user!.id} />
    </>
  );
}
