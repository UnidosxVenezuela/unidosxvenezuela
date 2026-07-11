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
import { enviarAviso } from './avisos-actions';

export default async function NotificacionesPage() {
  const { perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const supabase = await createClient();
  const [{ data }, gruposRes] = await Promise.all([
    supabase.from('notificaciones')
      .select('id, tipo, titulo, cuerpo, enlace, leida, creado_en')
      .order('creado_en', { ascending: false }).limit(100),
    esAdmin ? supabase.from('grupos').select('id, nombre').order('nombre') : Promise.resolve({ data: [] as any[] }),
  ]);
  const items = (data ?? []) as any[];
  const grupos = (gruposRes.data ?? []) as any[];

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

      {esAdmin && (
        <details className="tarjeta" style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }} className="fila">
            <Icono nombre="avisos" size={16} /> Enviar un aviso
          </summary>
          <form action={enviarAviso} style={{ marginTop: 12 }}>
            <div className="campo">
              <label>Título</label>
              <input name="titulo" className="input" required maxLength={120} placeholder="Ej. Reunión general hoy a las 6pm" />
            </div>
            <div className="campo">
              <label>Mensaje (opcional)</label>
              <textarea name="cuerpo" className="input" rows={3} maxLength={400} />
            </div>
            <div className="campo">
              <label>Enlace (opcional)</label>
              <input name="enlace" className="input" placeholder="/grupos  ·  https://…" />
            </div>
            <div className="campo">
              <label>¿A quién se envía?</label>
              <label className="fila" style={{ gap: 6, fontWeight: 500 }}>
                <input type="radio" name="destino" value="todos" defaultChecked style={{ width: 'auto', minHeight: 0 }} /> Todos los usuarios verificados
              </label>
              <label className="fila" style={{ gap: 6, fontWeight: 500 }}>
                <input type="radio" name="destino" value="grupos" style={{ width: 'auto', minHeight: 0 }} /> Solo los grupos que marque abajo
              </label>
            </div>
            {grupos.length > 0 && (
              <div className="campo">
                <label>Grupos (si elegiste “Solo los grupos…”)</label>
                <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                  {grupos.map((g) => (
                    <label key={g.id} className="fila" style={{ gap: 6, fontWeight: 500 }}>
                      <input type="checkbox" name="grupos" value={g.id} style={{ width: 'auto', minHeight: 0 }} /> {g.nombre}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button className="btn btn-primario" type="submit" style={{ marginTop: 4 }}>
              <Icono nombre="avisos" size={16} /> Enviar aviso
            </button>
          </form>
        </details>
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
