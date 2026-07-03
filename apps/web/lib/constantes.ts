import type { AreaClave, Rol, EstadoTarea, Prioridad, NivelSensibilidad, CategoriaTarea, TipoAdjunto, UrgenciaAcopio, EstadoCaso, EtapaContenido, DestinoContenido, EstadoAcompanamiento, TipoApoyo } from '@unidos/types';

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
  lider_plataforma_aliada: 'Líder de plataforma aliada',
  verificador: 'Verificación',
  recopilacion: 'Recopilación',
  redaccion: 'Envío a Redacción',
  redes_sociales: 'Community Manager',
  diseno_grafico: 'Diseño Gráfico',
  edicion_video: 'Edición de Videos',
  influencers: 'Influencers',
  logistica: 'Logística',
  apoyo_psicosocial: 'Apoyo Psicosocial',
  lider_psicosocial: 'Líder Psicosocial',
  coordinador_psicosocial: 'Coordinación Psicosocial',
};

// ── Insumos / Logística ──
export const ETIQUETA_TIPO_INSUMO: Record<string, string> = {
  medicamentos: 'Medicamentos', alimentos: 'Alimentos', agua: 'Agua', higiene: 'Higiene', refugio: 'Refugio', otro: 'Otro',
};
export const TIPOS_INSUMO = Object.keys(ETIQUETA_TIPO_INSUMO);
export const ETIQUETA_ESTADO_INSUMO: Record<string, string> = {
  solicitado: 'Solicitado', en_gestion: 'En gestión', en_ruta: 'En ruta', entregado: 'Entregado', cancelado: 'Cancelado',
};
/** Orden del tablero (el estado 'cancelado' se muestra aparte). */
export const ESTADOS_INSUMO = ['solicitado', 'en_gestion', 'en_ruta', 'entregado'];
export function claseEstadoInsumo(e: string): string {
  if (e === 'entregado') return 'ok';
  if (e === 'en_ruta') return 'info';
  if (e === 'en_gestion') return 'aviso';
  if (e === 'cancelado') return 'critica';
  return '';
}
export function siguienteEstadoInsumo(e: string): string | null {
  const orden = ['solicitado', 'en_gestion', 'en_ruta', 'entregado'];
  const i = orden.indexOf(e);
  return i >= 0 && i < orden.length - 1 ? (orden[i + 1] ?? null) : null;
}
export const ETIQUETA_ESTADO_DONACION: Record<string, string> = {
  comprometida: 'Comprometida', recibida: 'Recibida', asignada: 'Asignada',
};
export const ESTADOS_DONACION = ['comprometida', 'recibida', 'asignada'];
export function claseEstadoDonacion(e: string): string {
  if (e === 'asignada') return 'ok';
  if (e === 'recibida') return 'info';
  return 'aviso';
}
export const TIPOS_VEHICULO = ['Moto', 'Carro', 'Camioneta', 'Camión', 'Furgón', 'Otro'];

// Roles de la "cadena de contenido" (de la información a la publicación). Los
// coordinadores y líderes pueden asignarlos como roles ADICIONALES a voluntarios
// o a sí mismos, para sumarlos al flujo de trabajo (no a otros mandos).
export const ROLES_CADENA_CONTENIDO: Rol[] = ['recopilacion', 'verificador', 'redaccion', 'redes_sociales', 'diseno_grafico', 'edicion_video', 'influencers'];

export const ETIQUETA_ESTADO_CASO: Record<EstadoCaso, string> = {
  en_proceso: 'En proceso', confirmado: 'Confirmado y activo', falso: 'Falso / resuelto',
  enviado_redaccion: 'Enviado a Redacción',
};
export const ESTADOS_CASO: EstadoCaso[] = ['en_proceso', 'confirmado', 'falso', 'enviado_redaccion'];
// Categorías vigentes al crear/verificar (los casos viejos conservan la suya).
export const CATEGORIAS_CASO = ['Desaparecidos', 'Otras informaciones'];

// ── Pipeline de producción de contenido ──
export const ETIQUETA_ETAPA: Record<EtapaContenido, string> = {
  redaccion: 'Redacción', diseno: 'Diseño Gráfico', video: 'Edición de Videos', redes: 'Redes Sociales', publicado: 'Publicado',
};
export const ETAPAS_CONTENIDO: EtapaContenido[] = ['redaccion', 'diseno', 'video', 'redes', 'publicado'];
export const ETIQUETA_DESTINO: Record<DestinoContenido, string> = { diseno: 'Diseño Gráfico', video: 'Edición de Videos' };
export const DESTINOS: DestinoContenido[] = ['diseno', 'video'];

/** Rol responsable de cada etapa (para asignar y permitir acciones). */
export const ROL_DE_ETAPA: Record<EtapaContenido, Rol | null> = {
  redaccion: 'redaccion', diseno: 'diseno_grafico', video: 'edicion_video', redes: 'redes_sociales', publicado: null,
};

// ── Habilidades del perfil ──
// Lista sugerida; si alguien no encuentra la suya, puede escribirla. Sirve para
// que coordinación y admin conozcan los fuertes de cada quien y en qué ayudar.
export const HABILIDADES_SUGERIDAS = [
  'Redacción', 'Diseño gráfico', 'Edición de video', 'Fotografía',
  'Manejo de redes sociales', 'Community management', 'Traducción / idiomas',
  'Logística', 'Transporte / conducción', 'Primeros auxilios', 'Medicina / salud',
  'Psicología / apoyo emocional', 'Atención al público', 'Cocina / alimentación',
  'Legal', 'Finanzas / contabilidad', 'Datos / Excel', 'Programación',
  'Mapas / GIS', 'Gestión de proyectos', 'Comunicación institucional',
  'Recaudación de fondos', 'Trabajo de campo', 'Coordinación de equipos',
];

// ── Espacios de trabajo por rol ──
// Metadatos visuales de cada espacio: ícono del tipo de trabajo, color, el
// ORDEN dentro de su flujo, y a qué FLUJO pertenece. Pensado para sumar más
// flujos a futuro: basta agregar roles con otro `flujo` y una entrada en FLUJOS.
export const ESPACIO_META: Record<string, { icono: string; color: string; tinte: string; orden: number; flujo: string }> = {
  recopilacion:   { icono: 'buscar',    color: '#a16207',     tinte: '#fef9c3', orden: 0, flujo: 'contenido' },
  redaccion:      { icono: 'documento', color: 'var(--azul)', tinte: '#eef2ff', orden: 1, flujo: 'contenido' },
  diseno_grafico: { icono: 'imagen',    color: '#9d2463',     tinte: '#fce7f3', orden: 2, flujo: 'contenido' },
  edicion_video:  { icono: 'video',     color: '#7c3aed',     tinte: '#ede9fe', orden: 3, flujo: 'contenido' },
  redes_sociales: { icono: 'tablon',    color: '#0e7490',     tinte: '#cffafe', orden: 4, flujo: 'contenido' },
};

// Flujos de trabajo (cada uno agrupa varios espacios, en orden). Agregar más aquí.
export const FLUJOS_TRABAJO: { clave: string; titulo: string; icono: string }[] = [
  { clave: 'contenido', titulo: 'Producción de contenido', icono: 'cohete' },
];

/** Tono de Pill por etapa. */
export function claseEtapa(e: EtapaContenido): string {
  if (e === 'publicado') return 'ok';
  if (e === 'redes') return 'info';
  if (e === 'redaccion') return 'aviso';
  return ''; // diseño / video → neutro
}

/** Siguiente etapa según la actual y el destino elegido en Redacción. */
export function siguienteEtapa(etapa: EtapaContenido, destino: DestinoContenido | null): EtapaContenido | null {
  if (etapa === 'redaccion') return destino === 'video' ? 'video' : 'diseno';
  if (etapa === 'diseno' || etapa === 'video') return 'redes';
  if (etapa === 'redes') return 'publicado';
  return null; // publicado = fin del flujo
}

// ── Apoyo Psicosocial (área confidencial) ──
export const ETIQUETA_TIPO_APOYO: Record<TipoApoyo, string> = {
  duelo: 'Duelo', ansiedad: 'Ansiedad', estres_agudo: 'Estrés agudo',
  crisis: 'Crisis', familiar: 'Familiar', infantil: 'Infantil', otro: 'Otro',
};
export const TIPOS_APOYO: TipoApoyo[] = Object.keys(ETIQUETA_TIPO_APOYO) as TipoApoyo[];

export const ETIQUETA_ESTADO_ACOMP: Record<EstadoAcompanamiento, string> = {
  solicitado: 'Solicitado', asignado: 'Asignado', en_acompanamiento: 'En acompañamiento',
  seguimiento: 'Seguimiento', cerrado: 'Cerrado', cancelado: 'Cancelado',
};
/** Columnas del tablero (sin 'cancelado', que se lista aparte). */
export const ESTADOS_ACOMP: EstadoAcompanamiento[] = ['solicitado', 'asignado', 'en_acompanamiento', 'seguimiento', 'cerrado'];
export function claseEstadoAcomp(e: EstadoAcompanamiento): string {
  if (e === 'cerrado') return 'ok';
  if (e === 'seguimiento') return 'info';
  if (e === 'en_acompanamiento') return 'aviso';
  if (e === 'cancelado') return 'critica';
  return ''; // solicitado / asignado → neutro
}
/** Siguiente estado del acompañamiento (avance lineal; 'cerrado' es el fin). */
export function siguienteEstadoAcomp(e: EstadoAcompanamiento): EstadoAcompanamiento | null {
  const orden: EstadoAcompanamiento[] = ['solicitado', 'asignado', 'en_acompanamiento', 'seguimiento', 'cerrado'];
  const i = orden.indexOf(e);
  return i >= 0 && i < orden.length - 1 ? (orden[i + 1] ?? null) : null;
}
export const TIPOS_CONTACTO_PSICO = ['Llamada', 'Presencial', 'Mensaje', 'Videollamada', 'Otro'];

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

/** Orden de prioridad para listar (crítica primero). */
export const RANGO_PRIORIDAD: Record<Prioridad, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

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
