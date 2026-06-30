import Link from 'next/link';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import { marcarLeida, marcarTodasLeidas } from './actions';

export default async function NotificacionesPage() {
  await requireUsuario();
  const supabase = await createClient();
  const { data } = await supabase.from('notificaciones')
    .select('id, tipo, titulo, cuerpo, enlace, leida, creado_en')
    .order('creado_en', { ascending: false }).limit(100);
  const items = (data ?? []) as any[];

  return (
    <div>
      <RealtimeRefrescar tabla="notificaciones" />
      <div className="pagina-cab">
        <div>
          <h1>Notificaciones</h1>
          <p className="muted sub">Avisos de tareas, grupos y casos en los que participas.</p>
        </div>
        <form action={marcarTodasLeidas}>
          <button className="btn" type="submit"><Icono nombre="ok" size={16} /> Marcar todas como leídas</button>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="tarjeta vacio">
          <Icono nombre="avisos" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>No tienes notificaciones.</p>
        </div>
      ) : (
      <div className="tarjeta">
        {items.map((it) => (
          <div key={it.id} className="fila" style={{
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--borde)', padding: '10px 0',
            background: it.leida ? 'transparent' : '#eef3ff',
          }}>
            <div>
              <div className="fila" style={{ gap: 8 }}>
                {!it.leida && <Pill tono="info" punto={false}>Nuevo</Pill>}
                <strong>{it.titulo}</strong>
              </div>
              {it.cuerpo && <div className="muted">{it.cuerpo}</div>}
              <div className="muted" style={{ fontSize: '.8rem' }}>{new Date(it.creado_en).toLocaleString('es-VE')}</div>
            </div>
            <div className="fila">
              {it.enlace && <Link className="btn" href={it.enlace} style={{ minHeight: 34, padding: '4px 10px' }}>Abrir</Link>}
              {!it.leida && (
                <form action={marcarLeida}>
                  <input type="hidden" name="id" value={it.id} />
                  <button className="btn" type="submit" style={{ minHeight: 34, padding: '4px 10px' }}>Leída</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
