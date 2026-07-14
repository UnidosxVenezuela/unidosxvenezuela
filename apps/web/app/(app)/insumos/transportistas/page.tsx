import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaCorta } from '@/lib/fechas';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import { crearTransportista, alternarTransportista, eliminarTransportista } from '../actions';

// Registro de transportistas/conductores de Logística (0159). Alimenta el selector de
// «Conductor» al registrar un envío. Se puede llenar a mano o desde un Donación-Ofrecimiento
// de transporte (botón «Registrar como transportista» en la ficha del ofrecimiento).
export default async function TransportistasPage() {
  const { perfil } = await requireUsuario();
  if (!puedeLogistica(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  const { data } = await supabase.from('transportistas_logistica')
    .select('id, nombre, contacto, vehiculo, notas, activo, oportunidad_id, creado_en')
    .order('activo', { ascending: false }).order('nombre');
  const lista = (data ?? []) as any[];
  const activos = lista.filter((t) => t.activo);
  const inactivos = lista.filter((t) => !t.activo);

  return (
    <div>
      <RealtimeRefrescar tabla="transportistas_logistica" />
      <Link href="/insumos" className="muted">← Logística</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="camion" size={24} /> Transportistas</h1>
          <p className="muted sub">Personas que ofrecen transporte para las entregas. Solo estos aparecen como «Conductor» al registrar un envío. Puedes agregarlos aquí o desde un <Link href="/insumos/oportunidades">Donación-Ofrecimiento</Link> de transporte.</p>
        </div>
      </div>

      <div className="grupo-grid" style={{ marginTop: 16 }}>
        <div className="grupo-main">
          {lista.length === 0 ? (
            <div className="tarjeta vacio"><p className="muted" style={{ margin: 0 }}>Aún no hay transportistas registrados. Agrega el primero con el formulario, o regístralo desde un ofrecimiento de transporte.</p></div>
          ) : (
            <div className="tarjeta"><div className="tabla-scroll"><table>
              <thead><tr><th>Nombre</th><th>Vehículo</th><th>Contacto</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {[...activos, ...inactivos].map((t) => (
                  <tr key={t.id} style={t.activo ? undefined : { opacity: .6 }}>
                    <td>
                      <strong>{t.nombre}</strong>
                      {t.oportunidad_id && <> <Pill tono="info" punto={false}>desde ofrecimiento</Pill></>}
                      {t.notas && <div className="muted" style={{ fontSize: '.8rem' }}>{t.notas}</div>}
                    </td>
                    <td className="muted">{t.vehiculo || '—'}</td>
                    <td className="muted">{t.contacto || '—'}</td>
                    <td>{t.activo ? <Pill tono="ok" punto={false}>Activo</Pill> : <Pill tono="neutra" punto={false}>Inactivo</Pill>}</td>
                    <td>
                      <div className="fila" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <form action={alternarTransportista}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="activo" value={t.activo ? 'false' : 'true'} />
                          <button className="btn btn-sm" style={{ minHeight: 30, padding: '2px 10px' }} type="submit">{t.activo ? 'Desactivar' : 'Activar'}</button>
                        </form>
                        <form action={eliminarTransportista}>
                          <input type="hidden" name="id" value={t.id} />
                          <BotonConfirmar mensaje={'¿Eliminar a «' + t.nombre + '» del registro de transportistas?'} className="btn btn-peligro" style={{ minHeight: 30, padding: '2px 8px' }}><Icono nombre="basura" size={14} /></BotonConfirmar>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <p className="muted" style={{ fontSize: '.8rem', margin: '10px 0 0' }}>Los <strong>inactivos</strong> no aparecen al elegir conductor, pero se conservan por si vuelven a colaborar.</p>
            </div>
          )}
        </div>

        <aside className="grupo-aside">
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="mas" size={16} /> Registrar transportista</h3>
            <form action={crearTransportista}>
              <div className="campo"><label htmlFor="nombre">Nombre</label><input id="nombre" name="nombre" className="input" required maxLength={120} /></div>
              <div className="campo"><label htmlFor="vehiculo">Vehículo</label><input id="vehiculo" name="vehiculo" className="input" placeholder="moto, camioneta, camión…" maxLength={80} /></div>
              <div className="campo"><label htmlFor="contacto">Contacto</label><input id="contacto" name="contacto" className="input" placeholder="teléfono · correo" maxLength={160} /></div>
              <div className="campo"><label htmlFor="notas">Notas</label><textarea id="notas" name="notas" className="input" rows={2} maxLength={500} /></div>
              <BotonEnviar className="btn btn-primario" style={{ width: '100%' }}>Registrar</BotonEnviar>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
