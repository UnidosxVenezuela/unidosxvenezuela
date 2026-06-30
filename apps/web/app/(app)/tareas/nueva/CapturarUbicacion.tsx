'use client';
import { useState } from 'react';
import Icono from '@/components/Icono';

/** Ubicación opcional: texto libre y/o coordenadas GPS del dispositivo. */
export default function CapturarUbicacion() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'error'>('idle');

  function capturar() {
    if (!navigator.geolocation) { setEstado('error'); return; }
    setEstado('cargando');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
        setEstado('idle');
      },
      () => setEstado('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="campo">
      <label htmlFor="ubicacion">Ubicación (opcional)</label>
      <input id="ubicacion" name="ubicacion" className="input"
        placeholder="Escribe la dirección o referencia… (o usa GPS)" />
      <input type="hidden" name="lat" value={coords?.lat ?? ''} />
      <input type="hidden" name="lng" value={coords?.lng ?? ''} />
      <div className="fila" style={{ marginTop: 8 }}>
        <button type="button" className="btn" onClick={capturar} disabled={estado === 'cargando'}>
          <Icono nombre="ubicacion" size={16} /> {estado === 'cargando' ? 'Obteniendo…' : 'Usar mi ubicación (GPS)'}
        </button>
        {coords && <span className="insignia ok">📍 {coords.lat}, {coords.lng}</span>}
        {coords && <button type="button" className="btn" style={{ minHeight: 32, padding: '2px 10px' }} onClick={() => setCoords(null)}>Quitar GPS</button>}
      </div>
      {estado === 'error' && <p className="error" style={{ marginTop: 6 }}>No se pudo obtener el GPS. Puedes escribir la dirección.</p>}
    </div>
  );
}
