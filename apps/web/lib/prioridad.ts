// Score de criticidad de una solicitud (caso). Lo comparten el tablero de Recopilación
// (ordenar por criticidad) y la «cola» de Verificación (atacar primero lo más urgente).
// Combina cuatro señales que ya se capturan hoy y degrada bien si faltan datos.

export type CasoPrioridad = {
  req_urgencia?: string | null;
  personas_afectadas?: number | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  sigue_vigente?: string | null;
};

// Peso de la urgencia declarada del requerimiento. Sin urgencia → algo por encima de
// «baja» (1.5), para no hundir solicitudes que aún no la fijaron.
const PESO_URGENCIA: Record<string, number> = { critica: 4, alta: 3, media: 2, baja: 1 };

/**
 * Devuelve un número (mayor = más urgente). Factores:
 *   · urgencia declarada (crítica..baja),
 *   · personas afectadas (0182): a más gente, más peso, pero crece suave (log10),
 *   · espera: días desde que entró; cuanto más lleva sin cerrarse, más sube (tope 21 d),
 *   · vigencia: si ya NO está vigente ('no'), cae al fondo.
 * `ahora` se inyecta (Date.now() del server component) para mantener la función pura.
 */
export function scoreCaso(c: CasoPrioridad, ahora: number): number {
  const urg = PESO_URGENCIA[String(c.req_urgencia ?? '').toLowerCase()] ?? 1.5;
  const personas = Math.max(0, Number(c.personas_afectadas) || 0);
  const factorPersonas = 1 + Math.log10(1 + personas);            // 0→1, 9→2, 99→3, 999→4
  const base = c.creado_en || c.actualizado_en;
  const dias = base ? Math.max(0, (ahora - new Date(base).getTime()) / 86_400_000) : 0;
  const factorEspera = 1 + Math.min(dias, 21) / 7;                 // 0 d→1 … 21 d→4 (tope)
  const factorVigencia = String(c.sigue_vigente ?? '').toLowerCase() === 'no' ? 0.35 : 1;
  return urg * factorPersonas * factorEspera * factorVigencia;
}

export type NivelPrioridad = 'critica' | 'alta' | 'media' | 'baja';

/** Bucket legible del score para pintar una insignia (umbrales calibrados a los factores). */
export function nivelPrioridad(score: number): NivelPrioridad {
  if (score >= 12) return 'critica';
  if (score >= 7) return 'alta';
  if (score >= 3.5) return 'media';
  return 'baja';
}

export const ETIQUETA_NIVEL_PRIORIDAD: Record<NivelPrioridad, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja',
};

/** Tono de Pill para cada nivel (paleta existente del componente Pill). */
export const TONO_NIVEL_PRIORIDAD: Record<NivelPrioridad, 'critica' | 'alta' | 'aviso' | 'neutra'> = {
  critica: 'critica', alta: 'alta', media: 'aviso', baja: 'neutra',
};
