// Bandera de país como imagen SVG local (public/flags/<código>.svg). A diferencia del
// emoji de bandera, un SVG se ve en TODOS los sistemas (incluido Windows, que no tiene
// fuente de banderas). Los archivos son las banderas de flag-icons, ya incluidas en el
// repo. «ZZ» / desconocido → globo 🌍. Sin dependencias en tiempo de ejecución.
export default function Bandera({ codigo, size = 18, titulo }: { codigo?: string | null; size?: number; titulo?: string }) {
  const c = (codigo || '').trim().toLowerCase();
  if (!c || c === 'zz') {
    return <span aria-hidden title={titulo} style={{ fontSize: Math.round(size * 0.9), lineHeight: 1 }}>🌍</span>;
  }
  return (
    <img
      src={`/flags/${c}.svg`}
      alt={titulo || codigo || ''}
      title={titulo}
      width={size}
      height={Math.round(size * 0.75)}
      loading="lazy"
      style={{
        display: 'inline-block', verticalAlign: 'middle', objectFit: 'cover',
        borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,.12)',
      }}
    />
  );
}
