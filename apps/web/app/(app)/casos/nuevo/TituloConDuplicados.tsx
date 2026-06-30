'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Campo de título que, mientras escribís, busca casos ya registrados con título
 * parecido para evitar duplicados. La lectura respeta la RLS (verificación/recopilación).
 */
export default function TituloConDuplicados() {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<{ id: string; numero: number; titulo: string }[]>([]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 4) { setMatches([]); return; }
    const id = setTimeout(async () => {
      const supabase = createClient();
      const s = t.replace(/[%,()]/g, ' ');
      const { data } = await supabase.from('casos').select('id, numero, titulo').ilike('titulo', '%' + s + '%').limit(5);
      setMatches(data ?? []);
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="campo">
      <label htmlFor="titulo">Título</label>
      <input id="titulo" name="titulo" className="input" required value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {matches.length > 0 && (
        <div className="tarjeta" style={{ marginTop: 6, marginBottom: 0, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div className="muted" style={{ fontSize: '.82rem', marginBottom: 6, fontWeight: 600 }}>⚠ Posibles duplicados ya registrados:</div>
          {matches.map((m) => (
            <div key={m.id} style={{ fontSize: '.85rem' }}>
              <Link href={'/casos/' + m.id} target="_blank" rel="noopener noreferrer">#{String(m.numero).padStart(5, '0')} · {m.titulo}</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
