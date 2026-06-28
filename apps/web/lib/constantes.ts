import type { AreaClave, Rol, EstadoTarea, Prioridad, NivelSensibilidad, CategoriaTarea, TipoAdjunto, UrgenciaAcopio } from '@unidos/types';

export const ETIQUETA_URGENCIA: Record<UrgenciaAcopio, string> = {
  alta: 'Urgente', media: 'Necesita', baja: 'Cubierto',
};
export const URGENCIAS: UrgenciaAcopio[] = ['alta', 'media', 'baja'];
/** Clase de insignia por urgencia del centro de acopio. */
export function claseUrgencia(u: UrgenciaAcopio): string {
  if (u === 'alta') return 'critica';
  if (u === 'media') return 'aviso';
  return 'ok';
}

export const ETIQUETA_TIPO_ADJUNTO: Record<TipoAdjunto, string> = {
  imagen: 'Imagen', documento: 'Documento', enlace: 'Enlace',
};
export function iconoAdjunto(t: TipoAdjunto): string {
  if (t === 'imagen') return 'imagen';
  if (t === 'enlace') return 'enlace';
  return 'documento';
}

// Validación de enlaces (server + UI). Re-validar SIEMPRE en el render antes de href.
export function esEnlaceWhatsappValido(url: string): boolean {
  return /^https:\/\/(wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)\/\S+$/i.test(url.trim());
}
export function esEnlaceHttpsValido(url: string): boolean {
  return /^https:\/\/\S+$/i.test(url.trim());
}
/** Devuelve la url solo si es https segura (sin espacios); si no, null. Usar en RENDER antes de href. */
export function hrefSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  return /^https:\/\//i.test(u) && !/\s/.test(u) ? u : null;
}
export function formatoHoras(h: number | null | undefined): string {
  const n = Number(h ?? 0);
  const t = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return t + ' h';
}

export const ETIQUETA_CATEGORIA: Record<CategoriaTarea, string> = {
  codigo: 'Código', diseno: 'Diseño', marketing: 'Marketing',
  redes_sociales: 'Redes sociales', transcripcion: 'Transcripción',
  legal: 'Legal', acopio: 'Acopio', logistica: 'Logística', datos: 'Datos',
  salud: 'Salud', traduccion: 'Traducción', comunicaciones: 'Comunicaciones',
  general: 'General',
};
export const CATEGORIAS: CategoriaTarea[] = Object.keys(ETIQUETA_CATEGORIA) as CategoriaTarea[];

export const ETIQUETA_AREA: Record<AreaClave, string> = {
  salud: 'Salud',
  agua_saneamiento: 'Agua y Saneamiento',
  refugio: 'Refugio y Albergues',
  alimentacion: 'Alimentación',
  logistica: 'Logística',
  busqueda_rescate: 'Búsqueda y Rescate',
  telecomunicaciones: 'Telecomunicaciones',
  proteccion: 'Protección',
  gestion_informacion: 'Gestión de Información',
  programacion: 'Programación',
  diseno: 'Diseño',
  marketing: 'Marketing',
  transcripcion: 'Transcripción',
};

/** Etiqueta de un área por su clave (tolera áreas creadas por admin). */
export function etiquetaArea(clave: string): string {
  return (ETIQUETA_AREA as Record<string, string>)[clave] ?? clave;
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: 'Administración',
  coordinador: 'Coordinador',
  lider_grupo: 'Líder de grupo',
  voluntario: 'Voluntario',
  observador: 'Observador',
  lider_plataforma_aliada: 'Líder de plataforma aliada',
};

export const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente', asignada: 'Asignada', en_progreso: 'En progreso',
  bloqueada: 'Bloqueada', completada: 'Completada', cancelada: 'Cancelada',
};

export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

export const AREAS: AreaClave[] = Object.keys(ETIQUETA_AREA) as AreaClave[];
export const ROLES: Rol[] = Object.keys(ETIQUETA_ROL) as Rol[];

export const ESTADOS: EstadoTarea[] = Object.keys(ETIQUETA_ESTADO) as EstadoTarea[];
export const PRIORIDADES: Prioridad[] = Object.keys(ETIQUETA_PRIORIDAD) as Prioridad[];

/** Clase CSS de insignia según prioridad. */
export function clasePrioridad(p: Prioridad): string {
  if (p === 'critica') return 'critica';
  if (p === 'alta') return 'alta';
  if (p === 'media') return 'aviso';
  return '';
}

/** Clase CSS de insignia según estado de tarea. */
export function claseEstado(e: EstadoTarea): string {
  if (e === 'completada') return 'ok';
  if (e === 'en_progreso') return 'aviso';
  if (e === 'bloqueada' || e === 'cancelada') return 'critica';
  return '';
}

export const ETIQUETA_SENSIBILIDAD: Record<NivelSensibilidad, string> = {
  publica: 'Pública',
  interna: 'Interna',
  restringida: 'Restringida',
  confidencial: 'Confidencial',
};
export const SENSIBILIDADES: NivelSensibilidad[] = Object.keys(ETIQUETA_SENSIBILIDAD) as NivelSensibilidad[];

export function claseSensibilidad(s: NivelSensibilidad): string {
  if (s === 'confidencial') return 'critica';
  if (s === 'restringida') return 'aviso';
  if (s === 'publica') return 'ok';
  return '';
}
