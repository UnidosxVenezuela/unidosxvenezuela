'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icono from '@/components/Icono';
import { fijarMensaje } from '../actions';

const MAX = 10 * 1024 * 1024; // 10 MB

export default function FijarAnuncio({ grupoId }: { grupoId: string }) {
  const router = useRouter();
  const [contenido, setContenido] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contenido.trim()) { setError('Escribe el anuncio.'); return; }
    if (file && file.size > MAX) { setError('El archivo supera 10 MB.'); return; }
    setEnviando(true);

    // El archivo se sube en el servidor con la service key (salta la RLS de Storage).
    const fd = new FormData();
    fd.set('grupo_id', grupoId);
    fd.set('contenido', contenido.trim());
    if (file) fd.set('file', file);

    try {
      await fijarMensaje(fd);
      setContenido(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      router.push('/grupos/' + grupoId + '?ok=' + encodeURIComponent('Anuncio fijado'));
    } catch (err: any) {
      setError('No se pudo fijar: ' + (err?.message ?? 'error'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <textarea className="input" rows={3} maxLength={2000} value={contenido}
        onChange={(e) => setContenido(e.target.value)}
        placeholder="Ej.: Reunión obligatoria mañana 9am. Adjunto el listado." />
      <label className="btn" style={{ cursor: 'pointer', width: '100%', justifyContent: 'center', marginTop: 8 }}>
        <Icono nombre={file ? 'documento' : 'imagen'} size={16} />
        {file ? (file.name.length > 22 ? file.name.slice(0, 22) + '…' : file.name) : 'Adjuntar imagen o archivo'}
        <input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
      </label>
      <button className="btn btn-primario" type="submit" disabled={enviando} style={{ width: '100%', marginTop: 8 }}>
        <Icono nombre="ok" size={16} /> {enviando ? 'Fijando…' : 'Fijar anuncio'}
      </button>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
    </form>
  );
}
