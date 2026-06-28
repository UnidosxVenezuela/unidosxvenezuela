'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Icono from '@/components/Icono';

export default function SubirAdjunto({ tareaId }: { tareaId: string }) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSubiendo(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const path = `${tareaId}/${Date.now()}-${safe}`;

    const { error: upErr } = await supabase.storage.from('adjuntos').upload(path, file, { upsert: false });
    if (upErr) { setSubiendo(false); setError('No se pudo subir: ' + upErr.message); e.target.value = ''; return; }

    const tipo = file.type.startsWith('image/') ? 'imagen' : 'documento';
    const { error: rowErr } = await supabase.from('adjuntos_tarea').insert({
      tarea_id: tareaId, tipo, url: path, nombre: file.name, mime: file.type || null, creado_por: user?.id ?? null,
    });
    if (rowErr) {
      await supabase.storage.from('adjuntos').remove([path]); // rollback del objeto
      setSubiendo(false); setError('No se pudo registrar: ' + rowErr.message); e.target.value = ''; return;
    }
    setSubiendo(false);
    e.target.value = '';
    router.refresh();
  }

  return (
    <div>
      <label className="btn" style={{ cursor: 'pointer' }}>
        <Icono nombre="imagen" size={16} /> {subiendo ? 'Subiendo…' : 'Subir archivo'}
        <input type="file" hidden onChange={onChange} disabled={subiendo}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
      </label>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
