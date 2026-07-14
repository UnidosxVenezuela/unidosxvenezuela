import { editarOportunidad } from './actions';
import {
  TIPOS_OFERTA, ETIQUETA_TIPO_OFERTA, CLASES_OFERTA, ETIQUETA_CLASE_OFERTA,
  ORIGENES_OFERTA, ETIQUETA_ORIGEN_OFERTA, TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonEnviar from '@/components/BotonEnviar';

// Editar el ofrecimiento (Verificación, Logística o el creador de Recopilación). Colapsable
// para no saturar la ficha. Incluye subir imágenes/archivos. Guardar retira el «requiere info».
export default function FormEditarOfrecimiento({ oo }: { oo: any }) {
  const cubre = (oo.cubre_tipos ?? []) as string[];
  return (
    <details className="tarjeta">
      <summary className="fila" style={{ cursor: 'pointer', fontWeight: 600, gap: 6 }}>
        <Icono nombre="documento" size={16} /> Editar ofrecimiento / agregar imágenes
      </summary>
      <form action={editarOportunidad} style={{ marginTop: 10 }}>
        <input type="hidden" name="id" value={oo.id} />
        <div className="campo"><label htmlFor="ed_org">¿Quién ofrece?</label>
          <input id="ed_org" name="organizacion" className="input" defaultValue={oo.organizacion ?? ''} required maxLength={160} />
        </div>
        <div className="grid grid-2">
          <div className="campo"><label>Tipo de oferta</label>
            <select name="tipo_oferta" className="input" defaultValue={oo.tipo_oferta ?? 'especie'}>
              {TIPOS_OFERTA.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_OFERTA[t] ?? t}</option>)}
            </select>
          </div>
          <div className="campo"><label>Clase</label>
            <select name="clase" className="input" defaultValue={oo.clase ?? 'donacion'}>
              {CLASES_OFERTA.map((c) => <option key={c} value={c}>{ETIQUETA_CLASE_OFERTA[c] ?? c}</option>)}
            </select>
          </div>
          <div className="campo"><label>Quién ofrece (origen)</label>
            <select name="origen" className="input" defaultValue={oo.origen ?? ''}>
              <option value="">— No especificado —</option>
              {ORIGENES_OFERTA.map((o) => <option key={o} value={o}>{ETIQUETA_ORIGEN_OFERTA[o] ?? o}</option>)}
            </select>
          </div>
          <div className="campo"><label>Contacto</label>
            <input name="contacto" className="input" defaultValue={oo.contacto ?? ''} placeholder="nombre · teléfono · correo" />
          </div>
          <div className="campo"><label>Ubicación</label>
            <input name="ubicacion" className="input" defaultValue={oo.ubicacion ?? ''} />
          </div>
          <div className="campo"><label>Monto estimado (si es dinero)</label>
            <input name="monto_estimado" type="number" min="0" step="0.01" className="input" defaultValue={oo.monto_estimado ?? ''} />
          </div>
        </div>
        <div className="campo"><label>Enlace</label>
          <input name="enlace" className="input" defaultValue={oo.enlace ?? ''} placeholder="https://…" />
        </div>
        <div className="campo"><label>Descripción</label>
          <textarea name="descripcion" className="input" rows={3} defaultValue={oo.descripcion ?? ''} />
        </div>
        <div className="campo"><label>Puede cubrir</label>
          <div className="fila" style={{ gap: 10, flexWrap: 'wrap' }}>
            {TIPOS_INSUMO.map((t) => (
              <label key={t} className="fila" style={{ gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" name="cubre_tipos" value={t} defaultChecked={cubre.includes(t)} /> {ETIQUETA_TIPO_INSUMO[t] ?? t}
              </label>
            ))}
          </div>
        </div>
        <div className="campo"><label htmlFor="ed_arch">Agregar imágenes / archivos</label>
          <input id="ed_arch" name="archivos" type="file" multiple accept="image/*,.pdf" className="input" />
          <p className="muted" style={{ fontSize: '.78rem', margin: '4px 0 0' }}>Se suman a los adjuntos existentes (hasta 10, 10&nbsp;MB c/u).</p>
        </div>
        <BotonEnviar className="btn btn-primario">Guardar cambios</BotonEnviar>
      </form>
    </details>
  );
}
