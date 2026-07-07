'use client';
import { useState } from 'react';
import { offsetPais, offsetVisitante, etiquetaOffset, horaActualEn, convertirHorario } from '@/lib/husos';
import { etiquetaPais } from '@/lib/constantes';

/**
 * Envuelve el nombre de un miembro: al pasar el mouse (o tocar) muestra su disponibilidad
 * horaria y su conversión a la zona de quien mira, para entender «cuándo está disponible»
 * desde cualquier parte del mundo. El desfase del miembro sale de su país; el de quien
 * mira, de su navegador. El contenido se calcula SOLO al abrir (interacción del cliente),
 * así que no hay desajuste de hidratación por la zona del servidor.
 */
export default function DisponibilidadHover({
  children, pais, disponibilidad,
}: { children: React.ReactNode; pais?: string | null; disponibilidad?: string | null }) {
  const [abierto, setAbierto] = useState(false);

  const memberOff = offsetPais(pais);
  const viewerOff = offsetVisitante();
  const shift = memberOff != null ? viewerOff - memberOff : null;
  const disp = (disponibilidad || '').trim();
  const convertido = disp && shift != null ? convertirHorario(disp, shift) : null;
  const dif = shift != null ? Math.round(Math.abs(shift) * 10) / 10 : null;

  return (
    <span
      className="disp-hover"
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
      onFocus={() => setAbierto(true)}
      onBlur={() => setAbierto(false)}
      onClick={() => setAbierto((v) => !v)}
      tabIndex={0}
      role="button"
      aria-label="Ver disponibilidad horaria"
    >
      {children}
      <span className="disp-reloj" aria-hidden>🕓</span>
      {abierto && (
        <span className="disp-tip" role="tooltip">
          <span className="disp-tip-t">Disponibilidad</span>
          <span className="disp-tip-l">{disp || 'Sin horario indicado'}</span>
          {convertido && <span className="disp-tip-c">En tu zona ≈ {convertido}</span>}
          {memberOff != null && (
            <span className="disp-tip-z">
              Su zona: {etiquetaPais(pais) || '—'} ({etiquetaOffset(memberOff)}) · ahora {horaActualEn(memberOff)}
            </span>
          )}
          <span className="disp-tip-z">
            Tu zona: {etiquetaOffset(viewerOff)} · ahora {horaActualEn(viewerOff)}
            {dif != null && dif > 0 ? ` · ${dif} h de diferencia` : dif === 0 ? ' · misma hora' : ''}
          </span>
        </span>
      )}
    </span>
  );
}
