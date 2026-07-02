'use client';
// Escáner de código de barras/QR con la cámara (API nativa BarcodeDetector,
// disponible en Chrome/Android). Al leer, rellena #codigo y, si está vacío,
// #producto del formulario de alta. Si el navegador no lo soporta, no aparece.
import { useRef, useState } from 'react';
import Icono from '@/components/Icono';

export default function EscanearProducto() {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const soportado = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const detener = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setAbierto(false);
  };

  const escanear = async () => {
    setError(''); setAbierto(true);
    try {
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream; await v.play();
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(v);
          if (codes && codes.length) {
            const val = String(codes[0].rawValue ?? '');
            const codigo = document.getElementById('codigo') as HTMLInputElement | null;
            const producto = document.getElementById('producto') as HTMLInputElement | null;
            if (codigo) codigo.value = val;
            if (producto && !producto.value) producto.value = val;
            detener();
            return;
          }
        } catch { /* seguir intentando */ }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch {
      setError('No se pudo abrir la cámara.'); detener();
    }
  };

  if (!soportado) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      {!abierto ? (
        <button type="button" className="btn" onClick={escanear}><Icono nombre="buscar" size={16} /> Escanear código</button>
      ) : (
        <div className="tarjeta" style={{ padding: 8 }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', maxWidth: 320, borderRadius: 8, background: '#000', display: 'block' }} />
          <div className="fila" style={{ marginTop: 6, gap: 8 }}>
            <button type="button" className="btn" onClick={detener}>Cancelar</button>
            <span className="muted" style={{ fontSize: '.82rem' }}>Apunta al código de barras o QR…</span>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
