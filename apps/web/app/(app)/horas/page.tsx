import { fechaCorta } from '@/lib/fechas';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatoHoras } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonConfirmar from '@/components/BotonConfirmar';
import Kpi from '@/components/Kpi';
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
      <div className="pagina-cab">
        <div>
          <h1>Mis horas</h1>
          <p className="muted sub">Registra tu tiempo de voluntariado. Gracias por colaborar con el corazón. 💛💙❤️</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ margin: '16px 0' }}>
        <Kpi etiqueta="Tus horas" valor={formatoHoras(misHoras)} sub="de voluntariado" icono="reloj" tinte="#fce7f3" color="#9d2463" />
        <Kpi etiqueta="Juntos llevamos" valor={formatoHoras(totalComunidad)} sub="de toda la comunidad" icono="grupos" tinte="#eef2ff" color="var(--azul)" />
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
          <div className="tabla-scroll"><table>
            <thead><tr><th>Fecha</th><th>Horas</th><th>Detalle</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{fechaCorta(r.fecha + 'T00:00:00')}</td>
                  <td>{formatoHoras(Number(r.horas))}</td>
                  <td>{r.descripcion || '—'}</td>
                  <td>
                    <form action={eliminarHoras}>
                      <input type="hidden" name="id" value={r.id} />
                      <BotonConfirmar mensaje="¿Eliminar este registro de horas?" className="btn" style={{ minHeight: 32, padding: '2px 10px' }} aria-label="Eliminar"><Icono nombre="basura" size={16} /></BotonConfirmar>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
