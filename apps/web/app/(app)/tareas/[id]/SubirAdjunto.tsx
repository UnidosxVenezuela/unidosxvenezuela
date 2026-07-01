'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { subirAdjuntoTarea } from '../actions';
import Icono from '@/components/Icono';

export default function SubirAdjunto({ tareaId, clase = 'material', etiqueta = 'Subir archivo' }: { tareaId: string; clase?: 'material' | 'entregable'; etiqueta?: string }) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSubiendo(true);
    const fd = new FormData();
    fd.set('tarea_id', tareaId);
    fd.set('clase', clase);
    fd.set('file', file);
    const res = await subirAdjuntoTarea(fd);   // sube con la service key
    setSubiendo(false);
    e.target.value = '';
    if (res.error) { setError(res.error); return; }
    router.refresh();
  }

  return (
    <div>
      <label className="btn" style={{ cursor: 'pointer' }}>
        <Icono nombre="imagen" size={16} /> {subiendo ? 'Subiendo…' : etiqueta}
        <input type="file" hidden onChange={onChange} disabled={subiendo}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
      </label>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
