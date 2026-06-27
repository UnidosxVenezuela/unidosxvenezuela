// Tipos de dominio compartidos entre web y móvil.
// Cuando conectes Supabase, genera database.types.ts con:
//   pnpm db:types
// y reexporta/combina con estos tipos de dominio.

export type Rol =
  | 'admin'          // Coordinación general / OCHA-like
  | 'coordinador'    // Líder de un área (cluster)
  | 'lider_grupo'    // Líder de un grupo operativo
  | 'voluntario'     // Miembro de campo
  | 'observador';    // Solo lectura (donantes, prensa autorizada)

// Áreas inspiradas en el sistema de clusters humanitarios (IASC/OCHA).
export type AreaClave =
  | 'salud'
  | 'agua_saneamiento'   // WASH
  | 'refugio'            // Shelter / SLSC
  | 'alimentacion'
  | 'logistica'
  | 'busqueda_rescate'
  | 'telecomunicaciones'
  | 'proteccion'
  | 'gestion_informacion';

export type EstadoTarea =
  | 'pendiente'
  | 'asignada'
  | 'en_progreso'
  | 'bloqueada'
  | 'completada'
  | 'cancelada';

export type Prioridad = 'baja' | 'media' | 'alta' | 'critica';

export type NivelSensibilidad = 'publica' | 'interna' | 'restringida' | 'confidencial';

export interface Perfil {
  id: string;
  nombreCompleto: string;
  telefono: string | null;
  rol: Rol;
  verificado: boolean;
  organizacion: string | null;
  creadoEn: string;
}

export interface Grupo {
  id: string;
  nombre: string;
  area: AreaClave;
  descripcion: string | null;
  liderId: string | null;
  creadoEn: string;
}

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: Prioridad;
  grupoId: string | null;
  asignadoAId: string | null;
  creadoPorId: string;
  ubicacion: { lat: number; lng: number } | null;
  venceEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface PublicacionTablon {
  id: string;
  autorId: string;
  grupoId: string | null;   // null = tablón general
  contenido: string;
  sensibilidad: NivelSensibilidad;
  creadoEn: string;
}

export interface Notificacion {
  id: string;
  destinatarioId: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  leida: boolean;
  enlace: string | null;
  creadoEn: string;
}
