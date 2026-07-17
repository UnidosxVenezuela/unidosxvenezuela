import Link from 'next/link';
import Icono from './Icono';
import NumeroAnimado from './NumeroAnimado';
import { tinteTile } from '@/lib/tintes';

/**
 * Tarjeta KPI del panel: "icon tile" tintado + etiqueta + número grande (Sora)
 * + subtítulo, y una micro-tendencia opcional («▲ 4 h esta semana»). Clicable
 * si recibe `href`. Los tintes hex históricos se traducen a tokens del tema
 * (claro/oscuro) vía tinteTile.
 */
export default function Kpi({ etiqueta, valor, sub, color, icono, tinte, href, tendencia, tonoTendencia = 'ok' }: {
  etiqueta: string; valor: React.ReactNode; sub?: string; color?: string; icono: string; tinte?: string; href?: string;
  tendencia?: string; tonoTendencia?: 'ok' | 'aviso';
}) {
  const tile = tinteTile(tinte ?? '#eef2ff', color);
  const cuerpo = (
    <div className="fila" style={{ gap: 14, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <span className="kpi-ico" style={tile}><Icono nombre={icono} size={21} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--texto-suave)', fontWeight: 600, fontSize: '.82rem' }}>{etiqueta}</div>
        <div className="kpi-num">
          {typeof valor === 'number' ? <NumeroAnimado valor={valor} /> : valor}
        </div>
        {tendencia
          ? <div className={'kpi-tend ' + tonoTendencia}>▲ {tendencia}</div>
          : (sub && <div className="muted" style={{ fontSize: '.76rem' }}>{sub}</div>)}
      </div>
    </div>
  );
  return href
    ? <Link href={href} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 0, padding: 20 }}>{cuerpo}</Link>
    : <div className="tarjeta" style={{ marginBottom: 0, padding: 20 }}>{cuerpo}</div>;
}
