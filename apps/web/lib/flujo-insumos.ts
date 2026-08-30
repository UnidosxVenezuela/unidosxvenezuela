// Reparto del flujo de insumos por área (migración 0241).
//
// Espejo EXACTO de `public.area_de_estado_insumo()`. Si los dos dejan de decir lo mismo, la
// pantalla ofrece un botón que la base de datos rechaza — que es peor que no ofrecerlo.
//
// LA REGLA: manda el área dueña del estado de DESTINO. Así `solicitado → en_gestion` lo da
// Verificación y Gestión, y `en_gestion → en_ruta` lo TOMA Logística.
import { puedeLogistica, puedeGestionCasos } from '@/lib/auth';

// `EntradaRoles` no se exporta desde lib/auth; se acepta lo mismo que aceptan los helpers.
type Perfil = Parameters<typeof puedeLogistica>[0];

export type AreaFlujo = 'gestion' | 'logistica';

/** De qué área es cada estado. Espejo de `area_de_estado_insumo` (0241). */
export function areaDeEstadoInsumo(estado?: string | null): AreaFlujo {
  switch (String(estado ?? '').toLowerCase()) {
    case 'en_ruta':
    case 'entregado':
      return 'logistica';
    // solicitado · en_gestion · cancelado · no_disponible, y cualquier estado futuro sin
    // repartir: del área eje, que es la dueña de la entrada.
    default:
      return 'gestion';
  }
}

export const ETIQUETA_AREA_FLUJO: Record<AreaFlujo, string> = {
  gestion: 'Verificación y Gestión de Casos',
  logistica: 'Logística',
};

/** ¿Puede esta persona LLEVAR una solicitud a ese estado? Espejo de `puede_mover_solicitud_a`. */
export function puedeMoverSolicitudA(perfil: Perfil, estado?: string | null): boolean {
  return areaDeEstadoInsumo(estado) === 'logistica'
    ? puedeLogistica(perfil)
    : puedeGestionCasos(perfil);
}

/** ¿Le toca a esta persona trabajar una solicitud que está en ese estado? */
export function trabajaEstado(perfil: Perfil, estado?: string | null): boolean {
  return areaDeEstadoInsumo(estado) === 'logistica'
    ? puedeLogistica(perfil)
    : puedeGestionCasos(perfil);
}

/** Mensaje para cuando el botón no es tuyo. Dice de quién es, que es lo que hace falta saber. */
export function deQuienEsElPaso(estado?: string | null): string {
  return ETIQUETA_AREA_FLUJO[areaDeEstadoInsumo(estado)];
}
