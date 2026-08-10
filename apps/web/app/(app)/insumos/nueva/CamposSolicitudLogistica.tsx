'use client';
import { useState } from 'react';
import BloqueContacto from '@/components/BloqueContacto';
import BloqueUbicacion from '@/components/BloqueUbicacion';
import SelectorUbicacionMapa from '@/components/SelectorUbicacionMapa';
import LimiteError from '@/components/LimiteError';
import Icono from '@/components/Icono';
import DesgloseNuevo from './DesgloseNuevo';
import { PRIORIDADES, ETIQUETA_PRIORIDAD } from '@/lib/constantes';

/**
 * Campos del alta de Logística (0223). Espejo de `casos/nuevo/CamposCaso.tsx`: la
 * solicitud que levanta Logística tiene que ser TAN COMPLETA como la que reporta
 * Recopilación, así que reutiliza SUS MISMOS componentes —contacto estructurado (0171),
 * ubicación administrativa (0173) y el selector de mapa— en vez de clonarlos.
 *
 * Lo que NO se replica, y por qué:
 *  · el filtro de alcance (`BloqueAlcance`) es para quien reporta desde fuera; aquí el
 *    alta la firma el área, que ya trabaja dentro del alcance;
 *  · «¿es un punto del mapa?» (`punto_tipo`) crea centros al CONFIRMARSE el caso (0145),
 *    y este nace ya confirmado: se gestiona desde /acopio, no desde el alta;
 *  · la fuente es el propio levantamiento del área (la RPC la rellena sola si se deja
 *    en blanco), no una publicación externa que haya que verificar.
 *
 * En su lugar entra lo que Recopilación no tiene: el DESGLOSE POR ÍTEM desde el minuto
 * uno, que es lo que convierte la solicitud en algo medible y repartible.
 */
export default function CamposSolicitudLogistica({ puntos = [] }: { puntos?: { id: string; nombre: string }[] }) {
  // El país lo elige «Ubicación» y lo necesita el mapa, que es hermano suyo (0230).
  const [pais, setPais] = useState<'VE' | 'CO'>('VE');
  return (
    <>
      {/* Contacto y referente (0171) — mismas reglas que el alta de Recopilación. */}
      <BloqueContacto exigir />

      {/* Ubicación administrativa (0173) — al crear se exige al menos el Estado. */}
      <BloqueUbicacion exigir onPaisChange={setPais} />

      {/* Ubicación en el mapa. Opcional: sin pin la solicitud se registra igual y se
          podrá ubicar después (el mapa no carga en todos los equipos de campo). */}
      <div className="tarjeta" style={{ background: 'var(--t-teal-bg)', borderColor: 'var(--t-teal-fg)', marginBottom: 12 }}>
        <strong className="fila" style={{ gap: 6 }}><Icono nombre="ubicacion" size={15} /> ¿Dónde se necesita? — punto en el mapa</strong>
        <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 0' }}>
          Toca o arrastra el pin. Es lo que permite ver la solicitud en el mapa y sugerir los centros de acopio
          más cercanos. Si el mapa no carga, puedes continuar.
        </p>
        <div style={{ marginTop: 10 }}>
          <LimiteError fallback={<p className="muted" style={{ fontSize: '.85rem' }}>El mapa no está disponible en este dispositivo (WebGL desactivado). Puedes continuar: la ubicación en el mapa es opcional.</p>}>
            <SelectorUbicacionMapa pais={pais} />
          </LimiteError>
        </div>
        <div className="grid grid-2" style={{ marginTop: 10 }}>
          <div className="campo">
            <label htmlFor="urgencia">Urgencia</label>
            <select id="urgencia" name="urgencia" className="input" defaultValue="media">
              {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="personas_afectadas" className="fila" style={{ gap: 6 }}>
              <Icono nombre="usuario" size={15} /> Personas afectadas (aprox.)
            </label>
            <input id="personas_afectadas" name="personas_afectadas" className="input" type="number" min={0} step={1}
              inputMode="numeric" placeholder="Ej.: 120" />
            <p className="muted" style={{ fontSize: '.78rem', margin: '2px 0 0' }}>Cuántas personas necesitan esta ayuda. Ayuda a priorizar. Opcional.</p>
          </div>
        </div>
      </div>

      {/* Lo que hace medible la solicitud: el desglose por ítem (0218). */}
      <DesgloseNuevo />

      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="fuente">¿De dónde sale la solicitud?</label>
          <input id="fuente" name="fuente" className="input" maxLength={200}
            placeholder="Ej.: visita al ambulatorio · llamada del referente" />
          <p className="muted" style={{ fontSize: '.78rem', margin: '2px 0 0' }}>Si lo dejas vacío queda como «levantamiento del área».</p>
        </div>
        <div className="campo">
          <label htmlFor="punto_id">Centro de acopio que la cubrirá (opcional)</label>
          <select id="punto_id" name="punto_id" className="input" defaultValue="">
            <option value="">— Sin asignar todavía —</option>
            {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="campo">
        <label htmlFor="notas">Notas internas (opcional)</label>
        <textarea id="notas" name="notas" className="input" rows={2} maxLength={2000}
          placeholder="Contexto para el equipo: accesos, horarios, con quién coordinar…" />
      </div>
    </>
  );
}
