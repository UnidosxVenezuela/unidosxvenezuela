'use client';
import { useState } from 'react';
import { analizarUrl } from '@/lib/validaciones';

// Campo de enlace con análisis en vivo: valida el formato y avisa de señales de
// riesgo (http, IP, acortador, dominio raro…). Bloquea esquemas peligrosos.
export default function AvisoEnlace({ name = 'fuente_url', defaultValue = '' }: { name?: string; defaultValue?: string }) {
  const [v, setV] = useState(defaultValue);
  const a = analizarUrl(v);
  const t = v.trim();
  const color = !a.ok ? 'var(--critica)' : a.nivel === 'aviso' ? '#b45309' : '#0A7D2C';
  return (
    <div>
      <input id={name} name={name} className="input" type="text" inputMode="url" placeholder="https://…"
        value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" />
      {t && (
        <p style={{ fontSize: '.78rem', margin: '4px 0 0', color }}>
          {!a.ok
            ? '⛔ ' + (a.motivo ?? 'Enlace no válido.')
            : a.nivel === 'aviso'
              ? '⚠ Enlace válido, pero revisa: ' + a.notas.join(' · ')
              : '✓ Enlace con formato correcto'}
        </p>
      )}
    </div>
  );
}
