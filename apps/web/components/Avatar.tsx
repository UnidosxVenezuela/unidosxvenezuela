const COLORES = ['#0033A0', '#16a34a', '#b45309', '#7c3aed', '#0e7490', '#be123c', '#4d7c0f', '#9333ea'];

function colorDe(s: string): string {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length]!;
}

/**
 * Avatar de iniciales con color determinístico según el nombre.
 * Si se pasa `url` (foto de perfil), muestra la imagen; si no, las iniciales.
 */
export default function Avatar({ nombre, url, size = 26 }: { nombre?: string | null; url?: string | null; size?: number }) {
  const base = (nombre || '?').trim() || '?';
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar simple; evita configurar remotePatterns de next/image
      <img src={url} alt={nombre || 'Avatar'} title={nombre || undefined} width={size} height={size} style={{
        width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
        background: '#e5e7eb',
      }} />
    );
  }
  const ini = base.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  return (
    <span title={nombre || undefined} style={{
      width: size, height: size, borderRadius: '50%', background: colorDe(base), color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
      fontSize: Math.round(size * 0.42), flexShrink: 0,
    }}>{ini}</span>
  );
}
