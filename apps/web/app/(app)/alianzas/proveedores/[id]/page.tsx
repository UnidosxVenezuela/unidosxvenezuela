import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO, UNIDADES_ITEM,
  PERIODICIDADES, ETIQUETA_PERIODICIDAD, EXPLICA_PERIODICIDAD,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import EstadoVacio from '@/components/EstadoVacio';
import Pill from '@/components/Pill';
import TarjetaCapacidad, { conUnidad, type Capacidad } from '@/components/CapacidadProveedor';
import { guardarCapacidad, retirarCapacidad, guardarProveedorAliado, cambiarActivoProveedor } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * FICHA DEL ALIADO (0224): sus datos y —lo que importa— TODO lo que se comprometió a
 * cubrir, con su periodicidad y su vigencia. Cada compromiso se declara una vez y se
 * corrige aquí; el cálculo de la ventana y de lo que queda lo hace la base
 * (`capacidades_de_proveedor`), nunca esta pantalla.
 *
 * Next 14.2: `params` es SÍNCRONO (no Promise) y `typedRoutes` está desactivado.
 */
export default async function FichaAliadoPage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil) && !puedeLogistica(perfil)) redirect('/dashboard');
  const supabase = await createClient();
  const id = params.id;

  const [provRes, capRes] = await Promise.all([
    supabase.from('proveedores')
      .select('id, nombre, tipo, contacto, notas, activo, oportunidad_id, creado_en')
      .eq('id', id).maybeSingle(),
    supabase.rpc('capacidades_de_proveedor', { p_proveedor: id, p_solo_vigentes: false }),
  ]);
  const prov = provRes.data as any;
  if (!prov) redirect('/alianzas/proveedores');
  const caps = (capRes.error ? [] : (capRes.data ?? [])) as Capacidad[];
  const sinMigracion = !!capRes.error;

  const activas = caps.filter((c) => c.activa !== false);
  const retiradas = caps.filter((c) => c.activa === false);

  /** Formulario compartido por «declarar» y «editar»: la RPC decide por `p_id`. */
  const Campos = ({ c }: { c?: Capacidad }) => (
    <>
      <input type="hidden" name="proveedor_id" value={id} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid grid-2">
        <div className="campo" style={{ gridColumn: '1 / -1' }}>
          <label>¿Qué puede cubrir?</label>
          <input name="descripcion" className="input" required maxLength={200} defaultValue={c?.descripcion ?? ''}
            placeholder="ej.: comidas calientes, agua potable, traslado en camión" />
        </div>
        <div className="campo">
          <label>Categoría</label>
          <select name="tipo" className="input" defaultValue={c?.tipo ?? 'otro'}>
            {TIPOS_INSUMO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_INSUMO[t]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label>Cantidad</label>
          <input name="cantidad" className="input" required inputMode="decimal" defaultValue={c ? String(c.cantidad) : ''} placeholder="50" />
        </div>
        <div className="campo">
          <label>Unidad <span className="muted">(opcional)</span></label>
          <input name="unidad" className="input" maxLength={40} list="unidades-capacidad" defaultValue={c?.unidad ?? ''} placeholder="raciones, kg, litros…" />
        </div>
        <div className="campo">
          <label>¿Cada cuánto?</label>
          <select name="periodicidad" className="input" defaultValue={c?.periodicidad ?? 'unica'}>
            {PERIODICIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PERIODICIDAD[p]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label>Desde <span className="muted">(opcional)</span></label>
          <input type="date" name="vigencia_desde" className="input" defaultValue={c?.vigencia_desde ?? ''} />
        </div>
        <div className="campo">
          <label>Hasta <span className="muted">(vacío = sin fecha de fin)</span></label>
          <input type="date" name="vigencia_hasta" className="input" defaultValue={c?.vigencia_hasta ?? ''} />
        </div>
        <div className="campo" style={{ gridColumn: '1 / -1' }}>
          <label>Notas <span className="muted">(condiciones, avisos previos, contacto para coordinar…)</span></label>
          <input name="notas" className="input" maxLength={500} defaultValue={c?.notas ?? ''} />
        </div>
      </div>
      <ul className="muted" style={{ margin: '2px 0 10px', paddingLeft: 18, fontSize: '.8rem', display: 'grid', gap: 2 }}>
        <li><strong>Una sola vez:</strong> {EXPLICA_PERIODICIDAD['unica']}</li>
        <li><strong>Recurrente:</strong> la cantidad vuelve a estar disponible cada periodo, contando desde la fecha de inicio del acuerdo (no desde el calendario).</li>
        <li><strong>Fecha «hasta»:</strong> es lo que marca un compromiso «por tiempo limitado». Al pasar ese día, Logística deja de contar con esta capacidad y la pantalla lo dice.</li>
      </ul>
    </>
  );

  return (
    <AnimarEntrada>
      <datalist id="unidades-capacidad">{UNIDADES_ITEM.map((u) => <option key={u} value={u} />)}</datalist>

      <Link href="/alianzas/proveedores" className="muted">← Aliados y su capacidad</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
            {prov.nombre}
            {prov.oportunidad_id && <Pill tono="info" punto={false}>Del CRM</Pill>}
            {prov.activo === false && <Pill tono="neutra" punto={false}>Dado de baja</Pill>}
          </h1>
          <p className="muted sub">
            {prov.tipo ? prov.tipo + ' · ' : ''}
            {prov.contacto ? prov.contacto : 'Sin contacto registrado'}
          </p>
        </div>
      </div>

      {prov.activo === false && (
        <div className="tarjeta" style={{ borderColor: 'var(--alta)' }}>
          <strong>Este aliado está dado de baja.</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '.86rem' }}>
            Su capacidad no se cuenta en Logística, pero todo lo que aportó se conserva. Reactívalo abajo si el acuerdo vuelve a estar en pie.
          </p>
        </div>
      )}

      {/* ── Los compromisos ── */}
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
          Con qué puede colaborar <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>({activas.length})</span>
        </h2>
      </div>

      {sinMigracion ? (
        <div className="tarjeta" style={{ borderColor: 'var(--critica)' }}>
          <strong>Falta aplicar la migración 0224</strong>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '.86rem' }}>Las capacidades no se pueden leer ni declarar todavía en esta base de datos.</p>
        </div>
      ) : activas.length === 0 ? (
        <EstadoVacio icono="caja" titulo="Sin capacidad declarada"
          texto="Mientras no se declare qué puede cubrir y cada cuánto, Logística no sabe con qué contar de este aliado." />
      ) : (
        <div className="grid grid-2" style={{ alignItems: 'stretch' }}>
          {activas.map((c) => (
            <TarjetaCapacidad key={c.id} cap={c} acciones={
              <>
                <details style={{ flex: 1 }}>
                  <summary className="btn" style={{ minHeight: 30, padding: '2px 10px', fontSize: '.8rem', cursor: 'pointer', display: 'inline-flex' }}>
                    <Icono nombre="pizarra" size={14} /> Editar
                  </summary>
                  <form action={guardarCapacidad} style={{ marginTop: 10 }}>
                    <Campos c={c} />
                    <div className="fila" style={{ gap: 8 }}>
                      <BotonEnviar>Guardar cambios</BotonEnviar>
                    </div>
                  </form>
                </details>
                <form action={retirarCapacidad}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="proveedor_id" value={id} />
                  <BotonConfirmar
                    mensaje={'¿Retirar «' + c.descripcion + '» (' + conUnidad(c.cantidad, c.unidad) + ')? Si ya hubo entregas ligadas a este compromiso se conservará como retirado, para no perder la historia.'}
                    className="btn btn-peligro" style={{ minHeight: 30, padding: '2px 10px', fontSize: '.8rem' }}>
                    <Icono nombre="basura" size={14} /> Retirar
                  </BotonConfirmar>
                </form>
              </>
            } />
          ))}
        </div>
      )}

      {/* ── Declarar uno nuevo ── */}
      {!sinMigracion && (
        <form action={guardarCapacidad} className="tarjeta" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Declarar una capacidad</h2>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '.85rem' }}>
            Una fila por cada cosa que el aliado se comprometió a cubrir. Ejemplo del acuerdo típico: «comidas calientes · 50 · raciones · cada semana».
          </p>
          <Campos />
          <BotonEnviar><Icono nombre="mas" size={16} /> Declarar capacidad</BotonEnviar>
        </form>
      )}

      {retiradas.length > 0 && (
        <details className="tarjeta" style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            Compromisos retirados ({retiradas.length})
          </summary>
          <p className="muted" style={{ margin: '6px 0 10px', fontSize: '.83rem' }}>
            Ya no se cuentan, pero se conservan porque hubo entregas ligadas a ellos.
          </p>
          <div className="grid grid-2" style={{ alignItems: 'stretch' }}>
            {retiradas.map((c) => <TarjetaCapacidad key={c.id} cap={c} />)}
          </div>
        </details>
      )}

      {/* ── Datos del aliado ── */}
      <details className="tarjeta" style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Datos del aliado</summary>
        <form action={guardarProveedorAliado} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="oportunidad_id" value={prov.oportunidad_id ?? ''} />
          <input type="hidden" name="activo" value={String(prov.activo !== false)} />
          <div className="grid grid-2">
            <div className="campo"><label>Nombre</label><input name="nombre" className="input" required maxLength={160} defaultValue={prov.nombre ?? ''} /></div>
            <div className="campo"><label>Tipo</label><input name="tipo" className="input" maxLength={60} defaultValue={prov.tipo ?? ''} /></div>
            <div className="campo"><label>Contacto</label><input name="contacto" className="input" maxLength={160} defaultValue={prov.contacto ?? ''} /></div>
            <div className="campo"><label>Notas</label><input name="notas" className="input" maxLength={500} defaultValue={prov.notas ?? ''} /></div>
          </div>
          <BotonEnviar>Guardar datos</BotonEnviar>
        </form>

        <form action={cambiarActivoProveedor} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="nombre" value={prov.nombre ?? ''} />
          <input type="hidden" name="tipo" value={prov.tipo ?? ''} />
          <input type="hidden" name="contacto" value={prov.contacto ?? ''} />
          <input type="hidden" name="notas" value={prov.notas ?? ''} />
          <input type="hidden" name="oportunidad_id" value={prov.oportunidad_id ?? ''} />
          <input type="hidden" name="activo" value={prov.activo === false ? 'true' : 'false'} />
          <BotonConfirmar
            mensaje={prov.activo === false
              ? '¿Reactivar a ' + prov.nombre + '? Logística volverá a contar con su capacidad.'
              : '¿Dar de baja a ' + prov.nombre + '? Su capacidad dejará de contarse; la historia de lo que aportó se conserva.'}
            className={prov.activo === false ? 'btn' : 'btn btn-peligro'}
            style={{ minHeight: 32, padding: '2px 10px' }}>
            {prov.activo === false ? 'Reactivar aliado' : 'Dar de baja'}
          </BotonConfirmar>
        </form>
      </details>

      <p className="muted" style={{ fontSize: '.78rem', marginTop: 12 }}>
        Lo que se declara aquí es exactamente lo que Logística ve en su directorio de proveedores como <strong>capacidad restante</strong>. Cada entrega registrada contra un compromiso lo descuenta, y corregirla lo devuelve en el acto: el número sale de lo aportado de verdad, no de una estimación.
      </p>
    </AnimarEntrada>
  );
}
