import type { AreaClave, Rol, EstadoTarea, Prioridad, NivelSensibilidad } from '@unidos/types';

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
};

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: 'Administración',
  coordinador: 'Coordinador',
  lider_grupo: 'Líder de grupo',
  voluntario: 'Voluntario',
  observador: 'Observador',
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
