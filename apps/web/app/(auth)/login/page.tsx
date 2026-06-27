'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) return setError(error.message);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="contenedor" style={{ maxWidth: 420 }}>
      <h1>Iniciar sesión</h1>
      <form onSubmit={onSubmit} className="tarjeta">
        <div className="campo">
          <label htmlFor="email">Correo</label>
          <input id="email" className="input" type="email" autoComplete="email"
                 value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <input id="password" className="input" type="password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primario" type="submit" disabled={cargando}>
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      </form>
      <p className="muted">¿No tienes cuenta? <Link href="/registro">Crear cuenta</Link></p>
    </main>
  );
}
