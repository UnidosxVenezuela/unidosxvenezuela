'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mensajeAuth } from '@/lib/mensajes-auth';
import { MIN_CLAVE } from '@/lib/constantes';
import InputContrasena from '@/components/InputContrasena';

export default function CambiarContrasena() {
  const supabase = createClient();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEstado(null);
    if (pass.length < MIN_CLAVE) return setEstado({ tipo: 'error', msg: `Usa al menos ${MIN_CLAVE} caracteres.` });
    if (pass !== pass2) return setEstado({ tipo: 'error', msg: 'Las contraseñas no coinciden.' });
    setCargando(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setCargando(false);
    if (error) return setEstado({ tipo: 'error', msg: mensajeAuth(error.message) });
    setPass(''); setPass2('');
    setEstado({ tipo: 'ok', msg: 'Contraseña actualizada.' });
  }

  return (
    <form onSubmit={onSubmit} className="tarjeta">
      <h2 style={{ marginTop: 0 }}>Cambiar contraseña</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>Usa al menos {MIN_CLAVE} caracteres.</p>
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
  );
}
