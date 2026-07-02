import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_TIPO_INSUMO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonImprimir from '@/components/BotonImprimir';

const fmt = (n: any) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','); };

export default async function ImprimirInventarioPage({ params }: { params: { id: string } }) {
  await requireUsuario();
  const supabase = await createClient();
  const id = params.id;

  const { data: ok } = await supabase.rpc('puede_gestionar_acopio', { p_punto: id });
  if (!ok) redirect('/acopio/' + id);

  const [{ data: centro }, { data: inv }] = await Promise.all([
    supabase.from('puntos_acopio').select('nombre, direccion, horario').eq('id', id).single(),
    supabase.from('inventario_acopio').select('*').eq('punto_id', id).order('categoria').order('producto'),
  ]);
  if (!centro) return <div className="tarjeta"><h2>Centro no encontrado</h2><Link href="/acopio">Volver</Link></div>;
  const inventario = (inv ?? []) as any[];
  const total = inventario.reduce((s, i) => s + Number(i.cantidad || 0), 0);

  return (
    <div>
      <div className="pagina-cab no-print">
        <Link href={'/acopio/' + id} className="muted">← Volver al centro</Link>
        <div className="fila" style={{ gap: 8 }}>
          <a className="btn" href={'/acopio/' + id + '/export'}><Icono nombre="documento" size={16} /> Descargar CSV</a>
          <BotonImprimir />
        </div>
      </div>

      <div className="tarjeta">
        <h1 style={{ marginTop: 0 }}>Inventario — {centro.nombre}</h1>
        <p className="muted sub">
          {[centro.direccion, centro.horario].filter(Boolean).join(' · ')}
          {centro.direccion || centro.horario ? ' · ' : ''}Generado {fechaHora(new Date())}
        </p>
        {inventario.length === 0 ? (
          <p className="muted">Sin productos registrados.</p>
        ) : (
          <table style={{ width: '100%' }}>
            <thead><tr><th>Producto</th><th>Categoría</th><th>Código</th><th style={{ textAlign: 'right' }}>Cantidad</th><th>Unidad</th><th>Mínimo</th></tr></thead>
            <tbody>
              {inventario.map((it) => (
                <tr key={it.id}>
                  <td>{it.producto}</td>
                  <td>{it.categoria ? (ETIQUETA_TIPO_INSUMO[it.categoria] ?? it.categoria) : '—'}</td>
                  <td>{it.codigo || '—'}</td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(it.cantidad)}</strong></td>
                  <td>{it.unidad || '—'}</td>
                  <td>{Number(it.minimo) > 0 ? fmt(it.minimo) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3}><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{fmt(total)}</strong></td><td colSpan={2}>en {inventario.length} productos</td></tr></tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
