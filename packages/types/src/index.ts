// Tipos de dominio compartidos entre web y móvil.
// Cuando conectes Supabase, genera database.types.ts con:
//   pnpm db:types
// y reexporta/combina con estos tipos de dominio.

export type Rol =
  | 'admin'                   // Coordinación general / OCHA-like
  | 'coordinador'             // Líder de un área (cluster)
  | 'lider_grupo'             // Líder de un grupo operativo
  | 'voluntario'              // Miembro de campo
  | 'observador'              // Solo lectura (donantes, prensa autorizada)
  | 'lider_plataforma_aliada' // Comparte endpoints de su plataforma (base de datos compartida)
  | 'verificador';            // Revisa y aprueba casos sensibles (módulo de verificación)

// Áreas inspiradas en clusters humanitarios (IASC/OCHA) + áreas de trabajo.
// El catálogo es extensible por un admin (tabla `areas`), por eso al leer
// de la BD un área es `string`; estas son las claves conocidas con etiqueta.
export type AreaClave =
  | 'salud'
  | 'agua_saneamiento'   // WASH
  | 'refugio'            // Shelter / SLSC
  | 'alimentacion'
  | 'logistica'
  | 'busqueda_rescate'
  | 'telecomunicaciones'
  | 'proteccion'
  | 'gestion_informacion'
  | 'programacion'
  | 'diseno'
  | 'marketing'
  | 'transcripcion';

export type EstadoTarea =
  | 'pendiente'
  | 'asignada'
  | 'en_progreso'
  | 'bloqueada'
  | 'completada'
  | 'cancelada';

export type Prioridad = 'baja' | 'media' | 'alta' | 'critica';

// Tipo de trabajo de una tarea (qué habilidad requiere).
export type CategoriaTarea =
  | 'codigo' | 'diseno' | 'marketing' | 'redes_sociales' | 'transcripcion'
  | 'legal' | 'acopio' | 'logistica' | 'datos' | 'salud' | 'traduccion'
  | 'comunicaciones' | 'general';

export type NivelSensibilidad = 'publica' | 'interna' | 'restringida' | 'confidencial';

// Nota: los campos van en snake_case porque coinciden 1:1 con las columnas
// que devuelve Supabase (ver supabase/migrations/0001_init_schema.sql).
// Mantenerlos así evita un mapeo manual en cada lectura.

export interface Perfil {
  id: string;
  nombre_completo: string;
  telefono: string | null;
  rol: Rol;
  verificado: boolean;
  super_admin: boolean;
  organizacion: string | null;
  motivo: string | null;
  creado_en: string;
}

export interface Grupo {
  id: string;
  nombre: string;
  area: string;            // clave del área (catálogo extensible)
  descripcion: string | null;
  lider_id: string | null;
  whatsapp: string | null;
  creado_en: string;
}

export interface Area {
  clave: string;
  nombre: string;
  descripcion: string | null;
}

export interface Reunion {
  id: string;
  grupo_id: string;
  titulo: string;
  enlace: string;
  inicio: string;
  duracion_min: number;
  creado_por: string | null;
  creado_en: string;
}

export interface ConteoMiembros { grupo_id: string; total: number; }

export interface MensajeFijado {
  id: string;
  grupo_id: string;
  autor_id: string;
  contenido: string;
  creado_en: string;
}

export type TipoAdjunto = 'imagen' | 'documento' | 'enlace';
export interface AdjuntoTarea {
  id: string;
  tarea_id: string;
  tipo: TipoAdjunto;
  url: string;
  nombre: string;
  mime: string | null;
  creado_por: string | null;
  creado_en: string;
}

export type EstadoCaso = 'en_proceso' | 'confirmado' | 'falso';

export interface Caso {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string | null;
  categoria: string | null;
  fuente: string | null;
  fuente_url: string | null;
  fecha_publicacion: string | null;
  asignado_a: string | null;
  estado: EstadoCaso;
  notas: string | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface SolicitudAliado {
  id: string;
  perfil_id: string;
  estado: 'pendiente' | 'aprobada';
  creado_en: string;
  resuelto_en: string | null;
}

export interface EndpointAliado {
  id: string;
  plataforma: string;
  descripcion: string | null;
  url: string;
  metodo: string;
  formato: string | null;
  datos: string | null;
  auth_notas: string | null;
  contacto: string | null;
  activo: boolean;
  creado_por: string | null;
  creado_en: string;
}

export interface RegistroHoras {
  id: string;
  perfil_id: string;
  tarea_id: string | null;
  horas: number;
  descripcion: string | null;
  fecha: string;
  creado_en: string;
}

export interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: Prioridad;
  categoria: CategoriaTarea;
  grupo_id: string | null;
  asignado_a: string | null;
  creado_por: string;
  lat: number | null;
  lng: number | null;
  vence_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface PublicacionTablon {
  id: string;
  autor_id: string;
  grupo_id: string | null;   // null = tablón general
  contenido: string;
  sensibilidad: NivelSensibilidad;
  creado_en: string;
}

export type UrgenciaAcopio = 'alta' | 'media' | 'baja';

export interface PuntoAcopio {
  id: string;
  nombre: string;
  direccion: string | null;
  responsable: string | null;
  telefono: string | null;
  recibe: string | null;
  necesita: string | null;
  horario: string | null;
  capacidad: string | null;
  urgencia: UrgenciaAcopio;
  lat: number;
  lng: number;
  activo: boolean;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface Notificacion {
  id: string;
  destinatario_id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  leida: boolean;
  enlace: string | null;
  creado_en: string;
}
