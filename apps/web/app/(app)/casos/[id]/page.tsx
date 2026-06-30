import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerificar } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ESTADO_CASO, ESTADOS_CASO, hrefSeguro } from '@/lib/constantes';
import Icono from '@/components/Icono';
import EstadoCaso from '@/components/EstadoCaso';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import { cambiarEstadoCaso, actualizarCaso } from '../actions';

export default async function CasoDetallePage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeVerificar(perfil?.rol)) redirect('/dashboard');
  const supabase = await createClient();
  const id = params.id;

  const { data: caso } = await supabase.from('casos')
    .select('id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, asignado_a, estado, notas, creado_por, creado_en, actualizado_en')
    .eq('id', id).single() as any;
  if (!caso) return <div className="tarjeta"><h2>Caso no encontrado</h2><Link href="/casos">Volver</Link></div>;

  const [{ data: perfiles }, { data: histRaw }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en')
      .eq('entidad', 'casos').eq('entidad_id', id).order('creado_en', { ascending: false }).limit(50),
  ]);
  const nombres = new Map<string, string>((perfiles ?? []).map((p: any) => [p.id, p.nombre_completo]));
  const waFuente = hrefSeguro(caso.fuente_url);

  const describir = (accion: string, meta: any) => {
    if (accion === 'casos:insert') return 'Caso creado';
    if (accion === 'casos:update') return meta?.estado ? `Actualizado · estado: ${ETIQUETA_ESTADO_CASO[meta.estado as keyof typeof ETIQUETA_ESTADO_CASO] ?? meta.estado}` : 'Caso actualizado';
    return accion;
  };

  return (
    <div>
      <RealtimeRefrescar tabla="casos" filtro={'id=eq.' + id} />
      <Link href="/casos" className="muted">← Verificación</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <h1 style={{ margin: 0 }}>{caso.titulo}</h1>
        <EstadoCaso estado={caso.estado} />
      </div>
      <p className="muted" style={{ marginTop: 4 }}>Caso #{String(caso.numero).padStart(5, '0')}</p>

      <div className="grupo-grid" style={{ marginTop: 8 }}>
        {/* Columna principal */}
        <div className="grupo-main">
          <div className="tarjeta">
            <p>{caso.descripcion || <span className="muted">Sin descripción</span>}</p>
            <div className="grid grid-2">
              <div><strong>Categoría:</strong> {caso.categoria ? <span className="insignia">{caso.categoria}</span> : '—'}</div>
              <div><strong>Fecha de publicación:</strong> {caso.fecha_publicacion ? new Date(caso.fecha_publicacion + 'T00:00:00').toLocaleDateString('es-VE') : '—'}</div>
              <div><strong>Fuente:</strong> {waFuente ? <a href={waFuente} target="_blank" rel="noopener noreferrer">{caso.fuente || 'Ver fuente'} ↗</a> : (caso.fuente || '—')}</div>
              <div><strong>Asignado a:</strong> {nombres.get(caso.asignado_a) ?? 'Sin asignar'}</div>
            </div>
          </div>

          {/* Historial de cambios */}
          <h2 className="fila" style={{ gap: 6 }}><Icono nombre="historial" size={20} /> Historial de cambios</h2>
          <div className="tarjeta">
            {(histRaw ?? []).length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin movimientos registrados.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(histRaw ?? []).map((h: any) => (
                  <li key={h.id} style={{ marginBottom: 8 }}>
                    <div>{describir(h.accion, h.metadata)}</div>
                    <div className="muted" style={{ fontSize: '.8rem' }}>
                      {new Date(h.creado_en).toLocaleString('es-VE')}{h.actor_id ? ' · por ' + (nombres.get(h.actor_id) ?? '—') : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Panel de gestión a la derecha */}
        <aside className="grupo-aside">
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> Estado del caso</h3>
            <form action={cambiarEstadoCaso}>
              <input type="hidden" name="caso_id" value={id} />
              <select name="estado" className="input" defaultValue={caso.estado} style={{ width: '100%' }}>
                {ESTADOS_CASO.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_CASO[e]}</option>)}
              </select>
              <button className="btn btn-primario" type="submit" style={{ width: '100%', marginTop: 8 }}>Guardar estado</button>
            </form>
          </div>

          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Asignación y notas</h3>
            <form action={actualizarCaso}>
              <input type="hidden" name="caso_id" value={id} />
              <div className="campo">
                <label>Asignar a (verificador)</label>
                <select name="asignado_a" className="input" defaultValue={caso.asignado_a ?? ''} style={{ width: '100%' }}>
                  <option value="">Sin asignar</option>
                  {(perfiles ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Notas / observaciones</label>
                <textarea name="notas" className="input" rows={3} defaultValue={caso.notas ?? ''} />
              </div>
              <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>Guardar</button>
            </form>
          </div>

          <div className="tarjeta">
            <h3 className="aside-titulo">Estados</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '.85rem' }}>
              <div><EstadoCaso estado="en_proceso" /> <span className="muted">— en revisión, nadie más debe tomarlo.</span></div>
              <div><EstadoCaso estado="confirmado" /> <span className="muted">— validado; pasa a la siguiente etapa.</span></div>
              <div><EstadoCaso estado="falso" /> <span className="muted">— falso o ya resuelto; no continúa.</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
