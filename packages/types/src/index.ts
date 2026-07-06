// Tipos de dominio compartidos entre web y móvil.
// Cuando conectes Supabase, genera database.types.ts con:
//   pnpm db:types
// y reexporta/combina con estos tipos de dominio.

export type Rol =
  | 'admin'                   // Coordinación general / OCHA-like
  | 'coordinador'             // Líder de un área (cluster)
  | 'lider_grupo'             // Líder de un grupo operativo
  | 'voluntario'              // Miembro de campo
  | 'lider_plataforma_aliada' // Comparte endpoints de su plataforma (base de datos compartida)
  | 'verificador'             // Revisa y aprueba casos sensibles (módulo de verificación)
  // Pipeline de contenido (grupos exclusivos por rol)
  | 'recopilacion'            // Envía información/casos para verificar (no verifica)
  | 'busqueda'                // Verifica casos de personas desaparecidas ADULTAS (Grupo de Búsqueda)
  | 'buscador_nna'            // Buscador NNA: atiende SOLO los casos de menores de edad
  | 'enlace_contacto'         // Enlace de contacto: llama a la familia tras aprobar la coincidencia
  | 'digitalizador'           // Digitaliza listados de personas (Grupo de Digitalización)
  | 'redaccion'               // Grupo Redacción: envía los confirmados a Redacción
  | 'redes_sociales'          // Redes Sociales (publicación)
  | 'diseno_grafico'          // Diseño Gráfico
  | 'edicion_video'           // Edición de Videos
  | 'influencers'             // Influencers
  | 'logistica'               // Insumos / logística de acopio (envíos, proveedores, donaciones)
  // Área confidencial de salud mental
  | 'apoyo_psicosocial'        // Profesional/voluntario que acompaña en salud mental
  | 'lider_psicosocial'        // Líder del grupo Psicosocial (gestiona el grupo, no ve casos)
  | 'coordinador_psicosocial'  // Coordina el área psicosocial (ve todo, asigna)
  // Administración por ÁREA: gestiona SOLO su área (no es admin general). Ver 0103.
  | 'admin_verificacion'       // Admin · Verificaciones (grupos de gestión de información)
  | 'admin_redes';             // Admin · Redes Sociales (grupos de contenido/marketing)

// Área que administra un "admin de área" (0103). El admin general administra todo.
export type AreaAdmin = 'verificacion' | 'redes';

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
  whatsapp: string | null;   // dígitos normalizados; login sin correo + contacto
  rol: Rol;
  roles_extra: Rol[];
  verificado: boolean;
  super_admin: boolean;
  organizacion: string | null;
  motivo: string | null;
  area_registro?: string | null;  // área elegida al registrarse (verificacion|redes|general)
  pais?: string | null;            // código ISO 3166-1 alfa-2 (para zona horaria/planificación)
  ciudad?: string | null;          // ciudad de residencia (complementa pais)
  disponibilidad?: string | null;  // horario disponible + zona horaria (texto)
  horas_semana?: string | null;    // capacidad semanal (texto: «5-10 horas»)
  experiencia?: string | null;     // experiencia relevante (verificación/búsqueda/datos)
  contacto_emergencia?: string | null; // deber de cuidado: «Nombre (relación) · teléfono»
  estado_presencia?: string | null;    // 'conectado' | 'ocupado' (elección de la persona)
  ultima_conexion?: string | null;     // último latido (ISO) — para online/«hace cuánto»
  avatar_url: string | null;
  habilidades: string[];
  creado_en: string;
}

export interface Grupo {
  id: string;
  nombre: string;
  area: string;            // clave del área (catálogo extensible)
  descripcion: string | null;
  lider_id: string | null;
  whatsapp: string | null;
  rol_objetivo: Rol | null; // si es un espacio de trabajo por rol (pre-hecho)
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

export type EstadoCaso = 'pendiente' | 'en_proceso' | 'confirmado' | 'falso' | 'enviado_redaccion' | 'resuelto';

/** Tipo de insumo (enum public.tipo_insumo, 0050). Reutilizado por los casos-requerimiento. */
export type TipoInsumo = 'medicamentos' | 'alimentos' | 'agua' | 'higiene' | 'refugio' | 'otro';

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
  es_nna: boolean;
  // Solicitud de ayuda con ubicación (Propuesta casos↔mapa↔acopio, Fase 1).
  es_requerimiento: boolean;
  lat: number | null;
  lng: number | null;
  req_tipo: TipoInsumo | null;
  req_cantidad: string | null;
  req_urgencia: Prioridad | null;
}

/** Punto de «Solicitud de ayuda» para el mapa (RPC solicitudes_ayuda_mapa). */
export interface SolicitudAyudaMapa {
  id: string;
  titulo: string;
  categoria: string | null;
  lat: number;
  lng: number;
  tipo: TipoInsumo | null;
  urgencia: Prioridad | null;
  estado: EstadoCaso;
}

// Pipeline de producción de contenido (un caso confirmado → pieza publicable).
export type EtapaContenido = 'redaccion' | 'diseno' | 'video' | 'redes' | 'publicado';
export type DestinoContenido = 'diseno' | 'video';

export interface PiezaContenido {
  id: string;
  caso_id: string | null;
  titulo: string;
  etapa: EtapaContenido;
  destino: DestinoContenido | null;
  contenido: string | null;
  descripcion: string | null;
  enlace_pieza: string | null;
  adjunto_url: string | null;
  adjunto_nombre: string | null;
  notas: string | null;
  asignado_a: string | null;
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
  camas_total: number;
  camas_ocupadas: number;
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

// ── Apoyo Psicosocial (área confidencial de salud mental) ──
export type EstadoAcompanamiento =
  | 'solicitado' | 'asignado' | 'en_acompanamiento' | 'seguimiento' | 'cerrado' | 'cancelado';
export type TipoApoyo =
  | 'duelo' | 'ansiedad' | 'estres_agudo' | 'crisis' | 'familiar' | 'infantil' | 'otro';

export interface Acompanamiento {
  id: string;
  numero: number;
  persona: string;             // nombre o alias de quien recibe apoyo
  contacto: string | null;
  tipo: TipoApoyo;
  motivo: string | null;
  riesgo: Prioridad;           // nivel de riesgo (baja/media/alta/critica)
  estado: EstadoAcompanamiento;
  asignado_a: string | null;
  notas_cierre: string | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
}

export interface BitacoraPsicosocial {
  id: string;
  acompanamiento_id: string;
  autor_id: string | null;
  contenido: string;
  tipo_contacto: string | null;
  creado_en: string;
}

export interface RecursoPsicosocial {
  id: string;
  titulo: string;
  descripcion: string | null;
  telefono: string | null;
  url: string | null;
  orden: number;
  creado_en: string;
}

// ── Grupo de Búsqueda (metodología de desaparecidos) ──
// Capa companion 1:1 sobre un caso `categoria='Desaparecidos'`. El nombre y la
// descripción viven en casos.titulo / casos.descripcion.
export type EstadoBusqueda =
  | 'activo' | 'en_revision' | 'coincidencia_pendiente' | 'coincidencia_aprobada'
  | 'cierre_pendiente'  // el Enlace finalizó; espera la confirmación del mando (3B)
  | 'encontrado_fallecido' | 'reunificado' | 'derivado_autoridad' | 'descartado';

export interface BusquedaCaso {
  id: string;
  caso_id: string;
  numero: number;
  codigo: string;              // A-00X (adulto) / N-00X (NNA), congelado en el alta
  sexo: 'm' | 'f' | 'otro' | null;
  edad: number | null;
  ultima_ubicacion: string | null;
  situacion: string | null;    // reportado | hospitalizado | refugio | fallecido | no_identificado
  es_nna: boolean;             // menor de edad (NNA)
  reporta_nombre: string | null;
  reporta_telefono: string | null;
  estado_busqueda: EstadoBusqueda;
  fuente_verifico: string | null;
  proxima_revision: string | null;
  ultimo_recordatorio: string | null;
  custodia_verificada: boolean;
  autoridad_notificada: boolean;
  aprobado_por: string | null;
  aprobado_en: string | null;
  contacto_por: string | null;
  contacto_en: string | null;
  cierre_propuesto: string | null;      // reunificado | descartado | encontrado_fallecido
  cierre_propuesto_por: string | null;
  cierre_propuesto_en: string | null;
  creado_en: string;
  actualizado_en: string;
}
