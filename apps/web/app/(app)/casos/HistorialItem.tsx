import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_ITEM } from '@/lib/constantes';
import Icono from '@/components/Icono';

export type CambioItem = {
  id: string;
  item_id: string;
  campo: string;                    // etiqueta en español, tal como la escribe el trigger
  valor_anterior?: string | null;
  valor_nuevo?: string | null;
  actor_id?: string | null;
  creado_en: string;
};

/**
 * Traduce el valor CRUDO que guarda el historial a algo legible, según el campo.
 * El trigger guarda el valor tal cual está en la columna ('agua', 'en_gestion'), igual
 * que hacen 0178 y 0206: la traducción es cosa de la interfaz. Si un valor no está en
 * el catálogo (p. ej. un estado añadido en la base y aún no en la app), se muestra crudo
 * en vez de desaparecer.
 */
function valorLegible(campo: string, v: string | null | undefined): string {
  const s = String(v ?? '').trim();
  if (!s) return '—';
  if (campo === 'Tipo') return ETIQUETA_TIPO_INSUMO[s] ?? s;
  if (campo === 'Estado') return ETIQUETA_ESTADO_ITEM[s] ?? s;
  return s;
}

/**
 * Historial de cambios de UN ítem del desglose (0219).
 *
 * El desglose lo mantienen tres áreas a la vez —Recopilación (quien reporta),
 * Verificación (quien corrige) y Logística (quien afina las cantidades reales)— y lo
 * que se necesita cambia con el tiempo. Cada modificación queda registrada: qué campo,
 * el valor de antes, el de después, quién y cuándo. Append-only: nada se borra.
 *
 * Se muestra a TODO el que puede abrir la solicitud (transparencia, igual que el bloque
 * «Correcciones de datos»), no solo a quien puede editar. Los valores son los mismos que
 * ya se ven en la línea del ítem: no añade superficie de privacidad.
 */
export default function HistorialItem({ cambios, nombres }: {
  cambios: CambioItem[];
  nombres?: Map<string, string>;
}) {
  if (!cambios || cambios.length === 0) return null;
  return (
    <details style={{ marginTop: 6 }}>
      <summary className="muted fila" style={{ cursor: 'pointer', fontSize: '.82rem', gap: 5 }}>
        <Icono nombre="historial" size={13} />
        {cambios.length === 1 ? '1 cambio registrado' : cambios.length + ' cambios registrados'}
      </summary>
      <ul className="timeline" style={{ marginTop: 6, marginBottom: 0 }}>
        {cambios.map((c) => (
          <li key={c.id}>
            <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{c.campo}</div>
            <div style={{ fontSize: '.82rem' }}>
              <span style={{ textDecoration: 'line-through', opacity: .7 }}>{valorLegible(c.campo, c.valor_anterior)}</span>
              {' → '}
              <strong>{valorLegible(c.campo, c.valor_nuevo)}</strong>
            </div>
            <div className="muted" style={{ fontSize: '.76rem' }}>
              {fechaHora(c.creado_en)}{c.actor_id ? ' · por ' + (nombres?.get(c.actor_id) ?? '—') : ''}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
