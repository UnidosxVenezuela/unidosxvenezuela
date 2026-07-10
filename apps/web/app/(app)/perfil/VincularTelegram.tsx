'use client';
import { useState } from 'react';
import { crearEnlaceTelegram } from './actions';
import Icono from '@/components/Icono';

/**
 * Botón para vincular Telegram. Pide al servidor un enlace profundo de un solo
 * uso (`t.me/<bot>?start=<token>`, vence en 15 min) y lo muestra como botón
 * «Abrir Telegram». La persona lo abre, pulsa Start y el webhook del bot vincula
 * su chat. Al volver, refresca para ver el estado «Vinculado».
 */
export default function VincularTelegram() {
  const [url, setUrl] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generar() {
    setTrabajando(true); setError(null);
    const res = await crearEnlaceTelegram();
    setTrabajando(false);
    if (res.error) { setError(res.error); return; }
    setUrl(res.url ?? null);
  }

  if (url) {
    return (
      <div style={{ marginTop: 8 }}>
        <a className="btn btn-primario" href={url} target="_blank" rel="noopener noreferrer">
          <Icono nombre="enlace" size={16} /> Abrir Telegram
        </a>
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>
          Se abrirá Telegram: pulsa <strong>Iniciar / Start</strong> para terminar. El enlace vence
          en 15 minutos. Al volver, recarga esta página para ver el estado.
        </p>
        <button type="button" className="btn btn-sm" onClick={generar} disabled={trabajando}>
          {trabajando ? 'Generando…' : 'Generar otro enlace'}
        </button>
        {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="btn btn-primario" onClick={generar} disabled={trabajando}>
        <Icono nombre="enlace" size={16} /> {trabajando ? 'Generando…' : 'Vincular Telegram'}
      </button>
      {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}
