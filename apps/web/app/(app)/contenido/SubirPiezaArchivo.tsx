'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { subirArchivoPieza, firmarSubidaContenido, registrarArchivoPiezaR2 } from './actions';
import { validarArchivo, LIMITES_MB } from '@/lib/subida-tipos';
import { comprimirImagen, subirPut } from '@/lib/subida-directa';
import Icono from '@/components/Icono';

/**
 * Sube el entregable final de la pieza. Con R2 configurado (`r2On`) sube DIRECTO
 * navegador → R2 (presigned): imágenes hasta 15 MB (optimizadas), video hasta 1 GB.
 * Sin R2, cae al flujo por Supabase (Server Action, ~4.5 MB efectivos).
 */
export default function SubirPiezaArchivo({ piezaId, urlActual, nombreActual, r2On }: {
  piezaId: string; urlActual?: string | null; nombreActual?: string | null; r2On?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(urlActual ?? null);
  const [nombre, setNombre] = useState<string | null>(nombreActual ?? null);
  const [trabajando, setTrabajando] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (input.current) input.current.value = '';
    if (!file) return;
    setError(null);
    if (r2On) await subirDirecto(file);
    else await subirPorServidor(file);
  }

  // Subida directa a R2 (presigned): el archivo no pasa por el servidor.
  async function subirDirecto(file: File) {
    const val = validarArchivo(file);
    if (!val.ok) { setError(val.error); return; }
    setTrabajando(true); setPct(0);
    try {
      const { blob, mime } = val.tipo === 'imagen' ? await comprimirImagen(file) : { blob: file as Blob, mime: file.type };
      const firma = await firmarSubidaContenido({ piezaId, nombre: file.name, mime, size: blob.size, destino: 'final' });
      if ('error' in firma) { setError(firma.error); setTrabajando(false); setPct(null); return; }
      await subirPut(firma.url, blob, mime, setPct);
      const reg = await registrarArchivoPiezaR2({ piezaId, key: firma.key, nombre: file.name });
      if (reg.error) { setError(reg.error); setTrabajando(false); setPct(null); return; }
      setUrl(reg.url ?? firma.publicUrl); setNombre(reg.nombre ?? file.name);
      setTrabajando(false); setPct(null); router.refresh();
    } catch (err) {
      setError((err as Error)?.message ?? 'No se pudo subir.'); setTrabajando(false); setPct(null);
    }
  }

  // Respaldo: subida por Server Action (bucket de Supabase). Tope efectivo bajo.
  async function subirPorServidor(file: File) {
    if (file.size > 25 * 1024 * 1024) { setError('El archivo no debe superar 25 MB. Para videos pesados, usa el enlace.'); return; }
    setTrabajando(true);
    const fd = new FormData();
    fd.set('pieza_id', piezaId);
    fd.set('file', file);
    const res = await subirArchivoPieza(fd);
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

  const etiquetaBoton = trabajando
    ? (pct !== null ? `Subiendo… ${pct}%` : 'Subiendo…')
    : (url ? 'Cambiar archivo' : 'Subir archivo');

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
          <Icono nombre="imagen" size={16} /> {etiquetaBoton}
        </button>
        {url && <button type="button" className="btn" onClick={quitar} disabled={trabajando}>Quitar</button>}
      </div>
      <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
        {r2On
          ? `Imagen (hasta ${LIMITES_MB.imagen} MB, se optimiza), video (hasta ${Math.round(LIMITES_MB.video / 1024)} GB) o documento. Se sube directo al almacenamiento.`
          : 'Imagen o documento, hasta 25 MB. Para videos pesados, usa el enlace.'}
      </p>
      {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}
