import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatoHoras } from '@/lib/constantes';
import Icono from '@/components/Icono';
import { registrarHoras, eliminarHoras } from './actions';

export default async function HorasPage() {
  const { user } = await requireUsuario();
  const supabase = await createClient();

  const [{ data: registros }, { data: total }] = await Promise.all([
    supabase.from('registro_horas')
      .select('id, horas, descripcion, fecha').eq('perfil_id', user!.id)
      .order('fecha', { ascending: false }).limit(100),
    supabase.rpc('total_horas_comunidad'),
  ]);
  const items = (registros ?? []) as any[];
  const misHoras = items.reduce((s, r) => s + Number(r.horas), 0);
  const totalComunidad = Number(total ?? 0);

  return (
    <div>
      <h1>Mis horas</h1>
      <p className="muted">Registra tu tiempo de voluntariado. Gracias por colaborar con el corazón. 💛💙❤️</p>

      <div className="grid grid-2">
        <div className="tarjeta">
          <div className="muted">Tus horas</div>
          <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatoHoras(misHoras)}</div>
        </div>
        <div className="tarjeta">
          <div className="muted">Juntos llevamos</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--azul)' }}>{formatoHoras(totalComunidad)}</div>
        </div>
      </div>

      <form action={registrarHoras} className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Registrar horas</h2>
        <div className="grid grid-2">
          <div className="campo"><label htmlFor="horas">Horas</label>
            <input id="horas" name="horas" className="input" type="number" step="0.5" min="0.5" max="24" required /></div>
          <div className="campo"><label htmlFor="fecha">Fecha</label>
            <input id="fecha" name="fecha" className="input" type="date" /></div>
        </div>
        <div className="campo"><label htmlFor="descripcion">¿En qué colaboraste?</label>
          <input id="descripcion" name="descripcion" className="input" placeholder="Transcripción de audios, apoyo en acopio…" /></div>
        <button className="btn btn-primario"><Icono nombre="reloj" /> Registrar</button>
      </form>

      <h2>Historial</h2>
      {items.length === 0 ? (
        <div className="tarjeta vacio">
          <Icono nombre="reloj" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>Aún no registraste horas.</p>
        </div>
      ) : (
        <div className="tarjeta">
          <table>
            <thead><tr><th>Fecha</th><th>Horas</th><th>Detalle</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-VE')}</td>
                  <td>{formatoHoras(Number(r.horas))}</td>
                  <td>{r.descripcion || '—'}</td>
                  <td>
                    <form action={eliminarHoras}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Eliminar"><Icono nombre="basura" size={16} /></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
