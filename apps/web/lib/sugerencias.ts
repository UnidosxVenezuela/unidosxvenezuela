// Espejo en la app del catálogo de `public.sugerencias` (migración 0234).
// La BASE es la fuente de verdad: los CHECK de `tipo` y `estado` mandan y la RLS decide
// quién lee. Esto solo dice qué etiqueta se pinta.

export const TIPO_SUGERENCIA = {
  problema: 'Algo falla',
  idea: 'Idea',
} as const;

export const ESTADO_SUGERENCIA = {
  nueva: 'Sin leer',
  en_revision: 'En revisión',
  aceptada: 'Se va a hacer',
  descartada: 'Descartada',
  resuelta: 'Resuelto',
} as const;

/** Orden en el que se ofrecen los estados al atender, del primero al último del circuito. */
export const ESTADOS_SUGERENCIA = ['nueva', 'en_revision', 'aceptada', 'resuelta', 'descartada'] as const;

/** Tono de la píldora, con el mismo criterio que el resto de la plataforma. */
export function tonoEstadoSugerencia(estado: string): 'info' | 'aviso' | 'ok' | 'neutra' {
  switch (estado) {
    case 'nueva': return 'aviso';        // pide atención: nadie lo ha mirado
    case 'en_revision': return 'info';
    case 'aceptada': return 'info';
    case 'resuelta': return 'ok';
    default: return 'neutra';            // descartada
  }
}
