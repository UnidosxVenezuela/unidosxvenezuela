'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import InputContrasena from '@/components/InputContrasena';

type Fase =
  | { t: 'verificando' }
  | { t: 'listo' }
  | { t: 'invalido'; msg: string };

// Mensajes crudos de Supabase → algo entendible en español.
function traducir(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes('expired') || r.includes('invalid')) {
    return 'El enlace ya se usó o expiró. Pedí uno nuevo.';
  }
  return raw;
}

export default function ActualizarClavePage() {
  const router = useRouter();
  const sb = useRef<SupabaseClient | null>(null);
  const [fase, setFase] = useState<Fase>({ t: 'verificando' });
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  // El enlace del correo trae una sesión de recuperación (flujo PKCE → ?code=).
  // Hay que establecerla ANTES de poder cambiar la contraseña; si no, updateUser
  // falla con "Auth session missing!".
  useEffect(() => {
    const supabase = createClient({ detectSessionInUrl: false });
    sb.current = supabase;

    (async () => {
      // 1) Supabase devuelve errores en el fragmento (#error_description=...).
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errHash = hash.get('error_description') || hash.get('error');
      if (errHash) return setFase({ t: 'invalido', msg: traducir(errHash) });

      // 2) ¿Ya hay sesión activa? (p. ej. ya canjeada o sesión previa).
      const { data: s } = await supabase.auth.getSession();
      if (s.session) return setFase({ t: 'listo' });

      // 3) Canjear el código del enlace por una sesión de recuperación.
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) return setFase({ t: 'invalido', msg: traducir(error.message) });
        // Limpiar el ?code= de la barra de direcciones.
        window.history.replaceState({}, '', '/actualizar-clave');
        return setFase({ t: 'listo' });
      }

      // 4) Ni sesión ni código: enlace inválido o abierto en otro navegador.
      return setFase({
        t: 'invalido',
        msg: 'Enlace inválido o abierto en un navegador distinto al que lo pidió. Pedí uno nuevo.',
      });
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEstado(null);
    if (pass.length < 8) return setEstado({ tipo: 'error', msg: 'Mínimo 8 caracteres.' });
    if (pass !== pass2) return setEstado({ tipo: 'error', msg: 'Las contraseñas no coinciden.' });
    setCargando(true);
    const supabase = sb.current ?? createClient();
    const { error } = await supabase.auth.updateUser({ password: pass });
    setCargando(false);
    if (error) return setEstado({ tipo: 'error', msg: error.message });
    setEstado({ tipo: 'ok', msg: 'Contraseña actualizada. Redirigiendo…' });
    setTimeout(() => { router.push('/dashboard'); router.refresh(); }, 1200);
  }

  return (
    <main className="auth-pantalla">
      <div className="auth-caja">
        <div className="auth-marca"><span className="punto" /> Apoyo por Venezuela</div>
        <h1 style={{ textAlign: 'center' }}>Nueva contraseña</h1>

        {fase.t === 'verificando' && (
          <div className="tarjeta"><p className="muted" style={{ margin: 0 }}>Verificando el enlace…</p></div>
        )}

        {fase.t === 'invalido' && (
          <div className="tarjeta">
            <p className="error" role="alert" style={{ marginTop: 0 }}>{fase.msg}</p>
            <Link className="btn btn-primario" href="/recuperar">Pedir un enlace nuevo</Link>
          </div>
        )}

        {fase.t === 'listo' && (
          <form onSubmit={onSubmit} className="tarjeta">
            <p className="muted" style={{ marginTop: 0 }}>Abriste este enlace desde tu correo. Definí tu nueva contraseña.</p>
            <div className="campo">
              <label htmlFor="pass">Nueva contraseña</label>
              <InputContrasena id="pass" autoComplete="new-password"
                minLength={8} value={pass} onChange={(e) => setPass(e.target.value)} required />
            </div>
            <div className="campo">
              <label htmlFor="pass2">Repetir contraseña</label>
              <InputContrasena id="pass2" autoComplete="new-password"
                minLength={8} value={pass2} onChange={(e) => setPass2(e.target.value)} required />
            </div>
            <button className="btn btn-primario" type="submit" disabled={cargando}>
              {cargando ? 'Guardando…' : 'Actualizar contraseña'}
            </button>
            {estado && <p className={estado.tipo === 'ok' ? 'exito' : 'error'} style={{ marginTop: 12 }}>{estado.msg}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
