// Catálogo de stickers (migración 0235).
//
// CERRADO Y DIBUJADO AQUÍ, no imágenes que suba cada quien. Sin subida no hay moderación
// de imágenes que sostener, ni almacenamiento que pagar, ni el problema de que alguien
// mande algo que no debe a un canal con 200 personas dentro. En una plataforma de
// respuesta a emergencia, ese cálculo no está reñido con que se pueda ser cálido: para
// eso están los ocho de abajo.
//
// SVG en línea y no archivos: pesan bytes, no peticiones, y siguen el tema (usan
// `currentColor` donde tiene sentido). Es el mismo criterio que Icono.tsx.
//
// Los IDENTIFICADORES tienen que coincidir EXACTAMENTE con public.stickers_disponibles()
// (0235). La base valida contra esa función; esto solo decide qué se pinta.

export type Sticker = {
  id: string;
  /** Lo que se guarda como `cuerpo` del mensaje: el registro y los avisos se leen así. */
  etiqueta: string;
  /** Color de acento del dibujo. */
  tono: string;
  arte: React.ReactNode;
};

/* Los dibujos comparten lienzo 48×48 y trazo redondeado, para que la fila se vea pareja. */
const T = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const STICKERS: Sticker[] = [
  {
    id: 'voy', etiqueta: 'Voy en camino', tono: '#2563eb',
    arte: (
      <g {...T}>
        <path d="M8 30h20V18H14l-6 6z" />
        <path d="M28 30h10v-7l-5-5h-5" />
        <circle cx="15" cy="34" r="3.5" />
        <circle cx="33" cy="34" r="3.5" />
        <path d="M6 22h6M4 26h5" />
      </g>
    ),
  },
  {
    id: 'recibido', etiqueta: 'Recibido', tono: '#0891b2',
    arte: (
      <g {...T}>
        <path d="M8 16l8 8 8-8" />
        <path d="M16 24V8" />
        <path d="M8 32h32" />
        <path d="M28 20l6 6 8-12" />
      </g>
    ),
  },
  {
    id: 'hecho', etiqueta: 'Hecho', tono: '#16a34a',
    arte: (
      <g {...T}>
        <circle cx="24" cy="24" r="17" />
        <path d="M15 24.5l6.5 6.5L34 18" />
      </g>
    ),
  },
  {
    id: 'gracias', etiqueta: 'Gracias', tono: '#d97706',
    arte: (
      // El corazón se encoge y baja para dejar sitio a los destellos: con el dibujo
      // original ocupaba casi todo el lienzo y a 38 px los destellos desaparecían, con
      // lo que este sticker y el tricolor se confundían.
      <g {...T}>
        <path d="M24 42s-11-7-11-14.5a5.8 5.8 0 0 1 11-3A5.8 5.8 0 0 1 35 27.5C35 35 24 42 24 42z" />
        <path d="M24 4v6M11 10l4 4M37 10l-4 4M6 22h5M42 22h-5" />
      </g>
    ),
  },
  {
    id: 'ayuda', etiqueta: 'Necesito ayuda', tono: '#dc2626',
    arte: (
      <g {...T}>
        <path d="M24 7l17 30H7z" />
        <path d="M24 19v9" />
        <path d="M24 32.5h.02" />
      </g>
    ),
  },
  {
    id: 'espera', etiqueta: 'Un momento', tono: '#7c3aed',
    arte: (
      <g {...T}>
        <circle cx="24" cy="24" r="17" />
        <path d="M24 14v10l7 4" />
      </g>
    ),
  },
  {
    id: 'ok', etiqueta: 'Todo bien', tono: '#16a34a',
    arte: (
      <g {...T}>
        <path d="M12 22h5v16h-5z" />
        <path d="M17 24l6-13a3.5 3.5 0 0 1 5 4l-2 7h9a4 4 0 0 1 4 4.7l-2 9A4 4 0 0 1 33 39H17z" />
      </g>
    ),
  },
  {
    id: 'corazon', etiqueta: 'Con cariño', tono: '#e11d48',
    // El único que NO usa currentColor: son los tres colores de la bandera, y ahí el
    // punto es precisamente que sean esos.
    arte: (
      <g>
        <path d="M24 40s-14-8.5-14-18a7.5 7.5 0 0 1 14-3.8A7.5 7.5 0 0 1 38 22c0 9.5-14 18-14 18z"
          fill="#fcd116" stroke="none" />
        <path d="M10.6 26h26.8c.4-1.3.6-2.6.6-4H10c0 1.4.2 2.7.6 4z" fill="#0033a0" stroke="none" />
        <path d="M13 31h22c.9-1.5 1.7-3.2 2.4-5H10.6c.7 1.8 1.5 3.5 2.4 5z" fill="#ce1126" stroke="none" />
        <path d="M24 40s-14-8.5-14-18a7.5 7.5 0 0 1 14-3.8A7.5 7.5 0 0 1 38 22c0 9.5-14 18-14 18z"
          fill="none" stroke="#9f1239" strokeWidth={2.5} strokeLinejoin="round" />
      </g>
    ),
  },
];

const PORID = new Map(STICKERS.map((s) => [s.id, s]));

export function stickerPorId(id: string | null | undefined): Sticker | null {
  return id ? (PORID.get(id) ?? null) : null;
}

/** Pinta un sticker. `size` es el lado del cuadrado. */
export function DibujoSticker({ id, size = 72 }: { id: string; size?: number }) {
  const s = stickerPorId(id);
  if (!s) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={s.etiqueta}
      style={{ color: s.tono, display: 'block' }}>
      {s.arte}
    </svg>
  );
}

// Aviso en desarrollo si el catálogo y la base se desincronizan por un id mal escrito.
// La base es quien manda: un sticker que no esté en stickers_disponibles() se rechaza al
// enviarlo, y eso se vería como «no válido» sin explicación.
if (process.env.NODE_ENV !== 'production') {
  const vistos = new Set<string>();
  const repes = STICKERS.map((s) => s.id).filter((id) => (vistos.has(id) ? true : (vistos.add(id), false)));
  if (repes.length > 0) console.error('[stickers] ids duplicados en STICKERS: ' + repes.join(', '));
}
