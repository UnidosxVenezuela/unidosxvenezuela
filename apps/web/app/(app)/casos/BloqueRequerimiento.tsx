'use client';
import { useState } from 'react';
import { TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO, PRIORIDADES, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import SelectorUbicacionMapa from '@/components/SelectorUbicacionMapa';
import Icono from '@/components/Icono';

type Defaults = {
  es_requerimiento?: boolean;
  lat?: number | null;
  lng?: number | null;
  req_tipo?: string | null;
  req_cantidad?: string | null;
  req_urgencia?: string | null;
};

/**
 * Bloque «Solicitud de ayuda con ubicación» (Propuesta Fase 1). Si se activa, el
 * caso se marca como requerimiento accionable, se ubica en el mapa (con un pin, sin
 * escribir coordenadas) y se captura tipo/cantidad/urgencia para poder derivarlo a
 * Logística en la Fase 2. No aplica a «Desaparecidos» (el padre no lo muestra ahí).
 */
export default function BloqueRequerimiento({ defaults = {} }: { defaults?: Defaults }) {
  const [activo, setActivo] = useState(!!defaults.es_requerimiento);
  return (
    <div className="tarjeta" style={{ background: '#f0fdfa', borderColor: '#99f6e4', marginBottom: 12 }}>
      <label className="fila" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" name="es_requerimiento" checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <strong className="fila" style={{ gap: 6 }}><Icono nombre="ubicacion" size={15} /> Es una solicitud de ayuda con ubicación</strong>
          <span className="muted" style={{ display: 'block', fontSize: '.82rem' }}>
            Un requerimiento con lugar (hospital sin insumos, refugio sin agua…). Se marcará en el mapa para coordinar la respuesta.
          </span>
        </span>
      </label>

      {activo && (
        <div style={{ marginTop: 10 }}>
          <SelectorUbicacionMapa latInicial={defaults.lat ?? null} lngInicial={defaults.lng ?? null} />
          <div className="grid grid-2" style={{ marginTop: 10 }}>
            <div className="campo">
              <label htmlFor="req_tipo">Tipo de insumo</label>
              <select id="req_tipo" name="req_tipo" className="input" defaultValue={defaults.req_tipo ?? ''}>
                <option value="">Sin especificar</option>
                {TIPOS_INSUMO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_INSUMO[t]}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="req_urgencia">Urgencia</label>
              <select id="req_urgencia" name="req_urgencia" className="input" defaultValue={defaults.req_urgencia ?? 'media'}>
                {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
              </select>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="req_cantidad">Cantidad estimada (opcional)</label>
            <input id="req_cantidad" name="req_cantidad" className="input" placeholder="Ej.: 50 cajas de agua · 200 raciones" defaultValue={defaults.req_cantidad ?? ''} />
          </div>
        </div>
      )}
    </div>
  );
}
