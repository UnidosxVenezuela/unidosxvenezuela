'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ETIQUETA_ESTADO_CASO } from '@/lib/constantes';
import { nombreMostrado } from '@/lib/nombre';

type Match = { id: string; numero: number; titulo: string; estado: string; creado_por: string | null; creador?: { nombre_completo: string | null } | null };

/**
 * Campo de título que, mientras escribes, busca casos ya registrados que se
 * parezcan (por palabras del título o por el MISMO enlace de fuente) para evitar
 * duplicados entre recopiladores. Muestra el estado y quién lo creó. RLS aplica.
 */
export default function TituloConDuplicados({ esAdmin = false }: { esAdmin?: boolean }) {
  const [q, setQ] = useState('');
  const [fuenteUrl, setFuenteUrl] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);

  // Escucha también el campo de enlace de la fuente (renderizado aparte).
  useEffect(() => {
    const el = document.getElementById('fuente_url') as HTMLInputElement | null;
    if (!el) return;
    const on = () => setFuenteUrl(el.value.trim());
    el.addEventListener('input', on);
    on();
    return () => el.removeEventListener('input', on);
  }, []);

  useEffect(() => {
    const t = q.trim();
    const url = fuenteUrl.trim();
    // Palabras significativas del título (>=4 letras), saneadas para el filtro.
    const palabras = Array.from(new Set(
      t.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/gi, ' ').split(/\s+/).filter((w) => w.length >= 4),
    )).slice(0, 6);
    if (palabras.length === 0 && url.length < 8) { setMatches([]); return; }

    const id = setTimeout(async () => {
      const supabase = createClient();
      const ors = palabras.map((w) => `titulo.ilike.%${w}%`);
      if (url && !url.includes(',')) ors.push(`fuente_url.eq.${url}`);
      if (ors.length === 0) { setMatches([]); return; }
      const { data } = await supabase
        .from('casos')
        .select('id, numero, titulo, estado, creado_por, creador:perfiles!creado_por(nombre_completo)')
        .or(ors.join(','))
        .limit(6);
      setMatches((data ?? []) as any);
    }, 350);
    return () => clearTimeout(id);
  }, [q, fuenteUrl]);

  return (
    <div className="campo">
      <label htmlFor="titulo">Título</label>
      <input id="titulo" name="titulo" className="input" required value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {matches.length > 0 && (
        <div className="tarjeta" style={{ marginTop: 6, marginBottom: 0, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div className="muted" style={{ fontSize: '.82rem', marginBottom: 6, fontWeight: 600 }}>⚠ Posibles duplicados ya registrados — revisa antes de crear:</div>
          {matches.map((m) => (
            <div key={m.id} style={{ fontSize: '.85rem', marginBottom: 3 }}>
              <Link href={'/casos/' + m.id} target="_blank" rel="noopener noreferrer">#{String(m.numero).padStart(5, '0')} · {m.titulo}</Link>
              <span className="muted"> — {ETIQUETA_ESTADO_CASO[m.estado as keyof typeof ETIQUETA_ESTADO_CASO] ?? m.estado}{m.creador?.nombre_completo ? ' · por ' + nombreMostrado(m.creador.nombre_completo, esAdmin) : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
