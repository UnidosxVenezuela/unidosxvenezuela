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
  organizacion: string | null;
  creado_en: string;
}

export interface Grupo {
  id: string;
  nombre: string;
  area: AreaClave;
  descripcion: string | null;
  lider_id: string | null;
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
