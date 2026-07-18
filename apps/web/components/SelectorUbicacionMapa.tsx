'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl, {
  type Map as MapLibreMap, type Marker as MapLibreMarker, type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Icono from './Icono';

const ESTILO: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/**
 * Selector de ubicación en el mapa: la persona TOCA o ARRASTRA un pin, no escribe
 * coordenadas. Escribe lat/lng en inputs ocultos para que el Server Action las lea
 * del formulario. Mismo patrón que el picker de centros de acopio (CentrosAcopio).
 */
export default function SelectorUbicacionMapa({
  latInicial = null, lngInicial = null, nombreLat = 'lat', nombreLng = 'lng', alto = 320,
}: {
  latInicial?: number | null; lngInicial?: number | null;
  nombreLat?: string; nombreLng?: string; alto?: number;
}) {
  const cont = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const marcador = useRef<MapLibreMarker | null>(null);
  const [sel, setSel] = useState<{ lat: number; lng: number } | null>(
    latInicial != null && lngInicial != null ? { lat: latInicial, lng: lngInicial } : null,
  );
  const [busq, setBusq] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [avisoBusq, setAvisoBusq] = useState('');

  useEffect(() => {
    if (mapa.current || !cont.current) return;
    const inicial = latInicial != null && lngInicial != null ? { lat: latInicial, lng: lngInicial } : null;
    const m = new maplibregl.Map({
      container: cont.current, style: ESTILO,
      center: inicial ? [inicial.lng, inicial.lat] : [-66.9, 10.48],
      zoom: inicial ? 14 : 6,
    });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    const poner = (lng: number, lat: number, volar = false) => {
      const p = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
      setSel(p);
      if (!marcador.current) {
        marcador.current = new maplibregl.Marker({ color: '#0D9488', draggable: true }).setLngLat([lng, lat]).addTo(m);
        marcador.current.on('dragend', () => {
          const q = marcador.current!.getLngLat();
          setSel({ lat: +q.lat.toFixed(6), lng: +q.lng.toFixed(6) });
        });
      } else marcador.current.setLngLat([lng, lat]);
      if (volar) m.flyTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 14) });
    };
    m.on('click', (e) => poner(e.lngLat.lng, e.lngLat.lat));
    if (inicial) poner(inicial.lng, inicial.lat);
    m.once('load', () => m.resize());
    mapa.current = m;
    // Guarda el "poner" para el botón de geolocalización.
    (m as unknown as { _poner?: typeof poner })._poner = poner;
    return () => { m.remove(); mapa.current = null; marcador.current = null; };
    // Solo se monta una vez (el picker se renderiza recién al activarse el bloque).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function usarMiUbicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const m = mapa.current as unknown as { _poner?: (lng: number, lat: number, v?: boolean) => void } | null;
        m?._poner?.(pos.coords.longitude, pos.coords.latitude, true);
      },
      () => { /* permiso denegado: se marca a mano en el mapa */ },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  // Geocodificación: la persona ESCRIBE una dirección y el pin «viaja» a ese lugar
  // (además de poder tocar/arrastrar). Usa Nominatim (OpenStreetMap), sin clave, sesgado
  // a Venezuela. Es best-effort: si no encuentra o falla la red, se marca a mano.
  async function buscarDireccion() {
    const texto = busq.trim();
    if (!texto || buscando) return;
    setBuscando(true); setAvisoBusq('');
    try {
      const params = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 've', 'accept-language': 'es', q: texto });
      const res = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString());
      if (!res.ok) throw new Error('geo');
      const arr = await res.json();
      const primero = Array.isArray(arr) ? arr[0] : null;
      if (primero && primero.lat && primero.lon) {
        const m = mapa.current as unknown as { _poner?: (lng: number, lat: number, v?: boolean) => void } | null;
        m?._poner?.(parseFloat(primero.lon), parseFloat(primero.lat), true);
      } else {
        setAvisoBusq('No se encontró esa dirección. Prueba con menos detalle (ciudad, sector) o marca el pin a mano.');
      }
    } catch {
      setAvisoBusq('No se pudo buscar la dirección ahora. Marca el pin en el mapa.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div>
      <input type="hidden" name={nombreLat} value={sel ? sel.lat : ''} readOnly />
      <input type="hidden" name={nombreLng} value={sel ? sel.lng : ''} readOnly />
      {/* Buscar por dirección: escribe y el pin viaja a ese lugar (además de tocar/arrastrar). */}
      <div className="fila" style={{ gap: 6, marginBottom: 6 }}>
        <input className="input" style={{ flex: 1, minWidth: 0 }} value={busq}
          onChange={(e) => { setBusq(e.target.value); if (avisoBusq) setAvisoBusq(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarDireccion(); } }}
          placeholder="Buscar dirección (calle, sector, ciudad…)" aria-label="Buscar dirección para ubicar el pin" />
        <button type="button" className="btn" style={{ minHeight: 34, padding: '4px 12px', whiteSpace: 'nowrap' }}
          onClick={buscarDireccion} disabled={buscando}>
          <Icono nombre="buscar" size={14} /> {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      {avisoBusq && <p className="muted" style={{ fontSize: '.8rem', margin: '0 0 6px' }}>{avisoBusq}</p>}
      <div ref={cont} style={{ height: alto, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--borde)' }} />
      <div className="fila" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
          <Icono nombre="ubicacion" size={14} /> {sel ? 'Ubicación marcada. Arrastra el pin para ajustar.' : 'Busca la dirección arriba o toca el mapa donde se necesita la ayuda.'}
        </p>
        <button type="button" className="btn" style={{ minHeight: 34, padding: '4px 12px' }} onClick={usarMiUbicacion}>
          <Icono nombre="ubicacion" size={14} /> Usar mi ubicación
        </button>
      </div>
    </div>
  );
}
