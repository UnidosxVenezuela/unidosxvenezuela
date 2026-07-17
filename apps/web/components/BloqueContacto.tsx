'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Datos prioritarios de contacto de una solicitud (requerimiento Paso 3):
 *   • Referente — nombre de la persona o institución (obligatorio al crear).
 *   • Contacto útil: WhatsApp/teléfono y/o Instagram. Con UNO basta; el que falte
 *     NO se borra ni se oculta (ambos campos siempre visibles).
 *
 * Al crear (`exigir`), si no hay ningún contacto, se bloquea el envío y se remarca
 * qué falta. El servidor (crearCaso) reaplica la misma regla como fuente de verdad;
 * esta validación es solo para avisar al instante. En edición (`exigir=false`) no
 * bloquea, para no trabar la corrección de solicitudes viejas.
 */
export default function BloqueContacto(
  { defaults, exigir = true }:
  { defaults?: { referente?: string | null; rol?: string | null; whatsapp?: string | null; instagram?: string | null }; exigir?: boolean },
) {
  const waRef = useRef<HTMLInputElement>(null);
  const igRef = useRef<HTMLInputElement>(null);
  const cont = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!exigir) return;
    const form = cont.current?.closest('form');
    if (!form) return;
    const onSubmit = (e: Event) => {
      const wa = waRef.current?.value.trim() ?? '';
      const ig = igRef.current?.value.trim() ?? '';
      if (!wa && !ig) {
        e.preventDefault();
        e.stopPropagation();
        setError('Indica al menos un contacto: WhatsApp/teléfono o Instagram.');
        waRef.current?.focus();
      } else {
        setError('');
      }
    };
    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  }, [exigir]);

  const bordeError = error ? { borderColor: '#dc2626' } : undefined;

  return (
    <div ref={cont}>
      {/* Marca que este formulario trae el contacto estructurado (0171): editarCaso
          solo actualiza estos campos cuando está presente. */}
      <input type="hidden" name="_contacto_estructurado" value="1" />
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="referente">Referente — persona o institución{exigir ? ' *' : ''}</label>
          <input id="referente" name="referente" className="input" required={exigir} maxLength={160}
            defaultValue={defaults?.referente ?? ''} placeholder="¿De quién es la solicitud?" />
        </div>
        <div className="campo">
          <label htmlFor="referente_rol">Rol del referente</label>
          <input id="referente_rol" name="referente_rol" className="input" maxLength={80}
            defaultValue={defaults?.rol ?? ''} placeholder="Familiar, vecino, médico…" />
        </div>
      </div>
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="contacto_whatsapp">WhatsApp o teléfono</label>
          <input ref={waRef} id="contacto_whatsapp" name="contacto_whatsapp" className="input" inputMode="tel"
            maxLength={40} defaultValue={defaults?.whatsapp ?? ''} placeholder="+58 412 1234567"
            style={bordeError} onInput={() => error && setError('')} />
        </div>
        <div className="campo">
          <label htmlFor="contacto_instagram">Instagram</label>
          <input ref={igRef} id="contacto_instagram" name="contacto_instagram" className="input"
            maxLength={60} defaultValue={defaults?.instagram ?? ''} placeholder="@usuario"
            style={bordeError} onInput={() => error && setError('')} />
        </div>
      </div>
      {error
        ? <p style={{ color: '#dc2626', fontSize: '.82rem', margin: '2px 0 0', fontWeight: 500 }}>{error}</p>
        : <p className="muted" style={{ fontSize: '.8rem', margin: '2px 0 0' }}>
            {exigir
              ? 'Indica al menos un contacto: WhatsApp/teléfono o Instagram. Con uno basta; deja el otro vacío si no lo tienes.'
              : 'WhatsApp/teléfono o Instagram (con uno basta).'}
          </p>}
    </div>
  );
}
