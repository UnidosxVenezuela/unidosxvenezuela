'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Captcha, { captchaActivo } from '@/components/Captcha';

export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const onToken = useCallback((t: string | null) => setCaptchaToken(t), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (captchaActivo() && !captchaToken) return setError('Completa la verificación anti-bot.');
    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/actualizar-clave',
      captchaToken: captchaToken ?? undefined,
    });
    setCargando(false);
    if (error) {
      setCaptchaToken(null);
      setCaptchaNonce((n) => n + 1);
      return setError(error.message);
    }
    setEnviado(true);
  }

  return (
    <main className="auth-pantalla">
      <div className="auth-caja">
        <div className="auth-marca"><span className="punto" /> Apoyo por Venezuela</div>
        <h1 style={{ textAlign: 'center' }}>Recuperar contraseña</h1>
        {enviado ? (
          <div className="tarjeta">
            <p>Si el correo existe, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja (y spam).</p>
            <Link className="btn btn-primario" href="/login">Volver a iniciar sesión</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="tarjeta">
            <div className="campo">
              <label htmlFor="email">Correo</label>
              <input id="email" className="input" type="email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Captcha key={captchaNonce} onToken={onToken} />
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
