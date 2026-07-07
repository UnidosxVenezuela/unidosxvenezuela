'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';

/**
 * Muestra la contraseña temporal recién generada (al dar de alta o aprobar una cuenta) en
 * un modal PERSISTENTE con botón «Copiar», en vez de un toast que se cierra solo y hacía
 * perder la única copia. Lee ?clave=&clave_para= de la URL y los limpia enseguida para no
 * dejar la clave en la barra ni re-mostrarla al recargar. Se monta junto al <Toast/>.
 */
export default function ClaveTemporalModal() {
  const sp = useSearchParams();
  const [datos, setDatos] = useState<{ clave: string; para: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const clave = sp.get('clave');
    if (!clave) return;
    setDatos({ clave, para: sp.get('clave_para') || '' });
    // Quitar la clave de la URL de inmediato (sin recargar).
    const url = new URL(window.location.href);
    url.searchParams.delete('clave');
    url.searchParams.delete('clave_para');
    window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash);
  }, [sp]);

  if (!datos) return null;

  const copiar = async () => {
    try { await navigator.clipboard.writeText(datos.clave); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch {}
  };

  return createPortal(
    <div className="confirm-backdrop" role="presentation" onClick={() => setDatos(null)}>
      <div className="confirm-caja" role="dialog" aria-modal="true" aria-label="Contraseña temporal creada"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Cuenta creada ✅</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Comparte esta <strong>contraseña temporal</strong>{datos.para ? <> con <strong>{datos.para}</strong></> : null}. <strong>No se volverá a mostrar.</strong>
        </p>
        <div className="fila" style={{ gap: 8 }}>
          <input readOnly value={datos.clave} aria-label="Contraseña temporal" className="input"
            style={{ fontFamily: 'monospace', fontSize: '1.05rem', flex: 1, letterSpacing: '.5px' }}
            onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn btn-primario" onClick={copiar} style={{ flexShrink: 0 }}>
            {copiado ? 'Copiado ✓' : 'Copiar'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: '.82rem', marginBottom: 0 }}>La persona entra con su correo o WhatsApp y la cambia al ingresar.</p>
        <div className="confirm-acciones">
          <button type="button" className="btn btn-primario" onClick={() => setDatos(null)}>Ya la copié</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
