// Espejo en la app del vocabulario del Gestor Integral de Casos (migración 0239).
import type { TonoPill } from '@/components/Pill';

/** Situaciones que devuelve `casos_gestion_control()`. El orden es el de gravedad. */
export const SITUACIONES_GESTION = ['sin_gestor', 'bloqueado', 'vencido', 'sin_proxima', 'por_cerrar'] as const;
export type SituacionGestion = (typeof SITUACIONES_GESTION)[number];

export const ETIQUETA_SITUACION: Record<SituacionGestion, string> = {
  sin_gestor:  'Sin responsable',
  bloqueado:   'Bloqueado',
  vencido:     'Fecha vencida',
  sin_proxima: 'Sin próxima acción',
  por_cerrar:  'Listo para cerrar',
};

/** Qué hay que hacer con cada una. Un reporte que no dice la acción no se usa. */
export const QUE_HACER: Record<SituacionGestion, string> = {
  sin_gestor:  'Asígnale un gestor. Mientras no lo tenga, nadie responde por este caso.',
  bloqueado:   'Espera un dato que se pidió y no llegó. Hay que ir a buscar a quien lo debe.',
  vencido:     'La fecha de seguimiento ya pasó. Revísalo y fija la siguiente.',
  sin_proxima: 'Tiene dueño pero no dice qué toca ahora. Escríbelo en una frase.',
  por_cerrar:  'El desglose está cubierto al 100 %. Valida el resultado y ciérralo.',
};

export const TONO_SITUACION: Record<SituacionGestion, TonoPill> = {
  sin_gestor:  'critica',
  bloqueado:   'critica',
  vencido:     'alta',
  sin_proxima: 'aviso',
  por_cerrar:  'ok',
};

export function esSituacionGestion(v: string): v is SituacionGestion {
  return (SITUACIONES_GESTION as readonly string[]).includes(v);
}

/** Áreas a las que puede apuntar la próxima acción (espejo del CHECK de 0239). */
export const AREAS_SIGUIENTE = [
  'verificacion', 'recopilacion', 'logistica', 'redes', 'donaciones', 'alianzas', 'coordinacion', 'otra',
] as const;

export const ETIQUETA_AREA_SIGUIENTE: Record<string, string> = {
  verificacion: 'Verificación y Gestión de Casos',
  recopilacion: 'Recopilación',
  logistica:    'Logística',
  redes:        'Redacción y Redes',
  donaciones:   'Donaciones',
  alianzas:     'Alianzas Estratégicas',
  coordinacion: 'Coordinación',
  otra:         'Otra',
};

/** Cuánto falta (o cuánto lleva vencida) una fecha de seguimiento, en lenguaje llano. */
export function cuantoFalta(fecha?: string | null): { texto: string; vencido: boolean } | null {
  if (!fecha) return null;
  const ms = new Date(fecha).getTime() - Date.now();
  const vencido = ms < 0;
  const h = Math.round(Math.abs(ms) / 3600000);
  const texto = h < 1 ? 'menos de una hora'
    : h < 24 ? h + ' h'
    : Math.round(h / 24) + ' día' + (Math.round(h / 24) === 1 ? '' : 's');
  return { texto: vencido ? 'vencida hace ' + texto : 'en ' + texto, vencido };
}

// ── Solicitudes de información (0240) ──
export const ESTADOS_INFO = ['abierta', 'respondida', 'cerrada'] as const;
export type EstadoInfo = (typeof ESTADOS_INFO)[number];

export const ETIQUETA_ESTADO_INFO: Record<EstadoInfo, string> = {
  abierta:    'Esperando',
  respondida: 'Respondida',
  cerrada:    'Cerrada',
};

export const TONO_ESTADO_INFO: Record<EstadoInfo, TonoPill> = {
  abierta:    'aviso',
  respondida: 'info',
  cerrada:    'ok',
};

// ── Cierre con criterios (0243) ──
export const ETIQUETA_CRITERIO: Record<string, string> = {
  desglose:         'Desglose cubierto',
  entrega:          'Entrega registrada',
  evidencia:        'Evidencia adjunta',
  sin_peticiones:   'Sin peticiones abiertas',
  sin_derivaciones: 'Sin áreas con trabajo abierto',
};
