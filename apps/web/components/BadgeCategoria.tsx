// Paleta suave para badges de categoría (color determinístico por texto).
const PALETA = [
  { bg: '#dbeafe', fg: '#1e40af' }, { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#dcfce7', fg: '#166534' }, { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#fce7f3', fg: '#9d2463' }, { bg: '#cffafe', fg: '#155e75' },
  { bg: '#ffe4e6', fg: '#9f1239' }, { bg: '#e0e7ff', fg: '#3730a3' },
];

function indice(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PALETA.length;
}

/** Badge de categoría con color suave estable según el texto. */
export default function BadgeCategoria({ children }: { children: React.ReactNode }) {
  const txt = String(children ?? '');
  const c = PALETA[indice(txt)]!;
  return <span className="badge-cat" style={{ background: c.bg, color: c.fg }}>{children}</span>;
}
