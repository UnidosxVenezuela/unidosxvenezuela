'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icono from '@/components/Icono';
import { validarArchivo, LIMITES_MB } from '@/lib/subida-tipos';
import { comprimirImagen, subirPut } from '@/lib/subida-directa';
import { firmarSubidaContenido, registrarAdjuntoR2, subirAdjuntoPieza } from './actions';

/**
 * Adjunta uno o varios entregables a la pieza. Con R2 (`r2On`) sube DIRECTO
 * navegador → R2 (imágenes optimizadas, video hasta 1 GB, documentos). Sin R2,
 * usa el flujo clásico por Server Action (bucket de Supabase, tope efectivo bajo).
 */
export default function SubirAdjuntos({ piezaId, volver, r2On }: {
  piezaId: string; volver: string; r2On: boolean;
}) {
  // Hooks SIEMPRE al tope (reglas de hooks), aunque el respaldo no los use.
  const input = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!r2On) {
    return (
      <form action={subirAdjuntoPieza} style={{ marginTop: 10 }}>
        <input type="hidden" name="pieza_id" value={piezaId} />
        <input type="hidden" name="volver" value={volver} />
        <input type="file" name="archivos" className="input" multiple />
        <button className="btn btn-primario" type="submit" style={{ marginTop: 8 }}>
          <Icono nombre="mas" size={16} /> Adjuntar archivo(s)
        </button>
      </form>
    );
  }

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null); setTrabajando(true);
    const total = Math.min(files.length, 10);
    let ok = 0; const fallos: string[] = [];
    for (let i = 0; i < total; i++) {
      const file = files[i]!;
      const val = validarArchivo(file);
      if (!val.ok) { fallos.push(`${file.name}: ${val.error}`); continue; }
      setEstado(`Subiendo ${i + 1}/${total}: ${file.name}…`);
      try {
        const { blob, mime } = val.tipo === 'imagen' ? await comprimirImagen(file) : { blob: file as Blob, mime: file.type };
        const firma = await firmarSubidaContenido({ piezaId, nombre: file.name, mime, size: blob.size, destino: 'adjunto' });
        if ('error' in firma) { fallos.push(`${file.name}: ${firma.error}`); continue; }
        await subirPut(firma.url, blob, mime);
        const reg = await registrarAdjuntoR2({ piezaId, key: firma.key, nombre: file.name, mime });
        if (reg.error) { fallos.push(`${file.name}: ${reg.error}`); continue; }
        ok++;
      } catch (err) {
        fallos.push(`${file.name}: ${(err as Error)?.message ?? 'error'}`);
      }
    }
    setTrabajando(false); setEstado(null);
    if (input.current) input.current.value = '';
    setError(fallos.length ? fallos.join(' · ') : null);
    if (ok > 0) router.refresh();
  }

  return (
    <div style={{ marginTop: 10 }}>
      <input ref={input} type="file" className="input" multiple onChange={elegir} disabled={trabajando} />
      <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
        Imágenes (hasta {LIMITES_MB.imagen} MB, se optimizan), video (hasta {Math.round(LIMITES_MB.video / 1024)} GB) o documentos (hasta {LIMITES_MB.documento} MB). Se suben directo al almacenamiento.
      </p>
      {estado && <p className="muted" style={{ fontSize: '.85rem', marginTop: 6 }}>{estado}</p>}
      {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}
