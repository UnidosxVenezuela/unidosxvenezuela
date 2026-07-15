import { fechaCorta } from '@/lib/fechas';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatoHoras } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Kpi from '@/components/Kpi';

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
          <p className="muted sub">
            Tu tiempo se cuenta <strong>solo</strong> mientras usas la plataforma: cada minuto activo suma al
            día, sin registrar nada a mano. Gracias por colaborar con el corazón. 💛💙❤️
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ margin: '16px 0' }}>
        <Kpi etiqueta="Tus horas" valor={formatoHoras(misHoras)} sub="de voluntariado" icono="reloj" tinte="#fce7f3" color="#9d2463" />
        <Kpi etiqueta="Juntos llevamos" valor={formatoHoras(totalComunidad)} sub="de toda la comunidad" icono="grupos" tinte="#eef2ff" color="var(--azul)" />
      </div>

      <p className="muted fila" style={{ gap: 6, fontSize: '.88rem' }}>
        <Icono nombre="reloj" size={15} /> El conteo es <strong>automático</strong>: se suma tu tiempo con la
        plataforma abierta y en uso (pestaña visible y con actividad). Ya no hay registro manual de horas.
      </p>

      <h2>Historial</h2>
      {items.length === 0 ? (
        <div className="tarjeta vacio">
          <Icono nombre="reloj" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>Aún no hay horas contadas. Se irán sumando solas mientras uses la plataforma.</p>
        </div>
      ) : (
        <div className="tarjeta">
          <div className="tabla-scroll"><table>
            <thead><tr><th>Fecha</th><th>Horas</th><th>Detalle</th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{fechaCorta(r.fecha + 'T00:00:00')}</td>
                  <td>{formatoHoras(Number(r.horas))}</td>
                  <td>{r.descripcion || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
