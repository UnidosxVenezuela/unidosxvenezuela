import Link from 'next/link';
import { requireUsuario, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ESTADO_DONACION, ESTADOS_DONACION, claseEstadoDonacion } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import EstadoVacio from '@/components/EstadoVacio';
import { crearDonacion, cambiarEstadoDonacion, eliminarDonacion } from '../actions';

export default async function DonacionesPage() {
  const { perfil } = await requireUsuario();
  const gestor = puedeLogistica(perfil);
  const supabase = await createClient();
  const [{ data }, { data: sols }] = await Promise.all([
    supabase.from('donaciones').select('id, donante, tipo, descripcion, monto, estado, creado_en, solicitudes_insumo(titulo)').order('creado_en', { ascending: false }),
    supabase.from('solicitudes_insumo').select('id, titulo').neq('estado', 'entregado').order('creado_en', { ascending: false }),
  ]);
  const donaciones = (data ?? []) as any[];

  return (
    <div>
      <Link href="/insumos" className="muted">← Insumos</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div><h1>Donaciones</h1><p className="muted sub">Registra donaciones (dinero o especie) y síguelas hasta asignarlas a una solicitud.</p></div>
      </div>

      {gestor && (
        <form action={crearDonacion} className="tarjeta" style={{ maxWidth: 660 }}>
          <div className="grid grid-2">
            <div className="campo"><label>Donante</label><input name="donante" className="input" required /></div>
            <div className="campo"><label>Tipo</label>
              <select name="tipo" className="input" defaultValue="especie">
                <option value="especie">En especie</option>
                <option value="dinero">Dinero</option>
              </select>
            </div>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Descripción</label><input name="descripcion" className="input" placeholder="Qué / cuánto" /></div>
            <div className="campo"><label>Monto (si es dinero)</label><input name="monto" type="number" step="0.01" min="0" className="input" /></div>
          </div>
          <div className="campo"><label>Asignar a solicitud (opcional)</label>
            <select name="solicitud_id" className="input" defaultValue="">
              <option value="">— Ninguna —</option>
              {(sols ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.titulo}</option>)}
            </select>
          </div>
          <button className="btn btn-primario" type="submit"><Icono nombre="corazon" size={16} /> Registrar donación</button>
        </form>
      )}

      {donaciones.length === 0 ? (
        <EstadoVacio icono="corazon" titulo="Sin donaciones" texto="Registra las donaciones comprometidas para seguirlas hasta su entrega." />
      ) : (
        <div className="tarjeta">
          <div className="tabla-scroll"><table>
            <thead><tr><th>Donante</th><th>Aporte</th><th>Para</th><th>Estado</th>{gestor && <th></th>}</tr></thead>
            <tbody>
              {donaciones.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.donante}</strong><div className="muted" style={{ fontSize: '.8rem' }}>{d.tipo === 'dinero' ? 'Dinero' : 'Especie'}</div></td>
                  <td>{d.tipo === 'dinero' && d.monto != null ? d.monto : (d.descripcion || '—')}</td>
                  <td className="muted">{d.solicitudes_insumo?.titulo || '—'}</td>
                  <td>
                    {gestor ? (
                      <form action={cambiarEstadoDonacion} className="fila" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <input type="hidden" name="id" value={d.id} />
                        <select name="estado" defaultValue={d.estado} className="input" style={{ minHeight: 30, padding: '2px 6px', width: 'auto' }}>
                          {ESTADOS_DONACION.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_DONACION[e] ?? e}</option>)}
                        </select>
                        <button className="btn" style={{ minHeight: 30, padding: '2px 8px' }}>OK</button>
                      </form>
                    ) : <Pill tono={tonoDeClase(claseEstadoDonacion(d.estado))}>{ETIQUETA_ESTADO_DONACION[d.estado] ?? d.estado}</Pill>}
                  </td>
                  {gestor && (
                    <td>
                      <form action={eliminarDonacion}>
                        <input type="hidden" name="id" value={d.id} />
                        <BotonConfirmar mensaje="¿Eliminar esta donación?" className="btn btn-peligro" style={{ minHeight: 30, padding: '2px 8px' }}><Icono nombre="basura" size={14} /></BotonConfirmar>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
