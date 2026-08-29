// Avisos generales (0238) — solo administración.
//
// El envío existía desde hace tiempo, pero vivía plegado dentro de /notificaciones y no
// estaba en ningún menú: quien no supiera que estaba ahí, no lo encontraba. Ahora tiene
// pantalla propia, entrada en el menú lateral y en la paleta ⌘K.
//
// Y lo que faltaba de verdad: el HISTORIAL. Es la acción de más alcance de la plataforma
// —le llega a cada persona de la organización— y era la única sin rastro. Aquí se ve qué
// se mandó, quién lo mandó y a cuánta gente llegó.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import EstadoVacio from '@/components/EstadoVacio';
import Consejo from '@/components/Consejos';
import { enviarAviso } from '../../notificaciones/avisos-actions';

export const dynamic = 'force-dynamic';

export default async function AdminAvisosPage() {
  const { perfil } = await requireUsuario();
  if (!esAdministrador(perfil)) redirect('/dashboard');

  const supabase = await createClient();
  const [gruposRes, historialRes] = await Promise.all([
    supabase.from('grupos').select('id, nombre').order('nombre'),
    supabase.from('avisos_enviados')
      .select('id, titulo, cuerpo, enlace, destino, destinatarios, autor_sello, creado_en')
      .order('creado_en', { ascending: false }).limit(50),
  ]);
  const grupos = (gruposRes.data ?? []) as any[];
  const historial = (historialRes.data ?? []) as any[];
  // Sin 0238 la tabla no existe: se dice y el formulario sigue funcionando igual.
  const faltaMigracion = Boolean(historialRes.error);

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="avisos" size={24} /> Avisos generales</h1>
          <p className="muted sub">Un mensaje a toda la organización, o solo a los grupos que elijas.</p>
        </div>
        <Link className="btn" href="/notificaciones"><Icono nombre="avisos" size={16} /> Mis notificaciones</Link>
      </div>

      <Consejo id="admin-avisos" titulo="Esto le suena a todo el mundo">
        Un aviso general entra en la <strong>campana de cada persona</strong> y sale también por push.
        Es la acción de más alcance de la plataforma, así que conviene usarla poco: una campana que
        suena de más deja de leerse a la semana. Para lo del día a día está el <strong>canal general</strong> del
        chat, que se lee sin interrumpir a nadie. <strong>Todo queda registrado</strong> abajo, con quién lo envió.
      </Consejo>

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <h3 className="aside-titulo" style={{ marginTop: 0 }}>Enviar un aviso</h3>
        <form action={enviarAviso} encType="multipart/form-data">
          <div className="campo">
            <label htmlFor="av-titulo">Título</label>
            <input id="av-titulo" name="titulo" className="input" required maxLength={120}
              placeholder="Ej. Reunión general hoy a las 6pm" />
          </div>
          <div className="campo">
            <label htmlFor="av-cuerpo">Mensaje (opcional)</label>
            <textarea id="av-cuerpo" name="cuerpo" className="input" rows={3} maxLength={400} />
            <small className="muted">Se ve entero en la campana. En el push del teléfono se corta, así que lo importante va al principio.</small>
          </div>
          <div className="campo">
            <label htmlFor="av-imagen">Imagen (opcional)</label>
            <input id="av-imagen" name="imagen" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="input" />
            <small className="muted">PNG, JPG, WebP o GIF · hasta 4 MB. Se muestra en la notificación, el push y Telegram.</small>
          </div>
          <div className="campo">
            <label htmlFor="av-enlace">Enlace (opcional)</label>
            <input id="av-enlace" name="enlace" className="input" placeholder="/grupos  ·  https://…" />
          </div>
          <div className="campo">
            <label>¿A quién se envía?</label>
            <label className="fila" style={{ gap: 6, fontWeight: 500 }}>
              <input type="radio" name="destino" value="todos" defaultChecked style={{ width: 'auto', minHeight: 0 }} /> Todas las cuentas verificadas
            </label>
            <label className="fila" style={{ gap: 6, fontWeight: 500 }}>
              <input type="radio" name="destino" value="grupos" style={{ width: 'auto', minHeight: 0 }} /> Solo los grupos que marque abajo
            </label>
          </div>
          {grupos.length > 0 && (
            <div className="campo">
              <label>Grupos (si elegiste «Solo los grupos…»)</label>
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
      </div>

      <h2 style={{ marginTop: 24, fontSize: '1.05rem' }}>Avisos enviados</h2>
      {faltaMigracion ? (
        <div className="tarjeta">
          <p className="muted" style={{ margin: 0 }}>
            El historial todavía no está disponible: falta aplicar la migración <code>0238</code>.
            El envío de arriba funciona igual.
          </p>
        </div>
      ) : historial.length === 0 ? (
        <EstadoVacio
          icono="avisos"
          titulo="Todavía no se ha enviado ninguno"
          texto="Cuando envíes un aviso aparecerá aquí, con quién lo mandó y a cuánta gente llegó."
        />
      ) : (
        <div className="tarjeta" style={{ padding: 0 }}>
          <div className="tabla-scroll"><table>
            <thead><tr><th>Aviso</th><th>Para</th><th>Llegó a</th><th>Envió</th><th>Cuándo</th></tr></thead>
            <tbody>
              {historial.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="celda-titulo">
                      <strong>{a.titulo}</strong>
                      {a.cuerpo && <div className="desc">{String(a.cuerpo).slice(0, 90)}</div>}
                      {a.enlace && <div className="muted" style={{ fontSize: '.76rem' }}>→ {a.enlace}</div>}
                    </div>
                  </td>
                  <td>
                    <Pill tono={a.destino === 'todos' ? 'info' : 'neutra'} punto={false}>
                      {a.destino === 'todos' ? 'Toda la organización' : 'Grupos'}
                    </Pill>
                  </td>
                  {/* Un 0 no es cosmético: significa que el envío se quedó a medias. */}
                  <td>{a.destinatarios > 0
                    ? <strong>{a.destinatarios}</strong>
                    : <Pill tono="alta" punto={false}>0 · revisar</Pill>}</td>
                  <td className="muted" style={{ fontSize: '.82rem' }}>{a.autor_sello}</td>
                  <td className="muted" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{fechaHora(a.creado_en)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
