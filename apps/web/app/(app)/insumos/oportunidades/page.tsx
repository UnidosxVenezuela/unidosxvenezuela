import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica, puedeRegistrarOportunidad } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ETIQUETA_TIPO_OFERTA, TIPOS_OFERTA, ETIQUETA_ESTADO_OFERTA, ESTADOS_OFERTA, claseEstadoOferta,
  ETIQUETA_TIPO_INSUMO, TIPOS_INSUMO,
} from '@/lib/constantes';
import { fechaCorta } from '@/lib/fechas';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import BotonEnviar from '@/components/BotonEnviar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import ResaltarNuevos from '@/components/ResaltarNuevos';
import { crearOportunidad } from './actions';

export default async function OportunidadesPage() {
  const { user, perfil } = await requireUsuario();
  if (!puedeRegistrarOportunidad(perfil)) redirect('/dashboard');
  const gestor = puedeLogistica(perfil);
  const supabase = await createClient();

  // Logística ve todas; Recopilación ve solo las que registró.
  let query = supabase.from('oportunidades_donacion')
    .select('id, organizacion, tipo_oferta, cubre_tipos, estado, monto_estimado, ubicacion, creado_en')
    .order('creado_en', { ascending: false });
  if (!gestor) query = query.eq('creado_por', user.id);
  const { data } = await query;
  const ops = (data ?? []) as any[];
  const activas = ops.filter((o) => o.estado !== 'descartada');
  const descartadas = ops.filter((o) => o.estado === 'descartada');
  const porEstado = (e: string) => activas.filter((o) => o.estado === e);

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="oportunidades_donacion" />
      <Link href="/insumos" className="muted">← Donaciones e Insumos</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Oportunidades de donación</h1>
          <p className="muted sub">
            Registra a quienes ofrecen ayudar (empresas, proyectos, personas), empáréjalos con las
            solicitudes que encajan y lleva el contacto hasta concretar la donación.
          </p>
        </div>
        <div className="fila"><BotonActualizar /></div>
      </div>

      {/* Alta de una oferta: la puede registrar Logística y Recopilación */}
      <details className="tarjeta" style={{ maxWidth: 720 }} open={ops.length === 0}>
        <summary className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}>
          <Icono nombre="mas" size={16} /> Registrar una oportunidad de donación
        </summary>
        <form action={crearOportunidad} style={{ marginTop: 12 }}>
          <div className="grid grid-2">
            <div className="campo"><label>Quién ofrece</label><input name="organizacion" className="input" required placeholder="Empresa · proyecto · persona" maxLength={160} /></div>
            <div className="campo"><label>Tipo de oferta</label>
              <select name="tipo_oferta" className="input" defaultValue="especie">
                {TIPOS_OFERTA.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_OFERTA[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="campo"><label>Contacto</label><input name="contacto" className="input" placeholder="Nombre · teléfono · correo" maxLength={200} /></div>
          <div className="campo">
            <label>¿Qué tipos de insumo puede cubrir? <span className="muted">(para sugerir coincidencias)</span></label>
            <div className="fila" style={{ gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              {TIPOS_INSUMO.map((t) => (
                <label key={t} className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 400 }}>
                  <input type="checkbox" name="cubre_tipos" value={t} style={{ width: 'auto', minHeight: 0 }} /> {ETIQUETA_TIPO_INSUMO[t]}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Descripción</label><input name="descripcion" className="input" placeholder="Qué ofrece / detalles" maxLength={500} /></div>
            <div className="campo"><label>Monto estimado <span className="muted">(si es dinero)</span></label><input name="monto_estimado" type="number" step="0.01" min="0" className="input" /></div>
          </div>
          <div className="grid grid-2">
            <div className="campo"><label>Ubicación</label><input name="ubicacion" className="input" placeholder="Ciudad / zona" maxLength={160} /></div>
            <div className="campo"><label>Enlace</label><input name="enlace" className="input" placeholder="Web o red social (opcional)" maxLength={500} /></div>
          </div>
          <BotonEnviar className="btn btn-primario"><Icono nombre="corazon" size={16} /> Registrar oportunidad</BotonEnviar>
        </form>
      </details>

      {ops.length === 0 ? (
        <EstadoVacio
          icono="corazon"
          titulo="Aún no hay oportunidades"
          texto="Registra la primera oferta de ayuda para empezar a conectar donaciones con las solicitudes."
        />
      ) : gestor ? (
        <>
          <ResaltarNuevos>
            <div className="tablero-insumos" style={{ marginTop: 16 }}>
              {ESTADOS_OFERTA.map((e) => (
                <div key={e} className="tablero-col">
                  <h3 className="fila" style={{ gap: 6, justifyContent: 'space-between' }}>
                    <span>{ETIQUETA_ESTADO_OFERTA[e] ?? e}</span>
                    <span className="insignia">{porEstado(e).length}</span>
                  </h3>
                  {porEstado(e).length === 0 && <p className="muted" style={{ fontSize: '.85rem', margin: '0 4px' }}>—</p>}
                  {porEstado(e).map((o) => <TarjetaOferta key={o.id} o={o} />)}
                </div>
              ))}
            </div>
          </ResaltarNuevos>
          {descartadas.length > 0 && (
            <details className="tarjeta" style={{ marginTop: 16 }}>
              <summary className="muted" style={{ cursor: 'pointer' }}>Descartadas ({descartadas.length})</summary>
              <div className="fila" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {descartadas.map((o) => (
                  <Link key={o.id} href={'/insumos/oportunidades/' + o.id} className="btn btn-sm">{o.organizacion}</Link>
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        // Recopilación: lista de las que registró (lectura).
        <div className="tarjeta" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Las que registraste</h3>
          <div className="tabla-scroll"><table>
            <thead><tr><th>Quién ofrece</th><th>Oferta</th><th>Estado</th></tr></thead>
            <tbody>
              {ops.map((o) => (
                <tr key={o.id}>
                  <td><Link href={'/insumos/oportunidades/' + o.id}><strong>{o.organizacion}</strong></Link>
                    <div className="muted" style={{ fontSize: '.8rem' }}>{fechaCorta(o.creado_en)}</div></td>
                  <td className="muted">{ETIQUETA_TIPO_OFERTA[o.tipo_oferta] ?? o.tipo_oferta}</td>
                  <td><Pill tono={tonoDeClase(claseEstadoOferta(o.estado))} punto={false}>{ETIQUETA_ESTADO_OFERTA[o.estado] ?? o.estado}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: 10, marginBottom: 0 }}>
            El equipo de Logística se encarga de contactar y emparejar cada oferta con las solicitudes.
          </p>
        </div>
      )}
    </AnimarEntrada>
  );
}

function TarjetaOferta({ o }: { o: any }) {
  return (
    <Link data-fila href={'/insumos/oportunidades/' + o.id} className="tarjeta insumo-card">
      <div className="fila" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span className="insignia">{ETIQUETA_TIPO_OFERTA[o.tipo_oferta] ?? o.tipo_oferta}</span>
        {o.tipo_oferta === 'dinero' && o.monto_estimado != null && <span className="muted" style={{ fontSize: '.8rem' }}>≈ {o.monto_estimado}</span>}
      </div>
      <strong style={{ display: 'block', margin: '6px 0 2px' }}>{o.organizacion}</strong>
      {(o.cubre_tipos ?? []).length > 0 && (
        <div className="fila" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {(o.cubre_tipos as string[]).map((t) => <span key={t} className="insignia" style={{ fontSize: '.72rem' }}>{ETIQUETA_TIPO_INSUMO[t] ?? t}</span>)}
        </div>
      )}
      {o.ubicacion && <div className="muted fila" style={{ gap: 4, fontSize: '.8rem', marginTop: 4 }}><Icono nombre="ubicacion" size={13} /> {o.ubicacion}</div>}
    </Link>
  );
}
