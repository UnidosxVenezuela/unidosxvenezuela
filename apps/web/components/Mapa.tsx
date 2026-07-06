'use client';
import { useEffect, useRef } from 'react';
import maplibregl, {
  type Map as MapLibreMap, type Marker as MapLibreMarker, type StyleSpecification,
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

export default function Mapa({ puntos, tareas, lugares = [], solicitudes = [] }: { puntos: PuntoAcopio[]; tareas: TareaUbic[]; lugares?: LugarPunto[]; solicitudes?: SolicitudPunto[] }) {
  const cont = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (mapa.current || !cont.current) return;
    const centro: [number, number] = puntos[0] ? [puntos[0].lng, puntos[0].lat] : [-66.9, 10.48];
    const m = new maplibregl.Map({ container: cont.current, style: ESTILO, center: centro, zoom: 6 });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; };
  }, [puntos]);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const marcadores: MapLibreMarker[] = [];
    for (const p of puntos) {
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${esc(p.nombre)}</strong>` +
        (p.necesita ? `<br/><b>Necesita:</b> ${esc(p.necesita)}` : '') +
        (p.capacidad ? `<br/><b>Capacidad:</b> ${esc(p.capacidad)}` : '') +
        (p.recibe ? `<br/><b>Recibe:</b> ${esc(p.recibe)}` : '') +
        (p.responsable ? `<br/>${esc(p.responsable)}` : '') +
        (p.telefono ? ` · ${esc(p.telefono)}` : '') +
        (p.horario ? `<br/>${esc(p.horario)}` : '')
      );
      marcadores.push(new maplibregl.Marker({ color: colorAcopio(p.urgencia) }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(m));
    }
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
    return () => { marcadores.forEach((mk) => mk.remove()); };
  }, [puntos, tareas, lugares, solicitudes]);

  return <div ref={cont} style={{ height: 560, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--borde)' }} />;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
