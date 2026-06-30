import Icono from './Icono';

export type TonoPill = 'ok' | 'aviso' | 'alta' | 'info' | 'critica' | 'neutra';

/** Mapea las clases de insignia existentes (claseEstado/clasePrioridad/…) a un tono de Pill. */
export function tonoDeClase(clase?: string | null): TonoPill {
  const c = (clase || '').trim();
  if (c === 'ok' || c === 'aviso' || c === 'alta' || c === 'critica' || c === 'info') return c;
  return 'neutra';
}

/** Pill de estado/etiqueta: fondo suave + texto saturado, con punto o ícono opcional. */
export default function Pill({ tono = 'neutra', punto = true, icono, children }: {
  tono?: TonoPill; punto?: boolean; icono?: string; children: React.ReactNode;
}) {
  return (
    <span className={'pill pill-' + tono}>
      {icono ? <Icono nombre={icono} size={13} /> : punto ? <span className="punto-est" /> : null}
      {children}
    </span>
  );
}
