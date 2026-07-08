import type { AreaClave, AreaAdmin, Rol, EstadoTarea, Prioridad, NivelSensibilidad, CategoriaTarea, TipoAdjunto, UrgenciaAcopio, EstadoCaso, EtapaContenido, DestinoContenido, EstadoAcompanamiento, TipoApoyo, EstadoBusqueda } from '@unidos/types';

/** Longitud mínima de contraseña (única fuente de verdad en la UI: registro, alta y cambio de clave). */
export const MIN_CLAVE = 8;

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
  busqueda: 'Búsqueda',
  buscador_nna: 'Buscador NNA',
  enlace_contacto: 'Enlace de contacto',
  digitalizador: 'Digitalización',
  redaccion: 'Envío a Redacción',
  redes_sociales: 'Community Manager',
  diseno_grafico: 'Diseño Gráfico',
  edicion_video: 'Edición de Videos',
  influencers: 'Influencers',
  logistica: 'Logística',
  apoyo_psicosocial: 'Apoyo Psicosocial',
  lider_psicosocial: 'Líder Psicosocial',
  coordinador_psicosocial: 'Coordinación Psicosocial',
  admin_verificacion: 'Administración · Verificaciones',
  admin_redes: 'Administración · Redes Sociales',
  admin_logistica: 'Administración · Logística y Acopio',
  admin_digitalizacion: 'Administración · Digitalización',
};

// ── Administración por ÁREA (0103) ──
// Dos administraciones ACOTADAS conviven con la administración general:
//   · Verificaciones → grupos de gestión de información (casos, verificación, búsqueda,
//     búsqueda NNA, enlace de contacto, digitalización).
//   · Redes Sociales → grupos de contenido (redacción/envío, diseño gráfico, edición de
//     video, community manager, influencers).
// El admin general ve y administra TODO; el dueño es superadmin. Un admin de área NO es
// admin general: solo gestiona su área (sus grupos y las solicitudes de su área).
export const AREAS_ADMIN: AreaAdmin[] = ['verificacion', 'redes', 'logistica', 'digitalizacion'];
export const ETIQUETA_AREA_ADMIN: Record<AreaAdmin, string> = {
  verificacion: 'Verificaciones',
  redes: 'Redes Sociales',
  logistica: 'Logística y Acopio',
  digitalizacion: 'Digitalización',
};
/** Rol de administración de cada área. */
export const ROL_ADMIN_DE_AREA: Record<AreaAdmin, Rol> = {
  verificacion: 'admin_verificacion',
  redes: 'admin_redes',
  logistica: 'admin_logistica',
  digitalizacion: 'admin_digitalizacion',
};
/** Claves de grupo (sistema) que administra cada área. */
export const GRUPOS_POR_AREA_ADMIN: Record<AreaAdmin, string[]> = {
  verificacion: ['gestion_casos', 'verificacion', 'busqueda', 'busqueda_nna', 'enlace_contacto'],
  redes: ['redaccion', 'redes_sociales', 'diseno_grafico', 'edicion_video', 'influencers'],
  logistica: ['gestion_acopio'],
  digitalizacion: ['digitalizacion'],
};
/** Roles funcionales de cada área (para el selector acotado y deducir el área de un usuario). */
export const ROLES_POR_AREA_ADMIN: Record<AreaAdmin, Rol[]> = {
  verificacion: ['recopilacion', 'verificador', 'busqueda', 'buscador_nna', 'enlace_contacto'],
  redes: ['redaccion', 'redes_sociales', 'diseno_grafico', 'edicion_video', 'influencers'],
  logistica: ['logistica'],
  digitalizacion: ['digitalizador'],
};
/** Opciones de área que se ofrecen en el registro (a qué área desea postular). */
export const AREAS_REGISTRO: { valor: 'verificacion' | 'redes' | 'logistica' | 'digitalizacion' | 'general'; etiqueta: string; ayuda: string }[] = [
  { valor: 'verificacion', etiqueta: 'Verificación y búsqueda de personas',
    ayuda: 'Gestión de casos, verificación, búsqueda de personas (incluye menores/NNA) y enlace con familias.' },
  { valor: 'digitalizacion', etiqueta: 'Digitalización de listados',
    ayuda: 'Capturar listas de personas de hospitales y albergues (foto/OCR, a mano o CSV) y ubicarlas en el mapa.' },
  { valor: 'redes', etiqueta: 'Redes sociales y contenido',
    ayuda: 'Redacción, diseño gráfico, edición de video, community management e influencers.' },
  { valor: 'logistica', etiqueta: 'Logística y acopio',
    ayuda: 'Centros de acopio (inventario, donaciones, traspasos), insumos y respuesta a solicitudes de ayuda con ubicación en el mapa.' },
  { valor: 'general', etiqueta: 'Voluntariado general / otra área',
    ayuda: 'Apoyo y otras áreas. La coordinación te ubicará según tu perfil.' },
];

// ── País desde el que ayuda cada persona (para su zona horaria y planificación) ──
// Se guarda el código ISO 3166-1 alfa-2 (p. ej. 'VE'). `utc` es un desfase
// representativo aproximado (algunos países cambian con horario de verano).
// Orden alfabético por nombre; 'ZZ' = «Otro país» como válvula de escape.
export const PAISES: { codigo: string; nombre: string; utc: string }[] = [
  { codigo: 'DE', nombre: 'Alemania', utc: 'UTC+1' },
  { codigo: 'AR', nombre: 'Argentina', utc: 'UTC−3' },
  { codigo: 'AU', nombre: 'Australia', utc: 'UTC+10' },
  { codigo: 'BE', nombre: 'Bélgica', utc: 'UTC+1' },
  { codigo: 'BO', nombre: 'Bolivia', utc: 'UTC−4' },
  { codigo: 'BR', nombre: 'Brasil', utc: 'UTC−3' },
  { codigo: 'CA', nombre: 'Canadá', utc: 'UTC−5' },
  { codigo: 'CL', nombre: 'Chile', utc: 'UTC−3' },
  { codigo: 'CN', nombre: 'China', utc: 'UTC+8' },
  { codigo: 'CO', nombre: 'Colombia', utc: 'UTC−5' },
  { codigo: 'CR', nombre: 'Costa Rica', utc: 'UTC−6' },
  { codigo: 'CU', nombre: 'Cuba', utc: 'UTC−5' },
  { codigo: 'EC', nombre: 'Ecuador', utc: 'UTC−5' },
  { codigo: 'SV', nombre: 'El Salvador', utc: 'UTC−6' },
  { codigo: 'AE', nombre: 'Emiratos Árabes Unidos', utc: 'UTC+4' },
  { codigo: 'ES', nombre: 'España', utc: 'UTC+1' },
  { codigo: 'US', nombre: 'Estados Unidos', utc: 'UTC−5' },
  { codigo: 'FR', nombre: 'Francia', utc: 'UTC+1' },
  { codigo: 'GT', nombre: 'Guatemala', utc: 'UTC−6' },
  { codigo: 'HT', nombre: 'Haití', utc: 'UTC−5' },
  { codigo: 'HN', nombre: 'Honduras', utc: 'UTC−6' },
  { codigo: 'IE', nombre: 'Irlanda', utc: 'UTC+0' },
  { codigo: 'IT', nombre: 'Italia', utc: 'UTC+1' },
  { codigo: 'JP', nombre: 'Japón', utc: 'UTC+9' },
  { codigo: 'MX', nombre: 'México', utc: 'UTC−6' },
  { codigo: 'NI', nombre: 'Nicaragua', utc: 'UTC−6' },
  { codigo: 'NO', nombre: 'Noruega', utc: 'UTC+1' },
  { codigo: 'PA', nombre: 'Panamá', utc: 'UTC−5' },
  { codigo: 'PY', nombre: 'Paraguay', utc: 'UTC−4' },
  { codigo: 'NL', nombre: 'Países Bajos', utc: 'UTC+1' },
  { codigo: 'PE', nombre: 'Perú', utc: 'UTC−5' },
  { codigo: 'PT', nombre: 'Portugal', utc: 'UTC+0' },
  { codigo: 'PR', nombre: 'Puerto Rico', utc: 'UTC−4' },
  { codigo: 'GB', nombre: 'Reino Unido', utc: 'UTC+0' },
  { codigo: 'DO', nombre: 'República Dominicana', utc: 'UTC−4' },
  { codigo: 'SE', nombre: 'Suecia', utc: 'UTC+1' },
  { codigo: 'CH', nombre: 'Suiza', utc: 'UTC+1' },
  { codigo: 'TR', nombre: 'Turquía', utc: 'UTC+3' },
  { codigo: 'TT', nombre: 'Trinidad y Tobago', utc: 'UTC−4' },
  { codigo: 'UY', nombre: 'Uruguay', utc: 'UTC−3' },
  { codigo: 'VE', nombre: 'Venezuela', utc: 'UTC−4' },
  { codigo: 'ZZ', nombre: 'Otro país', utc: '' },
];
const MAPA_PAIS: Record<string, { codigo: string; nombre: string; utc: string }> =
  Object.fromEntries(PAISES.map((p) => [p.codigo, p]));
/** Nombre del país a partir del código (o el propio código si no está en la lista). */
export function etiquetaPais(codigo?: string | null): string {
  if (!codigo) return '';
  return MAPA_PAIS[codigo]?.nombre ?? codigo;
}
/** Zona horaria representativa (desfase UTC) del país, para planificar. */
export function zonaPais(codigo?: string | null): string {
  return codigo ? (MAPA_PAIS[codigo]?.utc ?? '') : '';
}
/** Bandera emoji a partir del código ISO alfa-2 (símbolos indicadores regionales). */
export function banderaPais(codigo?: string | null): string {
  if (!codigo || codigo.length !== 2 || codigo === 'ZZ') return codigo === 'ZZ' ? '🌍' : '';
  const base = 0x1f1e6, A = 'A'.charCodeAt(0);
  return String.fromCodePoint(...[...codigo.toUpperCase()].map((c) => base + c.charCodeAt(0) - A));
}
const NORM_PAIS = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
const PAIS_POR_NOMBRE: Record<string, string> = Object.fromEntries(PAISES.map((p) => [NORM_PAIS(p.nombre), p.codigo]));
/** Interpreta un texto como país: código ISO ('VE') o nombre ('Venezuela'/'venezuela'/'perú'). Devuelve el código o null. */
export function codigoPais(entrada?: string | null): string | null {
  if (!entrada) return null;
  const t = entrada.trim();
  if (!t) return null;
  const up = t.toUpperCase();
  if (MAPA_PAIS[up]) return up;
  return PAIS_POR_NOMBRE[NORM_PAIS(t)] ?? null;
}

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
  pendiente: 'Pendiente', en_proceso: 'En proceso', confirmado: 'Confirmado y activo', falso: 'Falso / descartado',
  enviado_redaccion: 'Enviado a Redacción', resuelto: 'Resuelto / atendido',
};
export const ESTADOS_CASO: EstadoCaso[] = ['pendiente', 'en_proceso', 'confirmado', 'falso', 'enviado_redaccion', 'resuelto'];
// Categorías vigentes al crear/verificar (los casos viejos conservan la suya).
export const CATEGORIAS_CASO = ['Desaparecidos', 'Otras informaciones'];

// ── Digitalización de listados de personas (OCR) ──
export const TIPOS_LUGAR = ['hospital', 'albergue', 'acopio', 'otro'] as const;
export const ETIQUETA_TIPO_LUGAR: Record<string, string> = {
  hospital: 'Hospital',
  albergue: 'Albergue',
  acopio: 'Centro de acopio',
  otro: 'Otro lugar',
};
export const ETIQUETA_ESTADO_LUGAR: Record<string, string> = {
  pendiente_llenado: 'Pendiente de llenado',
  pendiente_verificar: 'Pendiente de verificar',
  verificado: 'Verificado',
};
export const CONDICIONES_PERSONA = ['herido', 'refugiado', 'fallecido', 'sano', 'desconocida', 'otro'] as const;
export const ETIQUETA_CONDICION: Record<string, string> = {
  herido: 'Herido',
  refugiado: 'Refugiado / Damnificado',
  fallecido: 'Fallecido',
  sano: 'Sano y salvo',
  desconocida: 'Desconocida',
  otro: 'Otro',
};

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

// ── Grupo de Búsqueda (metodología de desaparecidos) ──
export const ETIQUETA_ESTADO_BUSQUEDA: Record<EstadoBusqueda, string> = {
  activo: 'Activo',
  en_revision: 'En revisión',
  coincidencia_pendiente: 'Coincidencia pendiente',
  coincidencia_aprobada: 'Coincidencia aprobada',
  cierre_pendiente: 'Cierre por confirmar',
  encontrado_fallecido: 'Encontrado sin vida',
  reunificado: 'Reunificado',
  derivado_autoridad: 'Derivado a autoridad',
  descartado: 'Descartado',
};
/** Columnas del tablero, en orden del flujo (las de cierre se agrupan al final). */
export const ESTADOS_BUSQUEDA: EstadoBusqueda[] = [
  'activo', 'en_revision', 'coincidencia_pendiente', 'coincidencia_aprobada', 'derivado_autoridad',
  'cierre_pendiente', 'reunificado', 'encontrado_fallecido', 'descartado',
];
/** Estados de cierre (fin del flujo). */
export const ESTADOS_BUSQUEDA_CIERRE: EstadoBusqueda[] = ['reunificado', 'derivado_autoridad', 'encontrado_fallecido', 'descartado'];
export function claseEstadoBusqueda(e: EstadoBusqueda): string {
  if (e === 'reunificado') return 'ok';
  if (e === 'coincidencia_aprobada') return 'info';
  if (e === 'coincidencia_pendiente' || e === 'en_revision' || e === 'cierre_pendiente') return 'aviso';
  if (e === 'encontrado_fallecido' || e === 'derivado_autoridad') return 'critica';
  return ''; // activo / descartado → neutro
}
/** Situación del caso de desaparecido (intake). Enruta y prioriza. */
export const ETIQUETA_SITUACION_BUSQUEDA: Record<string, string> = {
  reportado: 'Desaparición reportada',
  hospitalizado: 'Hospitalizado',
  refugio: 'En refugio / albergue',
  fallecido: 'Reporte de fallecimiento',
  no_identificado: 'Persona no identificada',
};
export const SITUACIONES_BUSQUEDA: { valor: string; etiqueta: string }[] =
  Object.entries(ETIQUETA_SITUACION_BUSQUEDA).map(([valor, etiqueta]) => ({ valor, etiqueta }));

/** Sexo de la persona (intake). */
export const SEXOS: { valor: string; etiqueta: string }[] = [
  { valor: 'm', etiqueta: 'Masculino' }, { valor: 'f', etiqueta: 'Femenino' }, { valor: 'otro', etiqueta: 'Otro' },
];
export const ETIQUETA_SEXO: Record<string, string> = { m: 'Masculino', f: 'Femenino', otro: 'Otro' };

/** Resultado de una gestión/consulta de la bitácora de búsqueda. */
export const RESULTADOS_BUSQUEDA: { valor: string; etiqueta: string }[] = [
  { valor: 'no_encontrado', etiqueta: 'No encontrado' },
  { valor: 'dudoso', etiqueta: 'Coincidencia dudosa' },
  { valor: 'encontrado', etiqueta: 'Encontrado / coincide' },
];
export const ETIQUETA_RESULTADO_BUSQUEDA: Record<string, string> = {
  no_encontrado: 'No encontrado', dudoso: 'Coincidencia dudosa', encontrado: 'Encontrado / coincide',
};
export function claseResultadoBusqueda(r?: string | null): string {
  if (r === 'encontrado') return 'ok';
  if (r === 'dudoso') return 'aviso';
  if (r === 'no_encontrado') return '';
  return '';
}
export const TIPOS_CONTACTO_BUSQUEDA = ['Consulta', 'Llamada', 'Presencial', 'Mensaje', 'Otro'];
/** Mínimo de fuentes a verificar antes de escalar una coincidencia (según el manual). */
export const MIN_FUENTES_BUSQUEDA = 3;

export const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente', asignada: 'Asignada', en_progreso: 'En progreso',
  bloqueada: 'Bloqueada', completada: 'Completada', cancelada: 'Cancelada',
};

export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

// Roles cuyo trabajo maneja datos sensibles y por eso EXIGEN la 2ª verificación
// (identidad aprobada) antes de operar. La RLS lo impone; esto es para la UI/avisos.
// El admin queda exento. (enlace_contacto se sumará en la Fase 3 de Búsqueda.)
export const ROLES_SEGUNDA_VERIFICACION: Rol[] = ['recopilacion', 'busqueda', 'buscador_nna', 'enlace_contacto', 'digitalizador'];

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
