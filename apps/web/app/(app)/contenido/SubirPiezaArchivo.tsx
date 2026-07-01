'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { subirArchivoPieza } from './actions';
import Icono from '@/components/Icono';

/**
 * Sube el archivo final de la pieza al bucket público 'contenido'
 * (carpeta <pieza_id>) y guarda la URL en piezas_contenido. Para videos
 * pesados conviene usar el enlace; este es para gráficas/archivos hasta 25 MB.
 */
export default function SubirPiezaArchivo({ piezaId, urlActual, nombreActual }: {
  piezaId: string; urlActual?: string | null; nombreActual?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(urlActual ?? null);
  const [nombre, setNombre] = useState<string | null>(nombreActual ?? null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setError('El archivo no debe superar 25 MB. Para videos pesados, usa el enlace.'); return; }
    setError(null); setTrabajando(true);
    const fd = new FormData();
    fd.set('pieza_id', piezaId);
    fd.set('file', file);
    const res = await subirArchivoPieza(fd);   // sube con la service key
    if (res.error) { setError(res.error); setTrabajando(false); return; }
    setUrl(res.url ?? null); setNombre(res.nombre ?? file.name); setTrabajando(false); router.refresh();
  }

  async function quitar() {
    setTrabajando(true); setError(null);
    const supabase = createClient();
    const upd = await supabase.from('piezas_contenido').update({ adjunto_url: null, adjunto_nombre: null }).eq('id', piezaId);
    if (upd.error) { setError(upd.error.message); setTrabajando(false); return; }
    setUrl(null); setNombre(null); setTrabajando(false); router.refresh();
  }

  return (
    <div>
      {url && (
        <a className="adjunto-chip" href={url} target="_blank" rel="noopener noreferrer" style={{ marginBottom: 8 }}>
          <Icono nombre="documento" size={16} /> {nombre || 'Archivo'}
        </a>
      )}
      <input ref={input} type="file" onChange={elegir} style={{ display: 'none' }} />
      <div className="fila">
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={trabajando}>
          <Icono nombre="imagen" size={16} /> {trabajando ? 'Subiendo…' : (url ? 'Cambiar archivo' : 'Subir archivo')}
        </button>
        {url && <button type="button" className="btn" onClick={quitar} disabled={trabajando}>Quitar</button>}
      </div>
      <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>Imagen o documento, hasta 25 MB. Para videos pesados, usa el enlace.</p>
      {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}
