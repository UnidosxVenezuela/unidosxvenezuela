'use client';
import { useState } from 'react';
import { TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO, PRIORIDADES, ETIQUETA_PRIORIDAD, TIPOS_LUGAR, ETIQUETA_TIPO_LUGAR } from '@/lib/constantes';
import SelectorUbicacionMapa from '@/components/SelectorUbicacionMapa';
import LimiteError from '@/components/LimiteError';
import Icono from '@/components/Icono';

type Defaults = {
  es_requerimiento?: boolean;
  lat?: number | null;
  lng?: number | null;
  req_tipo?: string | null;
  req_cantidad?: string | null;
  req_urgencia?: string | null;
  personas_afectadas?: number | null;
  punto_tipo?: string | null;
  punto_temporal?: boolean;
};

/**
 * Bloque «Solicitud de ayuda con ubicación»: ubica el caso en el mapa (con un pin, sin
 * escribir coordenadas) y captura qué se necesita / cantidad / urgencia.
 *  · `fijo` (creación de casos): SIEMPRE activo, sin interruptor — todo caso es una
 *    solicitud con ubicación. Manda `es_requerimiento=on` por un campo oculto.
 *  · sin `fijo` (edición): interruptor opcional (por compatibilidad con casos previos).
 */
export default function BloqueRequerimiento({ defaults = {}, fijo = false }: { defaults?: Defaults; fijo?: boolean }) {
  const [activo, setActivo] = useState(!!defaults.es_requerimiento);
  const mostrar = fijo || activo;
  return (
    <div className="tarjeta" style={{ background: 'var(--t-teal-bg)', borderColor: 'var(--t-teal-fg)', marginBottom: 12 }}>
      {fijo ? (
        <>
          <input type="hidden" name="es_requerimiento" value="on" />
          <strong className="fila" style={{ gap: 6 }}><Icono nombre="ubicacion" size={15} /> ¿Dónde ocurre? — ubicación de la solicitud</strong>
          <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 0' }}>
            Marca el lugar en el mapa (toca o arrastra el pin). Ayuda mucho a coordinar la respuesta. Si el mapa no carga o aún no sabes el punto exacto, puedes continuar: la solicitud se registra igual y se podrá ubicar después.
          </p>
        </>
      ) : (
        <label className="fila" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" name="es_requerimiento" checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong className="fila" style={{ gap: 6 }}><Icono nombre="ubicacion" size={15} /> Es una solicitud de ayuda con ubicación</strong>
            <span className="muted" style={{ display: 'block', fontSize: '.82rem' }}>
              Un requerimiento con lugar (hospital sin insumos, refugio sin agua…). Se marcará en el mapa para coordinar la respuesta.
            </span>
          </span>
        </label>
      )}

      {mostrar && (
        <div style={{ marginTop: 10 }}>
          <LimiteError fallback={<p className="muted" style={{ fontSize: '.85rem' }}>El mapa no está disponible en este dispositivo (WebGL desactivado, p. ej. en Modo de bajo consumo). Puedes continuar; la ubicación en el mapa es opcional.</p>}>
            <SelectorUbicacionMapa latInicial={defaults.lat ?? null} lngInicial={defaults.lng ?? null} />
          </LimiteError>
          <div className="grid grid-2" style={{ marginTop: 10 }}>
            <div className="campo">
              <label htmlFor="req_tipo">¿Qué se necesita? (tipo)</label>
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
          <div className="grid grid-2">
            <div className="campo">
              <label htmlFor="req_cantidad">Cantidad estimada (opcional)</label>
              <input id="req_cantidad" name="req_cantidad" className="input" placeholder="Ej.: 50 cajas de agua · 200 raciones" defaultValue={defaults.req_cantidad ?? ''} />
            </div>
            <div className="campo">
              <label htmlFor="personas_afectadas" className="fila" style={{ gap: 6 }}>
                <Icono nombre="usuario" size={15} /> Personas afectadas (aprox.)
              </label>
              <input id="personas_afectadas" name="personas_afectadas" className="input" type="number" min={0} step={1}
                inputMode="numeric" placeholder="Ej.: 120" defaultValue={defaults.personas_afectadas ?? ''} />
              <p className="muted" style={{ fontSize: '.78rem', margin: '2px 0 0' }}>Cuántas personas necesitan esta ayuda. Ayuda a priorizar. Opcional.</p>
            </div>
          </div>

          {/* ¿Es un punto FIJO/TEMPORAL del mapa? Al verificarse la solicitud, se crea el centro (0145). */}
          <div className="tarjeta" style={{ background: '#fff', borderColor: '#c7d2fe', marginTop: 10 }}>
            <div className="campo" style={{ margin: 0 }}>
              <label htmlFor="punto_tipo" className="fila" style={{ gap: 6 }}>
                <Icono nombre="mapa" size={15} /> ¿Es un punto del mapa? (albergue, hospital, centro de acopio)
              </label>
              <select id="punto_tipo" name="punto_tipo" className="input" defaultValue={defaults.punto_tipo ?? ''}>
                <option value="">— No, es solo una solicitud —</option>
                {TIPOS_LUGAR.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_LUGAR[t]}</option>)}
              </select>
            </div>
            <label className="fila" style={{ gap: 8, marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" name="punto_temporal" defaultChecked={!!defaults.punto_temporal} />
              <span>Es un punto <b>temporal</b> (no permanente)</span>
            </label>
            <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
              Si eliges un tipo, al <b>verificarse</b> esta solicitud se creará automáticamente el punto en el mapa para que Logística lo gestione. Para eso, <b>marca también su ubicación</b> arriba; sin ubicación se guarda como solicitud normal.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
