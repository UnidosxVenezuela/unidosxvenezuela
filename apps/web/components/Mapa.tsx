'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import maplibregl, {
  type Map as MapLibreMap, type Marker as MapLibreMarker, type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createClient } from '@/lib/supabase/client';
import type { PuntoAcopio } from '@unidos/types';

type TareaUbic = { id: string; titulo: string; lat: number; lng: number; categoria: string };

// Estilo raster con OpenStreetMap (sin API key). Para tráfico alto, cambiar a MapTiler/Stadia con key.
const ESTILO: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export default function Mapa({ puntos, tareas }: { puntos: PuntoAcopio[]; tareas: TareaUbic[] }) {
  const router = useRouter();
  const cont = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const marcadorNuevo = useRef<MapLibreMarker | null>(null);
  const [sel, setSel] = useState<{ lat: number; lng: number } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar el mapa una sola vez.
  useEffect(() => {
    if (mapa.current || !cont.current) return;
    const centro: [number, number] = puntos[0]
      ? [puntos[0].lng, puntos[0].lat]
      : [-66.9, 10.48]; // Caracas por defecto
    const m = new maplibregl.Map({ container: cont.current, style: ESTILO, center: centro, zoom: 6 });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.on('click', (e) => {
      const { lat, lng } = e.lngLat;
      setSel({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
      if (!marcadorNuevo.current) {
        marcadorNuevo.current = new maplibregl.Marker({ color: '#CF142B', draggable: true }).setLngLat([lng, lat]).addTo(m);
        marcadorNuevo.current.on('dragend', () => {
          const p = marcadorNuevo.current!.getLngLat();
          setSel({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
        });
      } else {
        marcadorNuevo.current.setLngLat([lng, lat]);
      }
    });
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; };
  }, [puntos]);

  // Pintar marcadores de puntos de acopio (azul) y tareas con ubicación (amarillo).
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const marcadores: MapLibreMarker[] = [];
    for (const p of puntos) {
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${esc(p.nombre)}</strong>` +
        (p.necesita ? `<br/><b>Necesita:</b> ${esc(p.necesita)}` : '') +
        (p.recibe ? `<br/><b>Recibe:</b> ${esc(p.recibe)}` : '') +
        (p.responsable ? `<br/>${esc(p.responsable)}` : '') +
        (p.telefono ? ` · ${esc(p.telefono)}` : '') +
        (p.horario ? `<br/>${esc(p.horario)}` : '')
      );
      marcadores.push(new maplibregl.Marker({ color: '#0033A0' }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(m));
    }
    for (const t of tareas) {
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${esc(t.titulo)}</strong><br/>Tarea · ${esc(t.categoria)}`
      );
      marcadores.push(new maplibregl.Marker({ color: '#FFCE00' }).setLngLat([t.lng, t.lat]).setPopup(popup).addTo(m));
    }
    return () => { marcadores.forEach((mk) => mk.remove()); };
  }, [puntos, tareas]);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!sel) { setError('Toca el mapa para marcar la ubicación del punto.'); return; }
    setGuardando(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from('puntos_acopio').insert({
      nombre: String(fd.get('nombre') || '').trim(),
      direccion: str(fd.get('direccion')),
      responsable: str(fd.get('responsable')),
      telefono: str(fd.get('telefono')),
      recibe: str(fd.get('recibe')),
      necesita: str(fd.get('necesita')),
      horario: str(fd.get('horario')),
      lat: sel.lat, lng: sel.lng,
      creado_por: user?.id ?? null,
    });
    setGuardando(false);
    if (error) { setError(error.message); return; }
    marcadorNuevo.current?.remove(); marcadorNuevo.current = null;
    setSel(null);
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <div className="mapa-grid">
      <div ref={cont} style={{ height: 520, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--borde)' }} />
      <form onSubmit={guardar} className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Registrar punto de acopio</h2>
        <p className="muted" style={{ fontSize: '.85rem' }}>
          {sel ? `Ubicación: ${sel.lat}, ${sel.lng}` : 'Toca el mapa para marcar la ubicación.'}
        </p>
        <div className="campo"><label>Nombre</label><input name="nombre" className="input" required /></div>
        <div className="campo"><label>Dirección</label><input name="direccion" className="input" /></div>
        <div className="campo"><label>Qué necesita ahora</label><input name="necesita" className="input" placeholder="agua, pañales…" /></div>
        <div className="campo"><label>Qué recibe</label><input name="recibe" className="input" /></div>
        <div className="campo"><label>Responsable</label><input name="responsable" className="input" /></div>
        <div className="campo"><label>Teléfono</label><input name="telefono" className="input" type="tel" /></div>
        <div className="campo"><label>Horario</label><input name="horario" className="input" placeholder="8:00–17:00" /></div>
        <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar punto'}</button>
        {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
      </form>
    </div>
  );
}

function str(v: FormDataEntryValue | null): string | null { const s = String(v ?? '').trim(); return s || null; }
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
