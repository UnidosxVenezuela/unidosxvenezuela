import { presenciaEfectiva, ETIQUETA_PRESENCIA, haceCuanto } from '@/lib/presencia';

/**
 * Etiqueta de presencia (0117): punto de color + estado efectivo + «hace cuánto» fue
 * el último latido. El estado EFECTIVO lo calcula `presenciaEfectiva`: si no hubo
 * latido reciente, sale «Desconectado» aunque su elección guardada sea conectado/ocupado.
 * Server Component (se recalcula en cada render/refresco de la página).
 */
export default function PresenciaTag({
  estado, ultima, mostrarCuando = true,
}: { estado?: string | null; ultima?: string | null; mostrarCuando?: boolean }) {
  const p = presenciaEfectiva(estado, ultima);
  return (
    <span className="presencia-tag" title={ETIQUETA_PRESENCIA[p] + (ultima ? ' · ' + haceCuanto(ultima) : '')}>
      <span className={'presencia-punto ' + p} aria-hidden />
      <span>{ETIQUETA_PRESENCIA[p]}</span>
      {mostrarCuando && p === 'desconectado' && (
        <span className="presencia-cuando">{haceCuanto(ultima)}</span>
      )}
    </span>
  );
}
