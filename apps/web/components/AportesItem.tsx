import Icono from './Icono';
import Pill from './Pill';
import BotonConfirmar from './BotonConfirmar';
import { fechaCorta } from '@/lib/fechas';
import { nombreMostrado } from '@/lib/nombre';
import { ETIQUETA_ORIGEN_APORTE, ORIGENES_APORTE, esAporteDeTercero, cantidadItem } from '@/lib/constantes';
import { cumplimientoItem, type AporteItem } from '@/lib/flujo';

export type { AporteItem };

/**
 * La barra de cobertura, en dos tramos: lo que cubrió la organización y lo que cubrió un
 * TERCERO (en teal). Vive aquí y no en cada pantalla porque la distinción tiene que
 * leerse IGUAL en el tablero de Logística, en el detalle de la solicitud y en Redacción:
 * si cada sitio la pintara a su manera, dejaría de significar lo mismo.
 */
export function BarraCobertura({ pct, pctTercero = 0, etiqueta, aria = 'Cobertura' }: {
  pct: number; pctTercero?: number; etiqueta?: string; aria?: string;
}) {
  const ter = Math.min(Math.max(pctTercero, 0), pct);
  return (
    <div className="cob-item">
      {etiqueta && <span className="cob-txt">{etiqueta}</span>}
      <div className="cobertura-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={aria}>
        <div className="cobertura-fill" style={{ width: (pct - ter) + '%' }} />
        <div className="cobertura-fill tercero" style={{ width: ter + '%' }} />
      </div>
    </div>
  );
}

/** % que representan los aportes de terceros sobre lo pedido (para `BarraCobertura`). */
export function pctTerceros(cubiertoTercero: number, pedido: number): number {
  return pedido > 0 ? Math.round((cubiertoTercero / pedido) * 1000) / 10 : 0;
}

/**
 * CUMPLIMIENTO de un ítem del desglose (0221): cuánto se cubrió de cuánto, quién aportó
 * y cuánto puso cada uno, y —lo que se pidió de forma explícita— si lo cubrió UN TERCERO.
 *
 * Por qué la distinción está por todas partes en este componente: un ítem cubierto por
 * otra ONG o por una persona ajena **deja de requerir gestión nuestra**, pero tampoco
 * cuenta como capacidad de la organización. Verlo de un vistazo cambia lo que hace
 * Logística (deja de buscarlo) y lo que hace Redacción (deja de difundirlo), y evita que
 * la reportería confunda «lo entregamos» con «lo entregó otro».
 *   · la barra se parte en dos tramos (nosotros / terceros, en teal);
 *   · el aportante de fuera lleva su nombre delante, no un genérico;
 *   · si TODO lo cubierto vino de fuera, se marca con una insignia propia.
 *
 * Server Component puro. Las Server Actions llegan como PROPS (no se importan aquí) para
 * que el componente lo puedan usar Logística —que sí escribe— y Redacción o Verificación
 * —que solo miran—. La autorización real vive en las RPC (`registrar_aporte_item`,
 * `marcar_item_cubierto_tercero`, `eliminar_aporte_item`), no en estos botones.
 */
export default function AportesItem({
  item, aportes = [], verFull = false, alAportar, alTercero, alQuitar, volver = '', soloLectura = false,
}: {
  item: { id: string; descripcion?: string | null; cantidad?: number | string | null; unidad?: string | null; estado?: string | null };
  aportes?: AporteItem[];
  verFull?: boolean;
  alAportar?: (formData: FormData) => void | Promise<void>;
  alTercero?: (formData: FormData) => void | Promise<void>;
  alQuitar?: (formData: FormData) => void | Promise<void>;
  volver?: string;
  soloLectura?: boolean;
}) {
  const c = cumplimientoItem(item, aportes);
  const puedeEscribir = !soloLectura && (alAportar || alTercero);
  if (aportes.length === 0 && !puedeEscribir && !c.medible) return null;

  return (
    <div style={{ marginTop: 6 }}>
      {/* Cuánto de cuánto. Sin cantidad numérica no hay porcentaje que enseñar: manda el
          estado del semáforo y solo se listan los aportes. */}
      {(c.medible || c.cubierto > 0) && (
        <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {c.medible
            ? <BarraCobertura pct={c.pct ?? 0} pctTercero={c.pctTercero ?? 0} etiqueta={c.etiqueta}
                aria={'Cobertura de ' + (item.descripcion ?? 'el ítem')} />
            : <span className="cob-txt">{c.etiqueta}</span>}
          {c.medible && (c.falta ?? 0) > 0 && (
            <span className="cob-txt falta">faltan {cantidadItem(c.falta)}{item.unidad ? ' ' + item.unidad : ''}</span>
          )}
          {c.porTercero && <Pill tono="info" punto={false}>🤝 Lo cubrió un tercero</Pill>}
          {!c.porTercero && c.hayTerceros && <Pill tono="info" punto={false}>🤝 con aporte de terceros</Pill>}
        </div>
      )}

      {/* Quién aportó y cuánto puso cada uno. El nombre de un compañero se muestra con la
          regla de privacidad de siempre (solo el primer nombre salvo administración); el
          de una organización externa va completo, que para eso se registró. */}
      {aportes.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', display: 'grid', gap: 2 }}>
          {aportes.map((a) => {
            const esTercero = esAporteDeTercero(a.origen);
            const quien = a.perfil_id ? nombreMostrado(a.quien, verFull) : (a.quien ?? '');
            return (
              <li key={a.id ?? `${a.item_id}-${a.creado_en}`} className="fila"
                style={{ gap: 6, flexWrap: 'wrap', fontSize: '.8rem', alignItems: 'center' }}>
                <span aria-hidden="true">{esTercero ? '🤝' : '•'}</span>
                <strong style={{ fontWeight: 600 }}>{cantidadItem(a.cantidad)}{item.unidad ? ' ' + item.unidad : ''}</strong>
                {quien && <><span className="muted">·</span><span>{quien}</span></>}
                <span className="insignia" style={{ fontSize: '.7rem' }}>{ETIQUETA_ORIGEN_APORTE[a.origen ?? 'miembro'] ?? a.origen}</span>
                {a.nota && <span className="muted" style={{ fontSize: '.76rem' }}>{a.nota}</span>}
                {a.creado_en && <span className="muted" style={{ fontSize: '.72rem' }}>{fechaCorta(a.creado_en)}</span>}
                {alQuitar && a.id && (
                  <form action={alQuitar}>
                    <input type="hidden" name="aporte_id" value={a.id} />
                    <input type="hidden" name="volver" value={volver} />
                    <BotonConfirmar
                      mensaje={'¿Quitar este aporte de ' + cantidadItem(a.cantidad) + '? El ítem volverá a «en gestión» si con eso baja del 100 %.'}
                      className="btn" style={{ minHeight: 20, padding: '0 6px', fontSize: '.68rem' }}>✕</BotonConfirmar>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {puedeEscribir && (
        <details style={{ marginTop: 4 }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: '.8rem' }}>
            Registrar lo que se consiguió {c.medible && (c.falta ?? 0) > 0 ? `(faltan ${cantidadItem(c.falta)})` : ''}
          </summary>

          {alAportar && (
            <form action={alAportar} style={{ marginTop: 6 }}>
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="volver" value={volver} />
              <div className="grid grid-2">
                <div className="campo">
                  <label htmlFor={item.id + '-apc'}>Cantidad{item.unidad ? ' (' + item.unidad + ')' : ''}</label>
                  <input id={item.id + '-apc'} name="cantidad" className="input" type="number" min={0} step="any"
                    inputMode="decimal" placeholder={c.medible ? 'Vacío = lo que falta (' + cantidadItem(c.falta) + ')' : 'Ej.: 4'} />
                </div>
                <div className="campo">
                  <label htmlFor={item.id + '-apo'}>¿De dónde salió?</label>
                  <select id={item.id + '-apo'} name="origen" className="input" defaultValue="miembro">
                    {ORIGENES_APORTE.map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN_APORTE[o]}</option>)}
                  </select>
                </div>
              </div>
              <div className="campo">
                <label htmlFor={item.id + '-apq'}>Quién lo puso (si es de fuera)</label>
                <input id={item.id + '-apq'} name="tercero" className="input" maxLength={160}
                  placeholder="Ej.: Cruz Roja · Panadería El Trigal · vecinos del sector" />
                <span className="muted" style={{ fontSize: '.76rem' }}>Obligatorio si el origen es «Otra organización o persona».</span>
              </div>
              <div className="campo">
                <label htmlFor={item.id + '-apn'}>Nota (opcional)</label>
                <input id={item.id + '-apn'} name="nota" className="input" maxLength={500} placeholder="Detalle útil para el registro" />
              </div>
              <button className="btn btn-primario" type="submit" style={{ width: '100%' }}>
                <Icono nombre="mas" size={15} /> Registrar aporte
              </button>
            </form>
          )}

          {/* P9 — el atajo: «esto ya lo cubrió otro, quítalo de nuestra cola». Registra el
              aporte de tercero por TODO lo que faltaba y cierra el ítem. */}
          {alTercero && item.estado !== 'cumplido' && (
            <form action={alTercero} style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--borde)' }}>
              <input type="hidden" name="item_id" value={item.id} />
              <input type="hidden" name="volver" value={volver} />
              <div className="campo">
                <label htmlFor={item.id + '-ter'}>Lo cubrió otra organización o persona</label>
                <input id={item.id + '-ter'} name="tercero" className="input" maxLength={160} required
                  placeholder="¿Quién lo cubrió? Ej.: Cruz Roja" />
                <span className="muted" style={{ fontSize: '.76rem' }}>
                  Se da por cubierto y <strong>deja de gestionarse</strong>. Queda registrado que lo cubrió un tercero, no la organización.
                </span>
              </div>
              <BotonConfirmar
                mensaje={'¿Marcar «' + (item.descripcion ?? 'este ítem') + '» como cubierto por un tercero? Dejará de gestionarse y quedará registrado quién lo cubrió.'}
                className="btn" confirmar="Sí, lo cubrió un tercero" style={{ width: '100%' }}>
                🤝 Cubierto por un tercero
              </BotonConfirmar>
            </form>
          )}
        </details>
      )}
    </div>
  );
}
