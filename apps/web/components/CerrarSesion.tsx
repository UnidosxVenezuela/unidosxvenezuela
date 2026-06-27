'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function CerrarSesion() {
  const router = useRouter();
  async function salir() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <button className="btn" onClick={salir} style={{ minHeight: 36, padding: '6px 12px' }}>
      Cerrar sesión
    </button>
  );
}
