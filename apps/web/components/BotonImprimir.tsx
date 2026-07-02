'use client';
import Icono from '@/components/Icono';

/** Abre el diálogo de impresión del navegador (imprimir o guardar como PDF). */
export default function BotonImprimir({ label = 'Imprimir' }: { label?: string }) {
  return (
    <button className="btn btn-primario no-print" type="button" onClick={() => window.print()}>
      <Icono nombre="documento" size={16} /> {label}
    </button>
  );
}
