import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica, puedeVerOportunidades, esCaptacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import {
  ETIQUETA_TIPO_OFERTA, ETIQUETA_ORIGEN_OFERTA,
  ETIQUETA_ESTADO_VERIF, claseEstadoVerif, ETIQUETA_TIPO_INSUMO,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import Kpi from '@/components/Kpi';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import { cambiarDisponibilidadServicio } from '../oportunidades/actions';

// Directorio de «Servicios disponibles» (0168). A diferencia de una DONACIÓN —que se
// ofrece, se compromete y se ENTREGA (ciclo que cierra)—, un SERVICIO (clase='servicio')
// es una CAPACIDAD PERMANENTE: consulta médica a la orden, apoyo psicosocial, traslado,
// orientación legal… Una vez verificado queda DISPONIBLE y así se mantiene, hasta que
// Logística lo DA DE BAJA (terminó o ya no se requiere) — reactivable. Esta vista lleva
// ese listado, separado del pipeline de donaciones.

export default async function ServiciosPage() {
  const { perfil } = await requireUsuario();
  if (!puedeVerOportunidades(perfil)) redirect('/dashboard');
  const gestor = puedeLogistica(perfil);            // Logística/admin: da de baja y reactiva
  const esCapt = esCaptacion(perfil);
  const supabase = await createClient();

  // Todos los ofrecimientos de clase «servicio» que no fueron descartados. `*` para no
  // romper si 0152/0168 aún no están aplicadas (cliente sin tipos).
  const { data } = await supabase.from('oportunidades_donacion')
    .select('*')
    .eq('clase', 'servicio')
    .neq('estado', 'descartada')
    .order('creado_en', { ascending: false });
  const servicios = (data ?? []) as any[];

  // Estado de disponibilidad (0168): activo por defecto si la columna aún no existe.
  const esActivo = (s: any) => (s.servicio_estado ?? 'activo') !== 'baja';
  const activos = servicios.filter(esActivo);
  const bajas = servicios.filter((s) => !esActivo(s));
  // Dentro de los activos: los verificados son los que están realmente DISPONIBLES; los
  // demás siguen en verificación (visibles aparte para no confundir el directorio).
  const disponibles = activos.filter((s) => s.estado_verificacion === 'verificada');
  const pendientes = activos.filter((s) => s.estado_verificacion !== 'verificada');

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="oportunidades_donacion" />
      <Link href="/insumos" className="muted">← Logística</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Servicios disponibles</h1>
          <p className="muted sub">
            Los ofrecimientos que son <strong>servicios</strong> (atención médica, apoyo psicosocial, traslado,
            orientación legal…) no se entregan como una donación: son una <strong>capacidad que se mantiene
            disponible</strong> hasta que termina o ya no se requiere. Aquí llevas ese directorio.
          </p>
        </div>
        <div className="fila">
          <BotonActualizar />
          <Link className="btn" href="/insumos/oportunidades"><Icono nombre="corazon" size={16} /> Donación-Ofrecimiento</Link>
        </div>
      </div>

      {esCapt && !gestor && (
        <p className="muted fila" style={{ gap: 6, fontSize: '.88rem', marginTop: 4 }}>
          <Icono nombre="ojo" size={15} /> Vista de <strong>consulta</strong>: la baja o reactivación de un servicio la gestiona Logística.
        </p>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Disponibles" valor={disponibles.length} sub="Verificados y activos" color="#0f766e" icono="corazon" tinte="#f0fdfa" />
        <Kpi etiqueta="En verificación" valor={pendientes.length} sub="Aún sin verificar" color="#a16207" icono="reloj" tinte="#fef9c3" />
        <Kpi etiqueta="Dados de baja" valor={bajas.length} sub="Terminados o no requeridos" color="#64748b" icono="caja" tinte="#f1f5f9" />
      </div>

      {servicios.length === 0 ? (
        <EstadoVacio
          icono="corazon"
          titulo="Aún no hay servicios"
          texto="Cuando se registre un ofrecimiento de tipo «Servicio de ayuda o atención» y se verifique, aparecerá aquí como capacidad disponible."
        />
      ) : (
        <>
          {/* Directorio: servicios verificados y activos */}
          {disponibles.length === 0 ? (
            <p className="muted" style={{ fontSize: '.9rem' }}>
              Todavía no hay servicios <strong>verificados</strong> disponibles. Los que están en verificación se listan más abajo.
            </p>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 12 }}>
              {disponibles.map((s) => <TarjetaServicio key={s.id} s={s} gestor={gestor} />)}
            </div>
          )}

          {/* En verificación: activos aún no verificados (no son parte del directorio todavía) */}
          {pendientes.length > 0 && (
            <details className="tarjeta" style={{ marginTop: 20 }}>
              <summary className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}>
                <Icono nombre="reloj" size={16} /> En verificación ({pendientes.length})
              </summary>
              <p className="muted" style={{ fontSize: '.84rem', margin: '8px 0 12px' }}>
                Estos servicios ya se registraron pero Verificación aún no los confirma. Se vuelven «disponibles» al verificarse.
              </p>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: 12 }}>
                {pendientes.map((s) => <TarjetaServicio key={s.id} s={s} gestor={gestor} />)}
              </div>
            </details>
          )}

          {/* Dados de baja: reactivables por Logística */}
          {bajas.length > 0 && (
            <details className="tarjeta" style={{ marginTop: 16 }}>
              <summary className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}>
                <Icono nombre="caja" size={16} /> Dados de baja ({bajas.length})
              </summary>
              <div className="tabla-scroll" style={{ marginTop: 12 }}><table>
                <thead><tr><th>Servicio</th><th>Motivo de la baja</th><th>Cuándo</th><th></th></tr></thead>
                <tbody>
                  {bajas.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={'/insumos/oportunidades/' + s.id}><strong>{s.organizacion}</strong></Link>
                        {s.numero != null && <div className="muted" style={{ fontSize: '.75rem' }}>OF-{String(s.numero).padStart(5, '0')}</div>}
                      </td>
                      <td className="muted">{s.servicio_baja_motivo || '—'}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{s.servicio_baja_en ? fechaHora(s.servicio_baja_en) : '—'}</td>
                      <td>
                        {gestor && (
                          <form action={cambiarDisponibilidadServicio}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="accion" value="reactivar" />
                            <BotonConfirmar mensaje="¿Reactivar este servicio? Volverá al directorio de disponibles."
                              className="btn btn-sm" confirmar="Sí, reactivar">
                              <Icono nombre="refrescar" size={14} /> Reactivar
                            </BotonConfirmar>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </details>
          )}
        </>
      )}
    </AnimarEntrada>
  );
}

function TarjetaServicio({ s, gestor }: { s: any; gestor: boolean }) {
  const verificado = s.estado_verificacion === 'verificada';
  return (
    <div className="tarjeta" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span className="insignia">{ETIQUETA_TIPO_OFERTA[s.tipo_oferta] ?? 'Servicio'}</span>
        {s.numero != null && <span className="muted" style={{ fontSize: '.72rem' }}>OF-{String(s.numero).padStart(5, '0')}</span>}
      </div>
      <Link href={'/insumos/oportunidades/' + s.id} style={{ fontWeight: 700 }}>{s.organizacion}</Link>
      {(s.origen || s.tipo_oferta) && (
        <div className="muted" style={{ fontSize: '.78rem' }}>
          {[s.origen ? (ETIQUETA_ORIGEN_OFERTA[s.origen] ?? s.origen) : null, ETIQUETA_TIPO_OFERTA[s.tipo_oferta] ?? s.tipo_oferta].filter(Boolean).join(' · ')}
        </div>
      )}
      <div>
        <Pill tono={tonoDeClase(claseEstadoVerif(s.estado_verificacion))} punto={false}>
          {ETIQUETA_ESTADO_VERIF[s.estado_verificacion] ?? s.estado_verificacion}
        </Pill>
      </div>
      {s.descripcion && <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>{s.descripcion}</p>}
      {(s.cubre_tipos ?? []).length > 0 && (
        <div className="fila" style={{ gap: 4, flexWrap: 'wrap' }}>
          {(s.cubre_tipos as string[]).map((t) => <span key={t} className="insignia" style={{ fontSize: '.72rem' }}>{ETIQUETA_TIPO_INSUMO[t] ?? t}</span>)}
        </div>
      )}
      {s.ubicacion && <div className="muted fila" style={{ gap: 4, fontSize: '.8rem' }}><Icono nombre="ubicacion" size={13} /> {s.ubicacion}</div>}
      {s.contacto && <div className="muted fila" style={{ gap: 4, fontSize: '.8rem' }}><Icono nombre="usuario" size={13} /> {s.contacto}</div>}

      {/* Dar de baja (Logística): un servicio verificado y disponible se retira cuando termina
          o ya no se requiere. Se pide un motivo breve (queda registrado). */}
      {gestor && verificado && (
        <details style={{ marginTop: 4, borderTop: '1px solid var(--borde)', paddingTop: 8 }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>
            <Icono nombre="caja" size={13} /> Dar de baja
          </summary>
          <form action={cambiarDisponibilidadServicio} style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="accion" value="baja" />
            <input name="motivo" className="input" placeholder="Motivo (terminó, ya no se requiere…)" maxLength={300} style={{ marginBottom: 6 }} />
            <BotonEnviar className="btn btn-sm btn-peligro"><Icono nombre="caja" size={14} /> Confirmar baja</BotonEnviar>
          </form>
        </details>
      )}
    </div>
  );
}
