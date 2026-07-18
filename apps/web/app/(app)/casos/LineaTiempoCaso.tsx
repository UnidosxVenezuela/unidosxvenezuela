import { fechaCorta } from '@/lib/fechas';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import { ETIQUETA_AREA_DESTINO, ETIQUETA_ESTADO_DERIVACION } from '@/lib/constantes';

const TONO_DERIV: Record<string, string> = { sin_tomar: 'neutra', tomada: 'info', en_proceso: 'aviso', cerrada: 'ok' };

type Marca = 'hecho' | 'actual' | 'pendiente' | 'fuera';
const COLOR_MARCA: Record<Marca, string> = {
  hecho: 'var(--ok-solido, #16a34a)', actual: 'var(--azul, #4f46e5)', pendiente: 'var(--borde, #cbd5e1)', fuera: 'var(--peligro-solido, #dc2626)',
};

/**
 * Línea de tiempo / «estado del caso» (Requerimiento Paso 5): recorrido completo de la
 * solicitud —Gestión de la Información → Verificación (Validado) → Derivación (a cada
 * área, con su estado) → Cierre— visible para todas las áreas. Solo muestra estado y
 * avance; no expone datos sensibles (Paso 10). Se arma con datos ya cargados: estado,
 * validación (verif_campos) y derivaciones (0177).
 */
export default function LineaTiempoCaso({ caso, derivaciones = [], casoValidado = false, nombres }: {
  caso: any; derivaciones?: any[]; casoValidado?: boolean; nombres?: Map<string, string>;
}) {
  const estado = caso.estado;
  const cerrado = estado === 'resuelto';
  const fuera = estado === 'falso';
  const derivs = (derivaciones ?? []) as any[];
  const derivado = derivs.length > 0;

  const pasos: { titulo: string; marca: Marca; detalle?: string; derivaciones?: boolean }[] = [
    { titulo: 'Gestión de la Información', marca: 'hecho', detalle: 'Solicitud creada' + (caso.creado_en ? ' · ' + fechaCorta(caso.creado_en) : '') },
    { titulo: 'Verificación', marca: casoValidado ? 'hecho' : (fuera ? 'fuera' : 'actual'),
      detalle: casoValidado ? '✔ Validado' : (fuera ? 'Descartada' : 'En verificación') },
    { titulo: 'Derivación', marca: derivado ? (cerrado ? 'hecho' : 'actual') : 'pendiente', derivaciones: true,
      detalle: derivado ? undefined : (fuera ? 'No aplica' : 'Sin derivar aún') },
    { titulo: 'Cierre', marca: cerrado ? 'hecho' : (fuera ? 'fuera' : 'pendiente'),
      detalle: cerrado ? '✔ Solicitud atendida' : (fuera ? 'Salió del flujo' : 'Pendiente') },
  ];

  return (
    <div className="tarjeta">
      <h3 className="aside-titulo"><Icono nombre="flecha" size={16} /> Estado del caso (línea de tiempo)</h3>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: '.8rem' }}>Recorrido de la solicitud, visible para todas las áreas. No incluye datos de contacto ni evidencias.</p>
      <div style={{ display: 'grid', gap: 0 }}>
        {pasos.map((p, i) => (
          <div key={p.titulo} className="fila" style={{ gap: 10, alignItems: 'stretch' }}>
            {/* Rail: punto + línea conectora */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
              <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: COLOR_MARCA[p.marca], border: '2px solid var(--sup2, #fff)', flex: '0 0 auto', marginTop: 3 }} />
              {i < pasos.length - 1 && <span aria-hidden style={{ width: 2, flex: 1, background: 'var(--borde)', minHeight: 14 }} />}
            </div>
            {/* Contenido del paso */}
            <div style={{ paddingBottom: i < pasos.length - 1 ? 12 : 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{p.titulo}</div>
              {p.derivaciones && derivado ? (
                <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {derivs.map((d) => (
                    <span key={d.id} className="insignia" style={{ fontSize: '.74rem', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      {ETIQUETA_AREA_DESTINO[d.area as keyof typeof ETIQUETA_AREA_DESTINO] ?? d.area}
                      <Pill tono={(TONO_DERIV[d.estado] ?? 'neutra') as any} punto={false}>
                        {ETIQUETA_ESTADO_DERIVACION[d.estado as keyof typeof ETIQUETA_ESTADO_DERIVACION] ?? d.estado}
                        {d.tomado_por && nombres?.get(d.tomado_por) ? ' · ' + nombres.get(d.tomado_por) : ''}
                      </Pill>
                    </span>
                  ))}
                </div>
              ) : (
                p.detalle && <div className="muted" style={{ fontSize: '.82rem', marginTop: 1 }}>{p.detalle}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
