import Link from 'next/link';
import Icono from './Icono';

/**
 * Estado vacío guiado: ícono + título + texto de ayuda + (opcional) botón de
 * acción. Reemplaza los "no hay nada" sueltos por un mensaje cálido que dice
 * qué hacer a continuación.
 */
export default function EstadoVacio({ icono = 'documento', titulo, texto, accion }: {
  icono?: string;
  titulo: string;
  texto?: string;
  accion?: { href: string; etiqueta: string; icono?: string };
}) {
  return (
    <div className="tarjeta vacio">
      <Icono nombre={icono} size={42} />
      <h3 style={{ margin: '10px 0 4px' }}>{titulo}</h3>
      {texto && <p className="muted" style={{ margin: '0 auto', maxWidth: 440 }}>{texto}</p>}
      {accion && (
        <Link href={accion.href} className="btn btn-primario" style={{ marginTop: 14 }}>
          <Icono nombre={accion.icono ?? 'mas'} size={16} /> {accion.etiqueta}
        </Link>
      )}
    </div>
  );
}
