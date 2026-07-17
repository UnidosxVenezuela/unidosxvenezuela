'use client';
import { useState } from 'react';
import Icono from '@/components/Icono';
import { ALCANCE_SI, ALCANCE_NO } from '@/lib/constantes';

/**
 * Filtro institucional de alcance (Paso 2). Antes de cargar, el reportante confirma que
 * la solicitud corresponde a la misión de la organización. Muestra la referencia de qué
 * SÍ y qué NO entra y EXIGE marcar la confirmación (el servidor la reexige en crearCaso).
 * Lo que queda fuera (dinero, vivienda, legal, diagnósticos/tratamientos, política…) se
 * orienta a un canal oficial: no se carga como caso interno.
 */
export default function BloqueAlcance() {
  const [ver, setVer] = useState(false);
  return (
    <div className="tarjeta" style={{ marginBottom: 12, background: 'var(--tinte-prim)', borderColor: 'var(--borde-f)' }}>
      <strong className="fila" style={{ gap: 6 }}><Icono nombre="filtro" size={15} /> ¿Está dentro de nuestro alcance?</strong>
      <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 6px' }}>
        La organización articula <strong>ayuda en especie y servicios</strong>. No gestiona dinero, vivienda, temas legales, diagnósticos/tratamientos ni asuntos políticos: esos se orientan a un canal oficial.
      </p>
      <button type="button" className="btn btn-sm" onClick={() => setVer((v) => !v)} style={{ marginBottom: ver ? 8 : 8 }}>
        {ver ? 'Ocultar' : 'Ver qué entra y qué no'}
      </button>
      {ver && (
        <div className="grid grid-2" style={{ gap: 8, fontSize: '.82rem', marginBottom: 8 }}>
          <div>
            <strong style={{ color: 'var(--ok-solido)' }}>✓ Sí entra</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{ALCANCE_SI.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div>
            <strong style={{ color: 'var(--critica)' }}>✕ No entra (se orienta)</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{ALCANCE_NO.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
      )}
      <label className="fila" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="checkbox" name="confirmo_alcance" required style={{ marginTop: 3 }} />
        <span style={{ fontSize: '.88rem' }}>Confirmo que esta solicitud está <strong>dentro del alcance</strong> (no es sobre dinero, vivienda, asuntos legales, diagnóstico/tratamiento médico, atención psicológica profesional ni política).</span>
      </label>
    </div>
  );
}
