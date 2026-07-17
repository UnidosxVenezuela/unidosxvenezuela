import Link from 'next/link';
import Icono from './Icono';
import { tinteTile } from '@/lib/tintes';

/**
 * Tarjeta de acción rápida del panel: ícono + título + descripción + flecha.
 * Lleva a la acción más común del usuario en un toque. El tinte hex histórico
 * se traduce a tokens del tema (claro/oscuro) vía tinteTile.
 */
export default function AccionRapida({ href, titulo, descripcion, icono, color, tinte }: {
  href: string; titulo: string; descripcion: string; icono: string; color: string; tinte: string;
}) {
  return (
    <Link href={href} className="accion-rapida tarjeta">
      <span className="accion-ico" style={tinteTile(tinte, color)}><Icono nombre={icono} size={21} /></span>
      <span className="accion-txt">
        <strong>{titulo}</strong>
        <span className="muted">{descripcion}</span>
      </span>
      <span className="accion-flecha"><Icono nombre="flecha" size={17} /></span>
    </Link>
  );
}
