'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl, {
  type Map as MapLibreMap, type Marker as MapLibreMarker, type StyleSpecification,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PuntoAcopio } from '@unidos/types';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_PRIORIDAD } from '@/lib/constantes';

type TareaUbic = { id: string; titulo: string; lat: number; lng: number; categoria: string };
type LugarPunto = { id: string; tipo: string; nombre: string; lat: number; lng: number; estado: string; personas?: number };
type SolicitudPunto = { id: string; titulo: string; lat: number; lng: number; tipo: string | null; urgencia: string | null; estado: string };

const ETIQ_TIPO_LUGAR: Record<string, string> = { hospital: 'Hospital', albergue: 'Albergue', acopio: 'Centro de acopio', otro: 'Lugar' };
const ETIQ_ESTADO_LUGAR: Record<string, string> = { pendiente_llenado: 'Pendiente de llenado', pendiente_verificar: 'Pendiente de verificar', verificado: 'Verificado' };
function colorLugar(estado: string): string {
  return estado === 'verificado' ? '#7C3AED' : '#DB2777'; // morado verificado · rosa pendiente
}

const ESTILO: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function colorAcopio(u: string): string {
  if (u === 'alta') return '#CF142B';   // urgente
  if (u === 'baja') return '#0A7D2C';    // cubierto
  return '#E6A100';                      // necesita
}

// Peso de cada necesidad para la capa de calor, según la urgencia del requerimiento.
function pesoUrgencia(u: string | null): number {
  if (u === 'critica' || u === 'alta') return 1;
  if (u === 'baja') return 0.3;
  return 0.55; // media / sin especificar
}

// Camas libres de un albergue (capacidad − ocupadas). null si no aplica / sin datos.
function camasLibres(p: PuntoAcopio): number | null {
  if (p.camas_total == null) return null;
  return Math.max(0, (p.camas_total ?? 0) - (p.camas_ocupadas ?? 0));
}

function geojsonNecesidades(solicitudes: SolicitudPunto[]) {
  return {
    type: 'FeatureCollection' as const,
    features: solicitudes.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      properties: { peso: pesoUrgencia(s.urgencia) },
    })),
  };
}

export default function Mapa({ puntos, tareas, lugares = [], solicitudes = [] }: { puntos: PuntoAcopio[]; tareas: TareaUbic[]; lugares?: LugarPunto[]; solicitudes?: SolicitudPunto[] }) {
  const cont = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const [listo, setListo] = useState(false);       // el estilo ya cargó (para añadir capas)
  const [heat, setHeat] = useState(false);          // capa de calor de necesidades
  const [soloCupo, setSoloCupo] = useState(false);  // solo albergues con cupo

  // ── Init del mapa + capa de calor (una sola vez) ──
  useEffect(() => {
    if (mapa.current || !cont.current) return;
    const centro: [number, number] = puntos[0] ? [puntos[0].lng, puntos[0].lat] : [-66.9, 10.48];
    const m = new maplibregl.Map({ container: cont.current, style: ESTILO, center: centro, zoom: 6 });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapa.current = m;
    m.on('load', () => {
      // La fuente arranca vacía; el efecto de setData la llena con las solicitudes actuales.
      m.addSource('necesidades', { type: 'geojson', data: geojsonNecesidades([]) });
      m.addLayer({
        id: 'necesidades-heat',
        type: 'heatmap',
        source: 'necesidades',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['coalesce', ['get', 'peso'], 0.5],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 2.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 18, 12, 40],
          'heatmap-opacity': 0.8,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(13,148,136,0)',
            0.25, 'rgba(13,148,136,0.5)',
            0.5, 'rgba(230,161,0,0.65)',
            0.75, 'rgba(207,20,43,0.8)',
            1, 'rgba(139,0,20,0.9)'],
        },
      });
      setListo(true);
    });
    return () => { m.remove(); mapa.current = null; setListo(false); };
  }, [puntos]);

  // ── Datos de la capa de calor cuando cambian las solicitudes ──
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const src = m.getSource('necesidades') as GeoJSONSource | undefined;
    src?.setData(geojsonNecesidades(solicitudes));
  }, [solicitudes, listo]);

  // ── Mostrar/ocultar la capa de calor ──
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    m.setLayoutProperty('necesidades-heat', 'visibility', heat ? 'visible' : 'none');
  }, [heat, listo]);

  // ── Marcadores (se rehacen al filtrar por «albergues con cupo») ──
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const marcadores: MapLibreMarker[] = [];
    // Filtro «solo albergues con cupo»: deja únicamente albergues con camas libres > 0.
    const puntosVisibles = soloCupo
      ? puntos.filter((p) => p.tipo === 'albergue' && (camasLibres(p) ?? 0) > 0)
      : puntos;
    for (const p of puntosVisibles) {
      const libres = camasLibres(p);
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${esc(p.nombre)}</strong>` +
        (p.tipo ? `<br/>${esc(ETIQ_TIPO_LUGAR[p.tipo] ?? p.tipo)}${p.temporal ? ' · Temporal' : ''}` : '') +
        (p.tipo === 'albergue' && libres != null ? `<br/><b>Cupo:</b> ${libres} cama${libres === 1 ? '' : 's'} libre${libres === 1 ? '' : 's'} (${p.camas_ocupadas ?? 0}/${p.camas_total ?? 0})` : '') +
        (p.necesita ? `<br/><b>Necesita:</b> ${esc(p.necesita)}` : '') +
        (p.capacidad ? `<br/><b>Capacidad:</b> ${esc(p.capacidad)}` : '') +
        (p.recibe ? `<br/><b>Recibe:</b> ${esc(p.recibe)}` : '') +
        (p.responsable ? `<br/>${esc(p.responsable)}` : '') +
        (p.telefono ? ` · ${esc(p.telefono)}` : '') +
        (p.horario ? `<br/>${esc(p.horario)}` : '')
      );
      marcadores.push(new maplibregl.Marker({ color: colorAcopio(p.urgencia) }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(m));
    }
    // Con el filtro de cupo activo se ocultan las demás capas para no distraer.
    if (!soloCupo) {
      for (const t of tareas) {
        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(`<strong>${esc(t.titulo)}</strong><br/>Tarea · ${esc(t.categoria)}`);
        marcadores.push(new maplibregl.Marker({ color: '#0033A0' }).setLngLat([t.lng, t.lat]).setPopup(popup).addTo(m));
      }
      for (const l of lugares) {
        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
          `<strong>${esc(l.nombre)}</strong>` +
          `<br/>${esc(ETIQ_TIPO_LUGAR[l.tipo] ?? l.tipo)}` +
          (l.personas ? ` · ${l.personas} personas` : '') +
          `<br/><b>${esc(ETIQ_ESTADO_LUGAR[l.estado] ?? l.estado)}</b>`
        );
        marcadores.push(new maplibregl.Marker({ color: colorLugar(l.estado) }).setLngLat([l.lng, l.lat]).setPopup(popup).addTo(m));
      }
      for (const s of solicitudes) {
        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
          `<strong>${esc(s.titulo)}</strong><br/>Solicitud de ayuda` +
          (s.tipo ? `<br/><b>Necesita:</b> ${esc(ETIQUETA_TIPO_INSUMO[s.tipo] ?? s.tipo)}` : '') +
          (s.urgencia ? ` · ${esc(ETIQUETA_PRIORIDAD[s.urgencia as keyof typeof ETIQUETA_PRIORIDAD] ?? s.urgencia)}` : '')
        );
        marcadores.push(new maplibregl.Marker({ color: '#0D9488' }).setLngLat([s.lng, s.lat]).setPopup(popup).addTo(m));
      }
    }
    return () => { marcadores.forEach((mk) => mk.remove()); };
  }, [puntos, tareas, lugares, solicitudes, soloCupo]);

  const albergues = puntos.filter((p) => p.tipo === 'albergue');
  const conCupo = albergues.filter((p) => (camasLibres(p) ?? 0) > 0).length;

  return (
    <div>
      <div className="fila" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        <label className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 400, fontSize: '.9rem' }}>
          <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
          🔥 Capa de calor de necesidades
          {solicitudes.length > 0 && <span className="muted">({solicitudes.length})</span>}
        </label>
        <label className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 400, fontSize: '.9rem' }}>
          <input type="checkbox" checked={soloCupo} onChange={(e) => setSoloCupo(e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
          🛏️ Solo albergues con cupo
          <span className="muted">({conCupo}/{albergues.length})</span>
        </label>
      </div>
      <div ref={cont} style={{ height: 560, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--borde)' }} />
    </div>
  );
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
