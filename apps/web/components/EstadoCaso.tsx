import type { EstadoCaso as TEstadoCaso } from '@unidos/types';
import { ETIQUETA_ESTADO_CASO } from '@/lib/constantes';

const COLOR: Record<TEstadoCaso, { bg: string; fg: string }> = {
  en_proceso: { bg: '#fef9c3', fg: '#854d0e' },
  confirmado: { bg: '#d1fae5', fg: '#065f46' },
  falso: { bg: '#fee2e2', fg: '#b91c1c' },
};

/** Insignia de estado de caso (punto + color), estilo panel de verificación. */
export default function EstadoCaso({ estado }: { estado: TEstadoCaso }) {
  const c = COLOR[estado] ?? COLOR.en_proceso;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, background: c.bg, color: c.fg,
      fontWeight: 700, fontSize: '.8rem', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c.fg, display: 'inline-block' }} />
      {ETIQUETA_ESTADO_CASO[estado]}
    </span>
  );
}
