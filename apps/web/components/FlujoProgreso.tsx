/**
 * Barra de progreso del flujo: `total` segmentos que muestran en qué paso está algo
 * —los pasos hechos en azul, el actual en amarillo, los pendientes en gris; si algo
 * se salió del flujo (p. ej. una solicitud descartada), el primer segmento va en rojo;
 * si el flujo se completó (`completo`), todos van en verde—. Reutilizable en Solicitudes
 * (5 pasos), Logística (4 pasos) y cualquier pipeline. Solo presentación: sin estado ni
 * cliente. La barra es decorativa (aria-hidden) y la etiqueta de texto es la que comunica
 * el paso a lectores de pantalla.
 */
export default function FlujoProgreso({ paso, total, etiqueta, fuera = false, completo = false, compacto = false }: {
  paso: number;
  total: number;
  etiqueta?: string;
  fuera?: boolean;
  completo?: boolean;
  compacto?: boolean;
}) {
  const clase = (i: number) => {
    if (fuera) return i === 0 ? 'fuera' : '';
    if (completo) return 'completo';
    if (i < paso - 1) return 'hecho';
    if (i === paso - 1) return 'actual';
    return '';
  };
  return (
    <div className={'flujo-prog-wrap' + (compacto ? ' compacto' : '')}>
      <div className="flujo-prog" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => <span key={i} className={clase(i)} />)}
      </div>
      {etiqueta && <div className={'flujo-prog-et' + (fuera ? ' fuera' : '') + (completo ? ' completo' : '')}>{etiqueta}</div>}
    </div>
  );
}
