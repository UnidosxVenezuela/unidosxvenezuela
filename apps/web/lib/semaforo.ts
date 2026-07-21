// Semáforo de vida del ofrecimiento (0193): envejecimiento + compromisos vencidos.
// Todo se calcula en la app a partir de creado_en / actualizado_en / comprometida_en;
// no requiere datos nuevos más allá del sello comprometida_en.

const DIA = 86400000;

export function diasDesde(fecha?: string | null): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DIA);
}

// Un compromiso sin concretar en más de N días está «vencido» (alerta).
export const DIAS_COMPROMISO_VENCIDO = 7;

export function compromisoVencido(o: any): boolean {
  if (o?.estado !== 'comprometida') return false;
  const d = diasDesde(o?.comprometida_en ?? o?.actualizado_en);
  return d != null && d >= DIAS_COMPROMISO_VENCIDO;
}

// Envejecimiento de un ofrecimiento ACTIVO (no cumplido/descartado): días desde que
// se registró, con un tono que escala. Devuelve null cuando aún es «fresco».
export function edadOfrecimiento(o: any): { dias: number; tono: 'aviso' | 'alta'; etiqueta: string } | null {
  if (!o || o.estado === 'cumplida' || o.estado === 'descartada') return null;
  const d = diasDesde(o?.creado_en);
  if (d == null || d < 7) return null;
  return { dias: d, tono: d >= 21 ? 'alta' : 'aviso', etiqueta: 'Hace ' + d + ' días' };
}
