import { fechaHora } from '@/lib/fechas';
import Link from 'next/link';
import { requireUsuario, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import ResaltarNuevos from '@/components/ResaltarNuevos';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import ActivarNotificaciones from '@/components/ActivarNotificaciones';
import { marcarLeida, marcarTodasLeidas } from './actions';

export default async function NotificacionesPage() {
  const { perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const supabase = await createClient();
  const { data } = await supabase.from('notificaciones')
    .select('*')   // '*' para incluir `imagen_url` (0170) sin romper si aún no se aplicó.
    .order('creado_en', { ascending: false }).limit(100);
  const items = (data ?? []) as any[];

  return (
    <div>
      <RealtimeRefrescar tabla="notificaciones" />
      <div className="pagina-cab">
        <div>
          <h1>Notificaciones</h1>
          <p className="muted sub">Avisos de tareas, grupos y solicitudes en las que participas.</p>
        </div>
        <form action={marcarTodasLeidas}>
          <button className="btn" type="submit"><Icono nombre="ok" size={16} /> Marcar todas como leídas</button>
        </form>
      </div>

      <ActivarNotificaciones />

      {/* El formulario de envío vive ahora en /admin/avisos (0238). Estaba aquí dentro de
          un desplegable y sin entrada en ningún menú: quien no supiera que existía, no lo
          encontraba. Allí además está el historial de lo que se ha mandado. */}
      {esAdmin && (
        <div className="tarjeta fila" style={{ justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <span className="fila" style={{ gap: 8 }}>
            <Icono nombre="avisos" size={16} />
            <span>¿Necesitas avisar a toda la organización?</span>
          </span>
          <Link className="btn btn-primario" href="/admin/avisos">Enviar un aviso general</Link>
        </div>
      )}

      {items.length === 0 ? (
        <div className="tarjeta vacio">
          <Icono nombre="avisos" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>No tienes notificaciones.</p>
        </div>
      ) : (
      <ResaltarNuevos>
      <div className="tarjeta">
        {items.map((it) => (
          <div key={it.id} data-fila className="fila" style={{
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
              {it.imagen_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.imagen_url} alt="" style={{ marginTop: 6, maxWidth: 280, width: '100%', height: 'auto', borderRadius: 8, border: '1px solid var(--borde)' }} />
              )}
              <div className="muted" style={{ fontSize: '.8rem' }}>{fechaHora(it.creado_en)}</div>
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
      </ResaltarNuevos>
      )}
    </div>
  );
}
