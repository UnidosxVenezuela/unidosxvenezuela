// Espejo en la app del catálogo de ámbitos de `public.hilos` (migración 0231).
// La BASE es la fuente de verdad: el CHECK de `hilos.ambito` manda y la RLS decide quién
// lee. Esto solo sirve para saber qué etiqueta pintar y a dónde enlazar.

export type AmbitoHilo = 'caso' | 'insumo' | 'tarea' | 'grupo' | 'general';

type MetaAmbito = {
  /** Cómo se llama la conversación en pantalla. */
  titulo: string;
  /** Frase de ayuda bajo el título: dice QUIÉN lee, que es lo que la gente necesita saber. */
  quienLee: string;
  /** Qué se pone en la lista vacía. */
  vacio: string;
  /** Ruta del ancla, para volver desde la bandeja. */
  ruta: (anclaId: string) => string;
};

export const AMBITOS_HILO: Record<AmbitoHilo, MetaAmbito> = {
  general: {
    titulo: 'Conversación general',
    quienLee: 'La lee toda la organización. Para lo que cruza a varios equipos.',
    vacio: 'Aquí se habla de lo que afecta a todos: cortes de transporte, faltantes, quién puede echar una mano.',
    // No cuelga de ninguna entidad, así que tiene página propia.
    ruta: () => '/conversaciones/general',
  },
  caso: {
    titulo: 'Conversación de la solicitud',
    quienLee: 'La lee quien ya puede ver esta solicitud. Nadie más.',
    vacio: 'Aquí va lo que se habla de esta solicitud, en vez de en un grupo de WhatsApp.',
    ruta: (id) => '/casos/' + id,
  },
  insumo: {
    titulo: 'Conversación de la entrega',
    quienLee: 'La lee Logística y, en modo consulta, Alianzas Estratégicas.',
    vacio: 'Aquí se coordina esta entrega: qué falta, quién lo tiene, cuándo sale.',
    ruta: (id) => '/insumos/' + id,
  },
  tarea: {
    titulo: 'Conversación de la tarea',
    quienLee: 'La lee quien participa en la tarea o pertenece a su grupo.',
    vacio: 'Aquí se coordina esta tarea.',
    ruta: (id) => '/tareas/' + id,
  },
  grupo: {
    titulo: 'Conversación del grupo',
    quienLee: 'La lee el equipo de este grupo.',
    vacio: 'Aquí habla el equipo. Para hablar de una solicitud concreta, mejor en su propia conversación.',
    ruta: (id) => '/grupos/' + id,
  },
};

export function esAmbitoHilo(v: string | null | undefined): v is AmbitoHilo {
  return v === 'caso' || v === 'insumo' || v === 'tarea' || v === 'grupo' || v === 'general';
}

/** Etiquetas de `hilo_mensajes.pii_alerta`, tal como las produce detectar_datos_sensibles(). */
export const ETIQUETA_PII: Record<string, string> = {
  cedula_ve: 'una cédula',
  movil_ve: 'un teléfono venezolano',
  movil_co: 'un teléfono colombiano',
  correo: 'un correo',
  coordenadas: 'unas coordenadas exactas',
};

/**
 * Frase de aviso para un mensaje que trae datos sensibles.
 * Se muestra ANTES de enviar (en el redactor) y junto al mensaje ya enviado.
 * No bloquea: en una emergencia impedir un mensaje hace más daño que registrarlo.
 */
export function avisoPii(etiquetas: string[] | null | undefined): string | null {
  const l = (etiquetas ?? []).map((e) => ETIQUETA_PII[e]).filter(Boolean);
  if (l.length === 0) return null;
  const lista = l.length === 1 ? l[0] : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1];
  return 'Parece que hay ' + lista + '. Aquí está bien: es su sitio. Lo que no conviene es sacarlo de la plataforma.';
}

/** Un mensaje tal como lo devuelve la consulta y lo consume el componente en vivo. */
export type MensajeHilo = {
  id: string;
  hilo_id: string;
  autor_id: string | null;
  autor_sello: string;
  cuerpo: string;
  pii_alerta: string[] | null;
  /** Id de STICKERS (lib/stickers.tsx) cuando el mensaje es un sticker. */
  sticker?: string | null;
  editado_en: string | null;
  creado_en: string;
};
