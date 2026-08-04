import Icono from './Icono';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_TIPO_INSUMO } from '@/lib/constantes';

/** Forma que devuelve la RPC `historial_proveedor()` (0225). */
export type HistorialProveedorData = {
  proveedor?: { id: string; nombre: string; tipo?: string | null; activo?: boolean; desde?: string | null };
  kpis?: {
    total_aportado?: number; n_aportes?: number; n_casos?: number; tipos_distintos?: number;
    primera?: string | null; ultima?: string | null; dias_sin_aportar?: number | null;
  };
  por_tipo?: { tipo: string; total: number; n: number }[];
  por_mes?: { mes: string; total: number; n: number }[];
  capacidad_vs_entregado?: {
    capacidad_id: string; descripcion?: string | null; tipo: string; unidad?: string | null;
    periodicidad: string; comprometido: number; entregado: number; restante: number; activa: boolean;
  }[];
  ultimos?: { fecha: string; cantidad: number; unidad?: string | null; tipo: string; descripcion?: string | null; caso_id?: string | null }[];
  donaciones_declaradas?: { n?: number; monto?: number; por_estado?: Record<string, number> };
};

function num(n: number | null | undefined): string {
  if (n == null) return '—';
  const v = Number(n);
  if (!isFinite(v)) return '—';
  return v % 1 === 0 ? v.toLocaleString('es-VE') : v.toFixed(1);
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function etiquetaMes(iso: string): string {
  const [a, m] = (iso ?? '').split('-');
  const i = Number(m) - 1;
  return (MES_CORTO[i] ?? m ?? '') + ' ’' + (a ?? '').slice(2);
}

/**
 * HISTORIAL DE CONTRIBUCIONES DE UN ALIADO (0225) — cuánto ha aportado de verdad esta
 * empresa, desde cuándo, en qué, y cómo evoluciona. Es el dato con el que Logística
 * decide a quién pedir.
 *
 * Todo sale de `casos_item_aportes` (0221), el único registro numérico y estructurado
 * de lo entregado. Los aportes de TERCEROS quedan fuera por construcción: lo que cubrió
 * otra ONG no es contribución de este aliado.
 *
 * Server Component puro: no lleva estado ni acciones. Lo pintan igual la ficha del
 * aliado en Alianzas y el directorio de proveedores en Logística.
 */
export default function HistorialProveedor({ d }: { d: HistorialProveedorData }) {
  const k = d.kpis ?? {};
  const porTipo = d.por_tipo ?? [];
  const porMes = d.por_mes ?? [];
  const ultimos = d.ultimos ?? [];
  const don = d.donaciones_declaradas ?? {};
  const nAportes = Number(k.n_aportes ?? 0);

  if (nAportes === 0) {
    return (
      <div className="tarjeta" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Historial de contribuciones</h2>
        <p className="muted" style={{ margin: 0 }}>
          Este aliado todavía no tiene ninguna entrega registrada. En cuanto se registre un aporte
          contra uno de sus compromisos, aquí aparecerá cuánto ha dado, en qué y con qué constancia.
        </p>
      </div>
    );
  }

  const maxTipo = porTipo.reduce((m, t) => Math.max(m, Number(t.total)), 0);
  const maxMes = porMes.reduce((m, x) => Math.max(m, Number(x.total)), 0);
  const dias = k.dias_sin_aportar;
  const frio = dias != null && Number(dias) > 60;

  return (
    <div className="tarjeta" style={{ marginTop: 12 }}>
      <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Historial de contribuciones</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <div>
          <div className="muted" style={{ fontSize: '.78rem' }}>Total aportado</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{num(k.total_aportado)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '.78rem' }}>Entregas</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{nAportes}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '.78rem' }}>Casos atendidos</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{Number(k.n_casos ?? 0)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '.78rem' }}>Última contribución</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 6, color: frio ? '#ea580c' : 'var(--texto)' }}>
            {dias == null ? '—' : Number(dias) === 0 ? 'hoy' : 'hace ' + Number(dias) + ' día(s)'}
          </div>
        </div>
      </div>

      {frio && (
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 8, marginBottom: 0 }}>
          <Icono nombre="aviso" size={14} /> Lleva más de dos meses sin aportar: puede que la relación necesite un contacto.
        </p>
      )}

      {/* Evolución por mes */}
      {porMes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: '.9rem', margin: '0 0 8px' }}>Por mes</h3>
          <div className="fila" style={{ gap: 6, alignItems: 'flex-end', height: 72, flexWrap: 'nowrap', overflowX: 'auto' }}>
            {porMes.map((m) => {
              const alto = maxMes ? Math.max(4, Math.round((Number(m.total) / maxMes) * 60)) : 4;
              return (
                <div key={m.mes} style={{ textAlign: 'center', minWidth: 34 }}
                     title={etiquetaMes(m.mes) + ': ' + num(m.total) + ' en ' + m.n + ' entrega(s)'}>
                  <div style={{ height: alto, borderRadius: '3px 3px 0 0', background: 'var(--acento, #2563eb)' }} />
                  <div className="muted" style={{ fontSize: '.66rem', marginTop: 3 }}>{etiquetaMes(m.mes)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Peso por tipo */}
      {porTipo.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: '.9rem', margin: '0 0 8px' }}>En qué contribuye</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {porTipo.map((t) => {
              const ancho = maxTipo ? Math.round((Number(t.total) / maxTipo) * 100) : 0;
              return (
                <div key={t.tipo}>
                  <div className="fila" style={{ justifyContent: 'space-between', fontSize: '.85rem', marginBottom: 3 }}>
                    <strong>{ETIQUETA_TIPO_INSUMO[t.tipo] ?? t.tipo}</strong>
                    <span className="muted">{num(t.total)} en {t.n} entrega(s)</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: 'var(--sup2)' }}>
                    <div style={{ height: '100%', width: ancho + '%', borderRadius: 4, background: 'var(--acento, #2563eb)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Últimas entregas */}
      {ultimos.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' }}>
            Últimas {ultimos.length} entregas
          </summary>
          <table className="tabla" style={{ marginTop: 8 }}>
            <thead><tr><th>Fecha</th><th>Qué</th><th style={{ textAlign: 'right' }}>Cantidad</th></tr></thead>
            <tbody>
              {ultimos.map((u, i) => (
                <tr key={i}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fechaHora(u.fecha)}</td>
                  <td>{u.descripcion || (ETIQUETA_TIPO_INSUMO[u.tipo] ?? u.tipo)}</td>
                  <td style={{ textAlign: 'right' }}><strong>{num(u.cantidad)}</strong> {u.unidad ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {Number(don.n ?? 0) > 0 && (
        <p className="muted" style={{ fontSize: '.78rem', marginTop: 12, marginBottom: 0 }}>
          Además hay {Number(don.n)} donación(es) anotadas a mano en el registro declarativo
          {Number(don.monto ?? 0) > 0 ? ' por ' + num(don.monto) + ' en dinero' : ''}. Se cuentan aparte:
          lo de arriba es lo entregado y verificado contra el desglose de una solicitud.
        </p>
      )}
    </div>
  );
}
