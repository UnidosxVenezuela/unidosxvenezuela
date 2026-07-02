'use client';
// Wizard de segunda verificación: (1) consentimiento, (2) foto EN VIVO con la
// cámara (rostro + documento, sin salir de la app), (3) subir foto del documento
// y enviar. Si la cámara no está disponible, permite una foto de respaldo.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icono from '@/components/Icono';
import { enviarVerificacion } from './actions';

type Paso = 1 | 2 | 3;

export default function VerificacionWizard({ reenviar = false }: { reenviar?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(!reenviar);
  const [paso, setPaso] = useState<Paso>(1);
  const [consent, setConsent] = useState(false);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [selfieUrl, setSelfieUrl] = useState('');
  const [doc, setDoc] = useState<File | null>(null);
  const [docUrl, setDocUrl] = useState('');
  const [camaraOn, setCamaraOn] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const detenerCamara = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamaraOn(false);
  };

  const iniciarCamara = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      setCamaraOn(true);
    } catch {
      setError('No pudimos abrir la cámara. Permite el acceso en tu navegador, o usa “Tomar/elegir foto” abajo.');
    }
  };

  useEffect(() => {
    if (abierto && paso === 2 && !selfie) iniciarCamara();
    return () => { if (paso !== 2) detenerCamara(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, abierto]);
  useEffect(() => () => detenerCamara(), []);

  const guardarSelfie = (blob: Blob) => {
    if (selfieUrl) URL.revokeObjectURL(selfieUrl);
    setSelfie(blob);
    setSelfieUrl(URL.createObjectURL(blob));
    detenerCamara();
  };

  const capturar = () => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => { if (blob) guardarSelfie(blob); }, 'image/jpeg', 0.9);
  };

  const repetir = () => {
    if (selfieUrl) URL.revokeObjectURL(selfieUrl);
    setSelfie(null); setSelfieUrl('');
    iniciarCamara();
  };

  const selfieRespaldo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) guardarSelfie(f);
  };
  const elegirDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (docUrl) URL.revokeObjectURL(docUrl);
    setDoc(f); setDocUrl(f ? URL.createObjectURL(f) : '');
  };

  const enviar = async () => {
    if (!consent || !selfie || !doc) { setError('Completa los tres pasos antes de enviar.'); return; }
    setEnviando(true); setError('');
    try {
      const fd = new FormData();
      fd.append('consentimiento', 'true');
      fd.append('selfie', new File([selfie], 'selfie.jpg', { type: 'image/jpeg' }));
      fd.append('documento', doc, doc.name);
      const r = await enviarVerificacion(fd);
      if (r.ok) { router.refresh(); }
      else { setError(r.error); setEnviando(false); }
    } catch {
      setError('No se pudo enviar. Inténtalo de nuevo.'); setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <button className="btn" style={{ marginTop: 8 }} onClick={() => { setAbierto(true); setPaso(1); }}>
        <Icono nombre="refrescar" size={16} /> Volver a enviar la verificación
      </button>
    );
  }

  return (
    <div className="tarjeta" style={{ marginTop: 12 }}>
      <div className="fila" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={'pill ' + (paso === n ? 'pill-info' : paso > n ? 'pill-ok' : 'pill-neutra')} style={{ minWidth: 0 }}>
            {n}. {n === 1 ? 'Consentimiento' : n === 2 ? 'Foto en vivo' : 'Documento'}
          </span>
        ))}
      </div>

      {error && <div className="tarjeta" style={{ borderColor: '#fecaca', color: 'var(--critica)', padding: '8px 10px' }}>{error}</div>}

      {paso === 1 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Uso de tu información</h3>
          <p className="muted" style={{ fontSize: '.9rem' }}>
            Tu foto y tu documento se usan <strong>únicamente para verificar tu identidad</strong> dentro de
            Apoyo por Venezuela, con fines <strong>acordes al proyecto</strong>. No se comparten con terceros
            ni se usan para otros fines. Solo un administrador los revisa y se guardan de forma privada.
          </p>
          <label className="fila" style={{ gap: 8, fontWeight: 500, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 'auto', minHeight: 0, marginTop: 3 }} />
            <span>Acepto que mi foto y documento se usen para verificar mi identidad con fines del proyecto.</span>
          </label>
          <div className="fila" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primario" disabled={!consent} onClick={() => setPaso(2)}>Continuar</button>
          </div>
        </div>
      )}

      {paso === 2 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Foto en vivo: tu rostro + tu documento</h3>
          <p className="muted" style={{ fontSize: '.9rem' }}>
            Sostén tu documento de identidad junto a tu cara para que <strong>ambos se vean claramente</strong> y captura.
          </p>
          {!selfie ? (
            <>
              <video ref={videoRef} playsInline muted autoPlay
                style={{ width: '100%', maxWidth: 420, borderRadius: 10, background: '#000', display: 'block' }} />
              <div className="fila" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primario" onClick={capturar} disabled={!camaraOn}>
                  <Icono nombre="imagen" size={16} /> Capturar
                </button>
                <label className="btn" style={{ cursor: 'pointer' }}>
                  Tomar/elegir foto
                  <input type="file" accept="image/*" capture="user" hidden onChange={selfieRespaldo} />
                </label>
              </div>
            </>
          ) : (
            <>
              <img src={selfieUrl} alt="Foto en vivo" style={{ width: '100%', maxWidth: 420, borderRadius: 10, display: 'block' }} />
              <button className="btn" style={{ marginTop: 8 }} onClick={repetir}><Icono nombre="refrescar" size={16} /> Repetir</button>
            </>
          )}
          <div className="fila" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn" onClick={() => { detenerCamara(); setPaso(1); }}>Atrás</button>
            <button className="btn btn-primario" disabled={!selfie} onClick={() => { detenerCamara(); setPaso(3); }}>Continuar</button>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div>
          <h3 style={{ marginTop: 0 }}>Foto de tu documento</h3>
          <p className="muted" style={{ fontSize: '.9rem' }}>Sube una foto clara de tu documento de identidad (frente).</p>
          <input type="file" accept="image/*" className="input" onChange={elegirDoc} />
          {docUrl && <img src={docUrl} alt="Documento" style={{ width: '100%', maxWidth: 420, borderRadius: 10, marginTop: 10, display: 'block' }} />}
          <div className="fila" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn" onClick={() => setPaso(2)}>Atrás</button>
            <button className="btn btn-primario" disabled={!doc || enviando} onClick={enviar}>
              {enviando ? 'Enviando…' : 'Enviar verificación'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
