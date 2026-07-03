'use client';
import { useEffect, useRef, useState } from 'react';
import Icono from '@/components/Icono';

// Recorte/rotación de la foto antes del OCR. Solo canvas del navegador, sin
// dependencias externas. El recorte enfoca el texto de la lista y la rotación
// endereza fotos tomadas de lado: ambas mejoran mucho el reconocimiento.

type Rect = { x: number; y: number; w: number; h: number }; // normalizado 0..1 sobre la imagen

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('no se pudo cargar la imagen'));
    img.src = url;
  });
}

function canvasABlob(canvas: HTMLCanvasElement, tipo: string): Promise<Blob> {
  return new Promise((resolver, rechazar) =>
    canvas.toBlob((b) => (b ? resolver(b) : rechazar(new Error('sin blob'))), tipo, 0.92),
  );
}

export default function EditorImagen({ file, onCambio }: { file: File; onCambio: (f: File) => void }) {
  const [url, setUrl] = useState('');
  const [modoRecorte, setModoRecorte] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const urlRef = useRef('');
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const tipoRef = useRef(file.type === 'image/png' ? 'image/png' : 'image/jpeg');
  const baseNombre = useRef((file.name || 'documento').replace(/\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i, ''));

  // Preview inicial a partir del archivo entrante (una sola vez: los cambios
  // posteriores se gestionan dentro del propio editor).
  useEffect(() => {
    const u = URL.createObjectURL(file);
    urlRef.current = u;
    setUrl(u);
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sustituye la imagen de trabajo por el contenido del canvas y avisa al padre.
  async function publicar(canvas: HTMLCanvasElement) {
    const tipo = tipoRef.current;
    const blob = await canvasABlob(canvas, tipo);
    const nuevoUrl = URL.createObjectURL(blob);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = nuevoUrl;
    setUrl(nuevoUrl);
    const nombre = baseNombre.current + (tipo === 'image/png' ? '.png' : '.jpg');
    onCambio(new File([blob], nombre, { type: tipo }));
  }

  async function rotar(dir: 1 | -1) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const img = await cargarImagen(urlRef.current);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((dir * Math.PI) / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      await publicar(canvas);
    } catch {
      /* si algo falla, la imagen actual se conserva */
    } finally {
      setOcupado(false);
    }
  }

  async function aplicarRecorte() {
    if (!rect || rect.w < 0.03 || rect.h < 0.03) { setModoRecorte(false); setRect(null); return; }
    setOcupado(true);
    try {
      const img = await cargarImagen(urlRef.current);
      const sx = Math.round(rect.x * img.naturalWidth);
      const sy = Math.round(rect.y * img.naturalHeight);
      const sw = Math.max(1, Math.round(rect.w * img.naturalWidth));
      const sh = Math.max(1, Math.round(rect.h * img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      await publicar(canvas);
      setModoRecorte(false);
      setRect(null);
    } catch {
      /* conserva la imagen actual */
    } finally {
      setOcupado(false);
    }
  }

  function puntoNormalizado(e: React.PointerEvent) {
    const el = imgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function alPresionar(e: React.PointerEvent) {
    if (!modoRecorte || ocupado) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = puntoNormalizado(e);
    inicio.current = p;
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function alMover(e: React.PointerEvent) {
    const s = inicio.current;
    if (!s) return;
    const p = puntoNormalizado(e);
    setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }

  function alSoltar() {
    inicio.current = null;
    setRect((r) => (r && (r.w < 0.03 || r.h < 0.03) ? null : r));
  }

  if (!url) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{ position: 'relative', display: 'inline-block', overflow: 'hidden', borderRadius: 8, maxWidth: '100%', lineHeight: 0, background: 'var(--fondo-2, #0000000a)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={url} alt="Vista previa de la lista" style={{ display: 'block', maxWidth: '100%', maxHeight: 320, userSelect: 'none' }} draggable={false} />
        {modoRecorte && (
          <div
            onPointerDown={alPresionar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
            style={{ position: 'absolute', inset: 0, cursor: 'crosshair', touchAction: 'none' }}
          >
            {rect && rect.w > 0 && rect.h > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,.45)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="fila" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!modoRecorte ? (
          <>
            <button type="button" className="btn" onClick={() => rotar(-1)} disabled={ocupado}>
              <Icono nombre="refrescar" size={15} /> Girar ←
            </button>
            <button type="button" className="btn" onClick={() => rotar(1)} disabled={ocupado}>
              <Icono nombre="refrescar" size={15} /> Girar →
            </button>
            <button type="button" className="btn" onClick={() => { setModoRecorte(true); setRect(null); }} disabled={ocupado}>
              <Icono nombre="filtro" size={15} /> Recortar
            </button>
          </>
        ) : (
          <>
            <span className="muted" style={{ fontSize: '.82rem' }}>Arrastra sobre la imagen para marcar el área con texto.</span>
            <button type="button" className="btn btn-primario" onClick={aplicarRecorte} disabled={ocupado || !rect || rect.w < 0.03 || rect.h < 0.03}>
              <Icono nombre="ok" size={15} /> Aplicar recorte
            </button>
            <button type="button" className="btn" onClick={() => { setModoRecorte(false); setRect(null); }} disabled={ocupado}>
              <Icono nombre="cerrar" size={15} /> Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
