import QRCode from 'qrcode';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_INSUMO } from '@/lib/constantes';
import BotonImprimir from '@/components/BotonImprimir';

const fmt = (n: any) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','); };

export default async function EtiquetasPage({ params }: { params: { id: string } }) {
  await requireUsuario();
  const supabase = await createClient();
  const id = params.id;

  const { data: ok } = await supabase.rpc('puede_gestionar_acopio', { p_punto: id });
  if (!ok) redirect('/acopio/' + id);

  const [{ data: centro }, { data: inv }] = await Promise.all([
    supabase.from('puntos_acopio').select('nombre').eq('id', id).single(),
    supabase.from('inventario_acopio').select('*').eq('punto_id', id).order('producto'),
  ]);
  if (!centro) return <div className="tarjeta"><h2>Centro no encontrado</h2><Link href="/acopio">Volver</Link></div>;
  const inventario = (inv ?? []) as any[];

  const host = headers().get('host') || 'unidosxvnezuela.com';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const base = `${proto}://${host}`;

  // Un QR por producto: al escanearlo, abre el inventario filtrado a ese producto
  // (listo para ajustar su cantidad desde el teléfono).
  const etiquetas = await Promise.all(inventario.map(async (it) => ({
    it,
    qr: await QRCode.toDataURL(`${base}/acopio/${id}?q=${encodeURIComponent(it.producto)}`, { width: 200, margin: 1 }),
  })));

  return (
    <div>
      <div className="pagina-cab no-print">
        <Link href={'/acopio/' + id} className="muted">← Volver al centro</Link>
        <BotonImprimir label="Imprimir etiquetas" />
      </div>
      <div className="no-print">
        <h1>Etiquetas QR — {centro.nombre}</h1>
        <p className="muted sub">Imprime, recorta y pega cada etiqueta en su estante o caja. Al escanearla con el teléfono se abre ese producto en el inventario, listo para sumar o descontar.</p>
      </div>
      <div className="solo-impresion"><h2 style={{ margin: '0 0 10px' }}>Etiquetas — {centro.nombre}</h2></div>

      {etiquetas.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Sin productos para etiquetar todavía.</p></div>
      ) : (
        <div className="etiquetas-grid">
          {etiquetas.map(({ it, qr }) => (
            <div key={it.id} className="etiqueta-qr">
              <img src={qr} alt={'QR de ' + it.producto} />
              <div className="et-nombre">{it.producto}</div>
              <div className="et-sub">{it.categoria ? (ETIQUETA_TIPO_INSUMO[it.categoria] ?? it.categoria) : ''}{it.codigo ? ' · ' + it.codigo : ''}</div>
              <div className="et-sub">Actual: {fmt(it.cantidad)} {it.unidad || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
