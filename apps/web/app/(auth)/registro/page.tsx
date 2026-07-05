'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LEGAL_VERSION } from '@/lib/legal-version';
import { mensajeAuth } from '@/lib/mensajes-auth';
import { esEmailInternoWhatsapp } from '@/lib/whatsapp';
import { AREAS_REGISTRO } from '@/lib/constantes';
import Captcha, { captchaActivo } from '@/components/Captcha';
import InputContrasena from '@/components/InputContrasena';
import EntradaTelefono from '@/components/EntradaTelefono';

export default function RegistroPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({ nombre: '', telefono: '', organizacion: '', motivo: '', email: '', password: '', area: '' });
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
    if (!form.area) return setError('Selecciona a qué área deseas postular.');
    const correo = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
      return setError('Escribe un correo válido (por ejemplo, nombre@correo.com).');
    if (esEmailInternoWhatsapp(correo))
      return setError('Usa tu correo personal. Si solo tienes WhatsApp, pídele a la coordinación que te cree la cuenta.');
    setCargando(true);
    const { data, error } = await supabase.auth.signUp({
      email: correo,
      password: form.password,
      options: {
        captchaToken: captchaToken ?? undefined,
        data: {
          nombre_completo: form.nombre,
          telefono: form.telefono,
          organizacion: form.organizacion,
          motivo: form.motivo,
          area_registro: form.area,
          terminos_version: LEGAL_VERSION,
        },
      },
    });
    setCargando(false);
    if (error) {
      setCaptchaToken(null);
      setCaptchaNonce((n) => n + 1);
      return setError(mensajeAuth(error.message));
    }
    // Con confirmación por correo activada, Supabase no da error si el correo ya
    // existe (para no revelar cuentas): lo detectamos por identities vacío.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setCaptchaToken(null);
      setCaptchaNonce((n) => n + 1);
      return setError('Ese correo ya está registrado. Inicia sesión o usa «¿Olvidaste tu contraseña?».');
    }
    setOk(true);
    // Solo entramos directo si Supabase abrió sesión (confirmación por correo
    // desactivada). Si la confirmación está activada NO hay sesión: nos quedamos
    // en la pantalla de «cuenta creada» para que la persona confirme su correo.
    if (data?.session) {
      router.push('/dashboard');
      router.refresh();
    }
  }

  if (ok) {
    return (
      <main className="auth-pantalla">
        <div className="auth-caja">
          <div className="auth-marca"><span className="punto" /> Apoyo por Venezuela</div>
          <div className="tarjeta">
            <h1>¡Cuenta creada! 💛💙❤️</h1>
            <p>Tu solicitud quedó <strong>pendiente de aprobación</strong>. Un administrador revisará tu cuenta y te dará acceso; te avisaremos por correo cuando esté lista.</p>
            <p className="muted" style={{ fontSize: '.9rem' }}>Si te pedimos confirmar tu correo, revisa tu bandeja de entrada (y la carpeta de spam) y toca el enlace de confirmación.</p>
            <Link className="btn btn-primario" href="/login">Ir a iniciar sesión</Link>
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
          <label htmlFor="telefono">WhatsApp / Teléfono</label>
          <EntradaTelefono name="telefono" onChange={(full) => set('telefono', full)} />
        </div>
        <div className="campo">
          <label htmlFor="area">¿A qué área deseas postular? *</label>
          <select id="area" className="input" value={form.area} onChange={(e) => set('area', e.target.value)} required>
            <option value="" disabled>Selecciona un área…</option>
            {AREAS_REGISTRO.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
          </select>
          {form.area && (
            <p className="muted" style={{ fontSize: '.85rem', margin: '4px 0 0' }}>
              {AREAS_REGISTRO.find((a) => a.valor === form.area)?.ayuda}
            </p>
          )}
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
