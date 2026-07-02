'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LEGAL_VERSION } from '@/lib/legal-version';
import Captcha, { captchaActivo } from '@/components/Captcha';
import InputContrasena from '@/components/InputContrasena';

export default function RegistroPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({ nombre: '', telefono: '', organizacion: '', motivo: '', email: '', password: '' });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [cargando, setCargando] = useState(false);

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  const onToken = useCallback((t: string | null) => setCaptchaToken(t), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (captchaActivo() && !captchaToken) return setError('Completa la verificación anti-bot.');
    if (!acepto) return setError('Debes aceptar los Términos, el Aviso de Privacidad y el Descargo para continuar.');
    setCargando(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        captchaToken: captchaToken ?? undefined,
        data: {
          nombre_completo: form.nombre,
          telefono: form.telefono,
          organizacion: form.organizacion,
          motivo: form.motivo,
          terminos_version: LEGAL_VERSION,
        },
      },
    });
    setCargando(false);
    if (error) {
      setCaptchaToken(null);
      setCaptchaNonce((n) => n + 1);
      return setError(error.message);
    }
    setOk(true);
    // Si la confirmación por email está desactivada (dev), entra directo.
    router.push('/dashboard');
    router.refresh();
  }

  if (ok) {
    return (
      <main className="auth-pantalla">
        <div className="auth-caja">
          <div className="auth-marca"><span className="punto" /> Apoyo por Venezuela</div>
          <div className="tarjeta">
            <h1>Cuenta creada</h1>
            <p>Tu cuenta queda <strong>pendiente de verificación</strong>: tendrás acceso limitado (podrás tomar tareas abiertas) hasta que la coordinación confirme tu identidad. Revisa tu correo si la confirmación está activada.</p>
            <Link className="btn btn-primario" href="/dashboard">Continuar</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-pantalla">
      <div className="auth-caja">
        <div className="auth-marca"><span className="punto" /> Apoyo por Venezuela</div>
        <h1 style={{ textAlign: 'center' }}>Crear cuenta</h1>
        <form onSubmit={onSubmit} className="tarjeta">
        <div className="campo">
          <label htmlFor="nombre">Nombre completo</label>
          <input id="nombre" className="input" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="telefono">Teléfono</label>
          <input id="telefono" className="input" type="tel" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="organizacion">Organización (opcional)</label>
          <input id="organizacion" className="input" value={form.organizacion} onChange={(e) => set('organizacion', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="motivo">¿Por qué quieres unirte? ¿Cómo te enteraste?</label>
          <textarea id="motivo" className="input" rows={3} maxLength={1000}
                    placeholder="Cuéntale a la coordinación quién eres y cómo puedes ayudar."
                    value={form.motivo} onChange={(e) => set('motivo', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="email">Correo</label>
          <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <InputContrasena id="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} required />
        </div>
        <Captcha key={captchaNonce} onToken={onToken} />
        <label className="fila" style={{ gap: 8, alignItems: 'flex-start', fontWeight: 500, margin: '4px 0 10px' }}>
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)}
                 style={{ width: 'auto', minHeight: 0, marginTop: 3 }} />
          <span className="muted" style={{ fontSize: '.9rem' }}>
            He leído y acepto los{' '}
            <Link href="/legal/terminos" target="_blank">Términos</Link>, el{' '}
            <Link href="/legal/privacidad" target="_blank">Aviso de Privacidad</Link> y el{' '}
            <Link href="/legal/descargo" target="_blank">Descargo de Responsabilidad</Link>.
          </span>
        </label>
        <button className="btn btn-primario" type="submit" disabled={cargando || !acepto}>
          {cargando ? 'Creando…' : 'Crear cuenta'}
        </button>
          {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        </form>
        <p className="muted" style={{ textAlign: 'center' }}>¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link></p>
      </div>
    </main>
  );
}
