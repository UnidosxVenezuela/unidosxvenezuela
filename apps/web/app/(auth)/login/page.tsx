'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { normalizarWhatsapp, emailInternoWhatsapp } from '@/lib/whatsapp';
import Captcha, { captchaActivo } from '@/components/Captcha';
import InputContrasena from '@/components/InputContrasena';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0); // remonta el widget para pedir token nuevo
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const onToken = useCallback((t: string | null) => setCaptchaToken(t), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (captchaActivo() && !captchaToken) return setError('Completa la verificación anti-bot.');
    // Se puede entrar con correo o con el número de WhatsApp (sin correo): en ese
    // caso el correo interno se deriva del número (mismo cálculo que al crearlo).
    const id = email.trim();
    const correo = id.includes('@')
      ? id.toLowerCase()
      : (() => { const d = normalizarWhatsapp(id); return d ? emailInternoWhatsapp(d) : ''; })();
    if (!correo) return setError('Escribe tu correo o tu número de WhatsApp con código de país.');
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: correo, password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    setCargando(false);
    if (error) {
      // El token de Turnstile es de un solo uso: tras fallar hay que pedir uno nuevo.
      setCaptchaToken(null);
      setCaptchaNonce((n) => n + 1);
      return setError(error.message);
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="auth-pantalla">
      <div className="auth-caja">
        <div className="auth-marca"><span className="punto" /> UnidosXVenezuela</div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>Coordinación de respuesta — Venezuela</p>
        <h1 style={{ textAlign: 'center' }}>Iniciar sesión</h1>
        <form onSubmit={onSubmit} className="tarjeta">
        <div className="campo">
          <label htmlFor="email">Correo o WhatsApp</label>
          <input id="email" className="input" type="text" autoComplete="username"
                 value={email} onChange={(e) => setEmail(e.target.value)} required
                 placeholder="correo@ejemplo.com  ·  o  +58 412…" />
        </div>
        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <InputContrasena id="password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Captcha key={captchaNonce} onToken={onToken} />
        <button className="btn btn-primario" type="submit" disabled={cargando}>
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
          {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        </form>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 4 }}><Link href="/recuperar">¿Olvidaste tu contraseña?</Link></p>
        <p className="muted" style={{ textAlign: 'center' }}>¿No tienes cuenta? <Link href="/registro">Crear cuenta</Link></p>
        <p className="muted" style={{ textAlign: 'center', fontSize: '.82rem', marginTop: 10 }}>
          <Link href="/legal/terminos">Términos</Link> · <Link href="/legal/privacidad">Privacidad</Link> · <Link href="/legal/descargo">Descargo</Link>
        </p>
      </div>
    </main>
  );
}
