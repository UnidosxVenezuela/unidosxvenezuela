// Mapa de tintes históricos (hex fijos, solo tema claro) → pares de tokens del
// rediseño (fondo + trazo del ícono), que sí cambian con el tema. Las páginas
// siguen pasando el hex de siempre; los componentes lo traducen aquí. Un tinte
// no mapeado se respeta tal cual (pero no se adapta al tema oscuro).
export const TINTES_TOKEN: Record<string, { bg: string; fg: string }> = {
  '#eef2ff': { bg: 'var(--t-azul-bg)', fg: 'var(--t-azul-fg)' },
  '#dbeafe': { bg: 'var(--t-azul-bg)', fg: 'var(--t-azul-fg)' },
  '#dcfce7': { bg: 'var(--t-verde-bg)', fg: 'var(--t-verde-fg)' },
  '#fef9c3': { bg: 'var(--t-ambar-bg)', fg: 'var(--t-ambar-fg)' },
  '#fef3c7': { bg: 'var(--t-ambar-bg)', fg: 'var(--t-ambar-fg)' },
  '#fce7f3': { bg: 'var(--t-rosa-bg)', fg: 'var(--t-rosa-fg)' },
  '#ede9fe': { bg: 'var(--t-rosa-bg)', fg: 'var(--t-rosa-fg)' },
  '#cffafe': { bg: 'var(--t-teal-bg)', fg: 'var(--t-teal-fg)' },
  '#d9f3ef': { bg: 'var(--t-teal-bg)', fg: 'var(--t-teal-fg)' },
  '#fee2e2': { bg: 'var(--t-rojo-bg)', fg: 'var(--t-rojo-fg)' },
  '#eef2f7': { bg: 'var(--pill-neutra-bg)', fg: 'var(--pill-neutra-fg)' },
};

/** Estilo del «tile» de ícono (KPI / acción rápida / paso del flujo). */
export function tinteTile(tinte?: string | null, color?: string | null): { background: string; color: string } {
  const par = tinte ? TINTES_TOKEN[tinte.toLowerCase()] : undefined;
  if (par) return { background: par.bg, color: par.fg };
  return { background: tinte ?? 'var(--sup2)', color: color ?? 'var(--texto)' };
}
