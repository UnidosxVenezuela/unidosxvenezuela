'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RegistroPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({ nombre: '', telefono: '', organizacion: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [cargando, setCargando] = useState(false);

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          nombre_completo: form.nombre,
          telefono: form.telefono,
          organizacion: form.organizacion,
        },
      },
    });
    setCargando(false);
    if (error) return setError(error.message);
    setOk(true);
    // Si la confirmación por email está desactivada (dev), entra directo.
    router.push('/dashboard');
    router.refresh();
  }

  if (ok) {
    return (
      <main className="auth-pantalla">
        <div className="auth-caja">
          <div className="auth-marca"><span className="punto" /> UnidosXVenezuela</div>
          <div className="tarjeta">
            <h1>Cuenta creada</h1>
            <p>Revisa tu correo si la confirmación está activada. La coordinación verificará tu identidad antes de darte acceso operativo.</p>
            <Link className="btn btn-primario" href="/dashboard">Continuar</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-pantalla">
      <div className="auth-caja">
        <div className="auth-marca"><span className="punto" /> UnidosXVenezuela</div>
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
          <label htmlFor="email">Correo</label>
          <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <input id="password" className="input" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} required />
        </div>
        <button className="btn btn-primario" type="submit" disabled={cargando}>
          {cargando ? 'Creando…' : 'Crear cuenta'}
        </button>
          {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        </form>
        <p className="muted" style={{ textAlign: 'center' }}>¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link></p>
      </div>
    </main>
  );
}
