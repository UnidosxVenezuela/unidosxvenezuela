// Etiquetas y colores compartidos entre pantallas (enums estables del dominio).
export const ESTADO: Record<string, string> = {
  pendiente: 'Pendiente', asignada: 'Asignada', en_progreso: 'En progreso',
  bloqueada: 'Bloqueada', completada: 'Completada', cancelada: 'Cancelada',
};
export const PRIORIDAD: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };
export const CATEGORIA: Record<string, string> = {
  codigo: 'Código', diseno: 'Diseño', marketing: 'Marketing', redes_sociales: 'Redes',
  transcripcion: 'Transcripción', legal: 'Legal', acopio: 'Acopio', logistica: 'Logística',
  datos: 'Datos', salud: 'Salud', traduccion: 'Traducción', comunicaciones: 'Comunicaciones', general: 'General',
};
export const URGENCIA: Record<string, string> = { alta: 'Urgente', media: 'Media', baja: 'Baja' };
export const SENSIBILIDAD: Record<string, string> = {
  publica: 'Pública', interna: 'Interna', restringida: 'Restringida', confidencial: 'Confidencial',
};
export const COLOR_PRIORIDAD: Record<string, string> = { baja: '#475569', media: '#a16207', alta: '#c2410c', critica: '#CF142B' };
export const COLOR_URGENCIA: Record<string, string> = { alta: '#CF142B', media: '#a16207', baja: '#475569' };

export const CATEGORIAS = Object.keys(CATEGORIA);
export const PRIORIDADES = Object.keys(PRIORIDAD);

export function formatoHoras(h: number): string {
  const n = Math.round(h * 10) / 10;
  return `${n} h`;
}
