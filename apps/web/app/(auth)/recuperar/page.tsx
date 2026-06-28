'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/actualizar-clave',
    });
    setCargando(false);
    if (error) return setError(error.message);
    setEnviado(true);
  }

  return (
    <main className="auth-pantalla">
      <div className="auth-caja">
        <div className="auth-marca"><span className="punto" /> UnidosXVenezuela</div>
        <h1 style={{ textAlign: 'center' }}>Recuperar contraseña</h1>
        {enviado ? (
          <div className="tarjeta">
            <p>Si el correo existe, te enviamos un enlace para restablecer tu contraseña. Revisá tu bandeja (y spam).</p>
            <Link className="btn btn-primario" href="/login">Volver a iniciar sesión</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="tarjeta">
            <div className="campo">
              <label htmlFor="email">Correo</label>
              <input id="email" className="input" type="email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button className="btn btn-primario" type="submit" disabled={cargando}>
              {cargando ? 'Enviando…' : 'Enviar enlace'}
            </button>
            {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
          </form>
        )}
        <p className="muted" style={{ textAlign: 'center' }}><Link href="/login">Volver</Link></p>
      </div>
    </main>
  );
}
