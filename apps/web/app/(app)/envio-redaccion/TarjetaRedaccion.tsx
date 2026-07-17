import Link from 'next/link';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_CANAL_DIFUSION } from '@/lib/constantes';
import { pasoRedaccion } from '@/lib/flujo';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import FlujoProgreso from '@/components/FlujoProgreso';

/** Tarjeta compacta de una solicitud en «Envío a Redacción» (columna del tablero o
 *  ítem de la lista). Toca para abrir el panel lateral con todo el detalle y acciones. */
export default function TarjetaRedaccion({ caso, href, redactorNombre }: { caso: any; href: string; redactorNombre?: string | null }) {
  const p = pasoRedaccion(caso);
  const canales = (caso.canales_publicacion ?? []) as string[];
  return (
    <Link data-fila href={href} className="tarjeta insumo-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span className="muted" style={{ fontSize: '.75rem' }}>#{String(caso.numero).padStart(5, '0')}</span>
        {caso.publicado_en
          ? <Pill tono="ok" punto={false}>📣 Publicada</Pill>
          : caso.requiere_difusion ? <Pill tono="alta" punto={false}>⚠ Prioriza</Pill> : null}
      </div>
      <strong style={{ display: 'block', margin: '6px 0 2px' }}>{caso.titulo}</strong>
      <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
        {caso.categoria && <BadgeCategoria>{caso.categoria}</BadgeCategoria>}
      </div>
      {redactorNombre && (
        <div className="fila" style={{ gap: 4, fontSize: '.78rem', marginTop: 2, color: 'var(--t-teal-fg)' }}>
          <Icono nombre="usuario" size={13} /> {redactorNombre}
        </div>
      )}
      {caso.publicado_en && canales.length > 0 && (
        <div className="fila" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {canales.map((c) => <span key={c} className="insignia" style={{ fontSize: '.7rem' }}>{ETIQUETA_CANAL_DIFUSION[c] ?? c}</span>)}
        </div>
      )}
      <div className="muted" style={{ fontSize: '.74rem', marginTop: 6 }}>{fechaHora(caso.actualizado_en)}</div>
      <div style={{ borderTop: '1px solid var(--borde)', marginTop: 8, paddingTop: 8 }}>
        <FlujoProgreso paso={p.paso} total={p.total} completo={p.completo} etiqueta={p.etiqueta} />
      </div>
    </Link>
  );
}
