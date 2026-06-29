'use client';
import { useState } from 'react';

/** Input de contraseña con botón "ojo" para mostrar/ocultar lo escrito. */
export default function InputContrasena({ className, style, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input {...props} type={ver ? 'text' : 'password'} className={className ?? 'input'}
        style={{ paddingRight: 42, ...style }} />
      <button type="button" onClick={() => setVer((v) => !v)}
        aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={ver ? 'Ocultar' : 'Mostrar'}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 0, padding: 4, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
        {ver ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
