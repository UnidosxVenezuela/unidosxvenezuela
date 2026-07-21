import Icono from '@/components/Icono';
import { fechaHora } from '@/lib/fechas';
import {
  COLOR_VERIF_CAMPO, ETIQUETA_VERIF_CAMPO, PUNTO_VERIF_CAMPO,
  CAMPOS_VERIF_FICHA, type EstadoVerifCampo,
} from '@/lib/constantes';
import { marcarCampoVerifProspeccion } from './actions';

type EstadoCampo = { estado: EstadoVerifCampo; nota?: string | null; verificado_por?: string | null; verificado_en?: string | null };

/** 2ª verificación campo por campo de la Ficha de Prospección (0199), mismo molde que el
 *  ofrecimiento (0194) y los casos (0172): cada dato con su semáforo 🟢🟡🔴. La marca el
 *  departamento de Alianzas; cuando los campos requeridos quedan en verde, la ficha pasa a
 *  «Verificada» y puede enviarse a Logística (candado guardar_prospeccion). */
export default function VerificacionCamposFicha(
  { oportunidadId, estados, volver, nombres, puedeVerificar = false }:
  { oportunidadId: string; estados: Record<string, EstadoCampo>; volver: string; nombres?: Map<string, string>; puedeVerificar?: boolean },
) {
  const campos = CAMPOS_VERIF_FICHA;
  const total = campos.length;
  const verificados = campos.filter((c) => estados[c.key]?.estado === 'verificado').length;
  const hayNeg = campos.some((c) => { const e = estados[c.key]?.estado; return e === 'falso' || e === 'requiere_info'; });
  const general: EstadoVerifCampo = verificados === total ? 'verificado' : (hayNeg ? 'requiere_info' : 'sin_revisar');
  const generalTxt = general === 'verificado' ? 'Verificada' : hayNeg ? 'Observada' : 'Pendiente';
  const opciones: EstadoVerifCampo[] = ['verificado', 'requiere_info', 'falso', 'sin_revisar'];

  return (
    <div className="tarjeta" style={{ marginTop: 12 }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="aside-titulo" style={{ margin: 0 }}><Icono nombre="ok" size={16} /> 2ª verificación de la ficha</h3>
        <span className="fila" style={{ gap: 8 }}>
          <span style={{ color: COLOR_VERIF_CAMPO[general], fontWeight: 700, fontSize: '.9rem' }}>● {generalTxt}</span>
          <span className="muted" style={{ fontSize: '.82rem' }}>{verificados}/{total} verificados</span>
        </span>
      </div>
      {puedeVerificar
        ? <p className="muted" style={{ fontSize: '.82rem', margin: '4px 0 0' }}>Marca cada dato. La ficha queda <strong>Verificada</strong> (y puede enviarse a Logística) cuando todos están en verde.</p>
        : <p className="muted" style={{ fontSize: '.82rem', margin: '4px 0 0' }}>Estado marcado por el equipo de Alianzas.</p>}

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
                <form action={marcarCampoVerifProspeccion} className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
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
