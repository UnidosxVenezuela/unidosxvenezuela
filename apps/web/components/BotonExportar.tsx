'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icono from '@/components/Icono';

/**
 * Botón «Exportar» que, ANTES de descargar, muestra una advertencia sobre el uso
 * correcto y la protección de la información, con una casilla de aceptación
 * obligatoria. Solo al aceptar se habilitan la descarga CSV y la versión
 * imprimible (PDF). La descarga queda REGISTRADA en el servidor (quién y cuándo).
 *
 * `csvHref` e `imprimirHref` ya traen los filtros activos del listado.
 */
export default function BotonExportar(
  { csvHref, imprimirHref, etiqueta = 'Exportar' }:
  { csvHref: string; imprimirHref: string; etiqueta?: string },
) {
  const [abierto, setAbierto] = useState(false);
  const [acepto, setAcepto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  function cerrar() { setAbierto(false); setAcepto(false); }

  function ir(href: string) {
    if (!acepto) return;
    cerrar();
    window.location.href = href;
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => setAbierto(true)}>
        <Icono nombre="documento" size={16} /> {etiqueta}
      </button>
      {abierto && createPortal(
        <div className="confirm-backdrop" role="presentation" onClick={cerrar}>
          <div className="confirm-caja" role="alertdialog" aria-modal="true" aria-label="Exportar información"
            onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 className="fila" style={{ gap: 8, marginTop: 0 }}>
              <Icono nombre="llave" size={20} /> Exportar información
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Vas a descargar información operativa que puede incluir <strong>datos de contacto y
              detalles sensibles</strong> de personas y solicitudes. Antes de continuar:
            </p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: '.9rem', lineHeight: 1.5 }}>
              <li><strong>Uso correcto:</strong> solo para la labor humanitaria de la organización.</li>
              <li><strong>Privacidad:</strong> no publiques ni compartas contactos ni evidencias sin autorización. La información sensible no se difunde.</li>
              <li><strong>Responsabilidad:</strong> quedas como responsable del resguardo del archivo descargado. Esta descarga <strong>queda registrada</strong> (quién y cuándo).</li>
            </ul>
            <label className="fila" style={{ gap: 8, alignItems: 'flex-start', fontWeight: 500, cursor: 'pointer', marginBottom: 14 }}>
              <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} style={{ width: 'auto', minHeight: 0, marginTop: 3 }} />
              <span>Entiendo y acepto el uso correcto, la protección de la privacidad y mi responsabilidad sobre esta información.</span>
            </label>
            <div className="fila" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
              <button type="button" className="btn" disabled={!acepto} onClick={() => ir(imprimirHref)}>
                <Icono nombre="documento" size={16} /> Versión imprimible (PDF)
              </button>
              <button type="button" className="btn btn-primario" disabled={!acepto} onClick={() => ir(csvHref)}>
                <Icono nombre="documento" size={16} /> Descargar CSV
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
