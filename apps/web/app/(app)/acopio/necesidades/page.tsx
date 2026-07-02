import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaCorta } from '@/lib/fechas';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_URGENCIA, claseUrgencia } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';

const fmt = (n: any) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','); };
const ORDEN: Record<string, number> = { alta: 0, media: 1, baja: 2 };

// Panel global de necesidades: reúne, en un solo lugar y priorizadas, todas las
// necesidades urgentes marcadas en los centros y los productos bajo mínimo.
export default async function NecesidadesGlobalPage() {
  const { perfil } = await requireUsuario();
  const supabase = await createClient();
  const { data: lider, error } = await supabase.rpc('es_lider_acopio');
  const rolesG = [perfil?.rol, ...((perfil?.roles_extra as string[] | null) ?? [])];
  const acceso = error ? (rolesG.includes('admin') || rolesG.includes('logistica')) : !!lider;
  if (!acceso) redirect('/dashboard');

  const [{ data: nec }, { data: inv }] = await Promise.all([
    supabase.from('necesidades_acopio').select('*, puntos_acopio(nombre)').eq('resuelta', false),
    supabase.from('inventario_acopio').select('*, puntos_acopio(nombre)').gt('minimo', 0),
  ]);

  const necesidades = ((nec ?? []) as any[]).sort((a, b) =>
    ((ORDEN[a.urgencia] ?? 1) - (ORDEN[b.urgencia] ?? 1)) ||
    String(b.creado_en).localeCompare(String(a.creado_en)));
  const bajoStock = ((inv ?? []) as any[])
    .filter((i) => Number(i.cantidad) <= Number(i.minimo))
    .sort((a, b) => Number(a.cantidad) - Number(b.cantidad));

  const conteo = { alta: 0, media: 0, baja: 0 };
  for (const n of necesidades) { const u = String(n.urgencia); if (u === 'alta' || u === 'media' || u === 'baja') conteo[u] += 1; }

  return (
    <div>
      <RealtimeRefrescar tabla="necesidades_acopio" />
      <RealtimeRefrescar tabla="inventario_acopio" />
      <Link href="/acopio" className="muted">← Centros de acopio</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="avisos" size={24} /> Necesidades — panel global</h1>
          <p className="muted sub">Todo lo que hace falta ahora mismo en los centros, priorizado. Toca un centro para gestionarlo.</p>
        </div>
        <div className="fila" style={{ gap: 6 }}>
          {conteo.alta > 0 && <Pill tono="critica" punto={false}>{conteo.alta} urgentes</Pill>}
          {conteo.media > 0 && <Pill tono="aviso" punto={false}>{conteo.media} media</Pill>}
          {conteo.baja > 0 && <Pill tono="ok" punto={false}>{conteo.baja} baja</Pill>}
        </div>
      </div>

      <h2 className="fila" style={{ gap: 6 }}><Icono nombre="avisos" size={20} /> Necesidades marcadas</h2>
      {necesidades.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>No hay necesidades abiertas. 🎉</p></div>
      ) : (
        <div className="tarjeta"><div className="tabla-scroll"><table>
          <thead><tr><th>Urgencia</th><th>Producto</th><th>Centro</th><th>Nota</th><th>Desde</th></tr></thead>
          <tbody>
            {necesidades.map((n) => (
              <tr key={n.id}>
                <td><Pill tono={tonoDeClase(claseUrgencia(n.urgencia))} punto={false}>{ETIQUETA_URGENCIA[n.urgencia as keyof typeof ETIQUETA_URGENCIA] ?? n.urgencia}</Pill></td>
                <td><strong>{n.producto}</strong>{n.categoria && <div className="muted" style={{ fontSize: '.78rem' }}>{ETIQUETA_TIPO_INSUMO[n.categoria] ?? n.categoria}</div>}</td>
                <td><Link href={'/acopio/' + n.punto_id}>{n.puntos_acopio?.nombre ?? 'Centro'}</Link></td>
                <td className="muted" style={{ fontSize: '.85rem' }}>{n.nota || '—'}</td>
                <td className="muted" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{fechaCorta(n.creado_en)}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}

      <h2 className="fila" style={{ gap: 6, marginTop: 18 }}><Icono nombre="caja" size={20} /> Productos bajo mínimo</h2>
      {bajoStock.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Ningún producto por debajo de su mínimo.</p></div>
      ) : (
        <div className="tarjeta"><div className="tabla-scroll"><table>
          <thead><tr><th>Producto</th><th>Centro</th><th>Actual</th><th>Mínimo</th></tr></thead>
          <tbody>
            {bajoStock.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.producto}</strong> <Pill tono="critica" punto={false}>Bajo</Pill></td>
                <td><Link href={'/acopio/' + i.punto_id}>{i.puntos_acopio?.nombre ?? 'Centro'}</Link></td>
                <td>{fmt(i.cantidad)} <span className="muted" style={{ fontSize: '.8rem' }}>{i.unidad || ''}</span></td>
                <td className="muted">{fmt(i.minimo)}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  );
}
