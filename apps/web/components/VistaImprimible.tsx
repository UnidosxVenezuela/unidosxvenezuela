import Link from 'next/link';
import Icono from '@/components/Icono';
import BotonImprimir from '@/components/BotonImprimir';
import { fechaHora } from '@/lib/fechas';
import type { Columna } from '@/lib/csv';

/**
 * Vista imprimible (→ PDF con «Imprimir → Guardar como PDF») de un listado. Comparte
 * las columnas con la descarga CSV, así que ambas muestran lo mismo. Incluye un botón
 * para descargar el CSV y una nota de uso responsable. La cabecera y la nota llevan
 * `no-print` para no salir en el PDF.
 */
export default function VistaImprimible<T extends { id?: string }>(
  { titulo, subtitulo, volverHref, csvHref, columnas, filas }:
  { titulo: string; subtitulo?: string; volverHref: string; csvHref: string; columnas: Columna<T>[]; filas: T[] },
) {
  return (
    <div>
      <div className="pagina-cab no-print">
        <Link href={volverHref} className="muted">← Volver</Link>
        <div className="fila" style={{ gap: 8 }}>
          <a className="btn" href={csvHref}><Icono nombre="documento" size={16} /> Descargar CSV</a>
          <BotonImprimir label="Imprimir / PDF" />
        </div>
      </div>

      <div className="tarjeta">
        <h1 style={{ marginTop: 0 }}>{titulo}</h1>
        <p className="muted sub">
          {subtitulo ? subtitulo + ' · ' : ''}{filas.length} registro(s) · Generado {fechaHora(new Date())}
        </p>
        <p className="muted no-print" style={{ fontSize: '.82rem', border: '1px solid var(--borde)', borderRadius: 8, padding: '8px 10px' }}>
          <Icono nombre="llave" size={13} /> Información de uso interno. No publiques ni compartas contactos ni
          evidencias sin autorización. Esta descarga/impresión queda registrada.
        </p>
        {filas.length === 0 ? (
          <p className="muted">Sin registros para exportar con estos filtros.</p>
        ) : (
          <div className="tabla-scroll"><table>
            <thead><tr>{columnas.map((c) => <th key={c.encabezado}>{c.encabezado}</th>)}</tr></thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.id ?? i}>
                  {columnas.map((c) => {
                    const v = c.valor(f);
                    return <td key={c.encabezado}>{v === '' || v == null ? '—' : String(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
