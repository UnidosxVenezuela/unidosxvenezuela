import Link from 'next/link';
import Icono from './Icono';

/**
 * Tarjeta KPI del panel: "icon tile" tintado + etiqueta + número grande + subtítulo.
 * Clicable si recibe `href` (se eleva al pasar el mouse, vía a.tarjeta:hover).
 */
export default function Kpi({ etiqueta, valor, sub, color = 'var(--texto)', icono, tinte = '#eef2ff', href }: {
  etiqueta: string; valor: React.ReactNode; sub?: string; color?: string; icono: string; tinte?: string; href?: string;
}) {
  const cuerpo = (
    <div className="fila" style={{ gap: 12, flexWrap: 'nowrap', alignItems: 'center' }}>
      <span className="kpi-ico" style={{ background: tinte, color }}><Icono nombre={icono} size={22} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--texto-suave)', fontWeight: 600, fontSize: '.88rem' }}>{etiqueta}</div>
        <div style={{ fontSize: '1.9rem', fontWeight: 800, color, lineHeight: 1.1 }}>{valor}</div>
        {sub && <div className="muted" style={{ fontSize: '.78rem' }}>{sub}</div>}
      </div>
    </div>
  );
  return href
    ? <Link href={href} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 0 }}>{cuerpo}</Link>
    : <div className="tarjeta" style={{ marginBottom: 0 }}>{cuerpo}</div>;
}
