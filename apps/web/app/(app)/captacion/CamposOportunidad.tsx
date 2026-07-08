import { CATEGORIAS_OPORTUNIDAD, ETIQUETA_CATEGORIA_OPORTUNIDAD } from '@/lib/constantes';

/** Campos compartidos del formulario de oportunidad (crear y editar). Server component. */
export default function CamposOportunidad({ o }: { o?: any }) {
  return (
    <div className="grid grid-2">
      <div className="campo">
        <label>Categoría</label>
        <select name="categoria" className="input" defaultValue={o?.categoria ?? 'fundacion'} required>
          {CATEGORIAS_OPORTUNIDAD.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA_OPORTUNIDAD[c]}</option>)}
        </select>
      </div>
      <div className="campo"><label>Nombre de la oportunidad</label><input name="titulo" className="input" required defaultValue={o?.titulo ?? ''} placeholder="ej: Fundación Amigos de Venezuela" /></div>
      <div className="campo"><label>Contacto</label><input name="contacto" className="input" defaultValue={o?.contacto ?? ''} placeholder="nombre · teléfono · correo" /></div>
      <div className="campo"><label>Ubicación</label><input name="ubicacion" className="input" defaultValue={o?.ubicacion ?? ''} placeholder="ciudad / dirección" /></div>
      <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Enlace o referencia</label><input name="enlace" className="input" inputMode="url" defaultValue={o?.enlace ?? ''} placeholder="https://…" /></div>
      <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Descripción</label><textarea name="descripcion" className="input" rows={4} defaultValue={o?.descripcion ?? ''} placeholder="Qué es, por qué es una oportunidad, próximos pasos…" /></div>
      <div className="campo" style={{ gridColumn: '1 / -1' }}>
        <label>Foto o archivo adjunto {o?.archivo_path && <span className="muted">(sube uno nuevo para reemplazar)</span>}</label>
        <input name="archivo" type="file" className="input" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
      </div>
    </div>
  );
}
