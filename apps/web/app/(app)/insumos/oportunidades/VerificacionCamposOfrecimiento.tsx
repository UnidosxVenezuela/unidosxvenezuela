import Icono from '@/components/Icono';
import { fechaHora } from '@/lib/fechas';
import {
  COLOR_VERIF_CAMPO, ETIQUETA_VERIF_CAMPO, PUNTO_VERIF_CAMPO,
  CAMPOS_VERIF_OFERTA, type EstadoVerifCampo,
} from '@/lib/constantes';
import { marcarCampoVerifOfrecimiento } from './actions';

type EstadoCampo = { estado: EstadoVerifCampo; nota?: string | null; verificado_por?: string | null; verificado_en?: string | null };

/** Verificación por campo del ofrecimiento (0194), mismo molde que los casos (0172):
 *  cada dato con su semáforo 🟢🟡🔴. Verificación lo marca; el resto lo ve. Cuando
 *  todos los campos quedan en verde, el ofrecimiento pasa a «Verificada» (candado). */
export default function VerificacionCamposOfrecimiento(
  { oportunidadId, clase, estados, volver, nombres, puedeVerificar = false }:
  { oportunidadId: string; clase: string; estados: Record<string, EstadoCampo>; volver: string; nombres?: Map<string, string>; puedeVerificar?: boolean },
) {
  const campos = CAMPOS_VERIF_OFERTA[clase] ?? CAMPOS_VERIF_OFERTA.donacion ?? [];
  const total = campos.length;
  const verificados = campos.filter((c) => estados[c.key]?.estado === 'verificado').length;
  const hayNeg = campos.some((c) => { const e = estados[c.key]?.estado; return e === 'falso' || e === 'requiere_info'; });
  const general: EstadoVerifCampo = verificados === total ? 'verificado' : (hayNeg ? 'requiere_info' : 'sin_revisar');
  const generalTxt = general === 'verificado' ? 'Verificada' : hayNeg ? 'Observada' : 'Pendiente';
  const opciones: EstadoVerifCampo[] = ['verificado', 'requiere_info', 'falso', 'sin_revisar'];

  return (
    <div className="tarjeta" style={{ marginTop: 12 }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="aside-titulo" style={{ margin: 0 }}><Icono nombre="ok" size={16} /> Verificación por campo</h3>
        <span className="fila" style={{ gap: 8 }}>
          <span style={{ color: COLOR_VERIF_CAMPO[general], fontWeight: 700, fontSize: '.9rem' }}>● {generalTxt}</span>
          <span className="muted" style={{ fontSize: '.82rem' }}>{verificados}/{total} verificados</span>
        </span>
      </div>
      {puedeVerificar
        ? <p className="muted" style={{ fontSize: '.82rem', margin: '4px 0 0' }}>Marca cada dato. El ofrecimiento queda <strong>Verificada</strong> (y puede avanzar) cuando todos están en verde.</p>
        : <p className="muted" style={{ fontSize: '.82rem', margin: '4px 0 0' }}>Estado marcado por el equipo de Verificación.</p>}

      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        {campos.map((c) => {
          const st = estados[c.key];
          const estado = (st?.estado ?? 'sin_revisar') as EstadoVerifCampo;
          return (
            <div key={c.key} style={{ borderTop: '1px solid var(--borde)', paddingTop: 8 }}>
              <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '.9rem' }}>{c.etiqueta}</strong>
                <span style={{ color: COLOR_VERIF_CAMPO[estado], fontSize: '.85rem', fontWeight: 600 }}>{PUNTO_VERIF_CAMPO[estado]} {ETIQUETA_VERIF_CAMPO[estado]}</span>
              </div>
              {st?.verificado_por && (
                <div className="muted" style={{ fontSize: '.76rem', marginTop: 2 }}>
                  {nombres?.get(st.verificado_por) ?? '—'}{st.verificado_en ? ' · ' + fechaHora(st.verificado_en) : ''}
                </div>
              )}
              {st?.nota && <div className="muted" style={{ fontSize: '.82rem' }}>Nota: {st.nota}</div>}
              {puedeVerificar && (
                <form action={marcarCampoVerifOfrecimiento} className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <input type="hidden" name="oportunidad_id" value={oportunidadId} />
                  <input type="hidden" name="campo" value={c.key} />
                  <input type="hidden" name="volver" value={volver} />
                  <input name="nota" defaultValue={st?.nota ?? ''} placeholder="Nota (opcional)" className="input"
                    style={{ minHeight: 32, padding: '2px 8px', width: 'auto', flex: '1 1 140px', fontSize: '.82rem' }} />
                  {opciones.map((op) => (
                    <button key={op} type="submit" name="estado" value={op} title={ETIQUETA_VERIF_CAMPO[op]}
                      className="btn" style={{ minHeight: 32, padding: '2px 8px', fontSize: '.8rem', color: COLOR_VERIF_CAMPO[op], borderColor: estado === op ? COLOR_VERIF_CAMPO[op] : undefined, fontWeight: estado === op ? 700 : 400 }}>
                      {PUNTO_VERIF_CAMPO[op]} {ETIQUETA_VERIF_CAMPO[op]}
                    </button>
                  ))}
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
