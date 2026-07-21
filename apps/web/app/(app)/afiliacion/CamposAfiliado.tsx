import { TIPOS_AFILIADO, ETIQUETA_TIPO_AFILIADO, CARGOS_AFILIACION } from '@/lib/constantes';

/** Campos compartidos del formulario de afiliado (crear y editar). Server component. */
export default function CamposAfiliado({ a }: { a?: any }) {
  return (
    <div className="grid grid-2">
      <div className="campo">
        <label>Tipo</label>
        <select name="tipo" className="input" defaultValue={a?.tipo ?? 'voluntario'} required>
          {TIPOS_AFILIADO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_AFILIADO[t]}</option>)}
        </select>
      </div>
      <div className="campo">
        <label>Cargo</label>
        <input name="cargo" className="input" list="cargos-afiliacion" defaultValue={a?.cargo ?? ''} placeholder="ej: Médico/a" />
        <datalist id="cargos-afiliacion">{CARGOS_AFILIACION.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div className="campo"><label>Nombre</label><input name="nombre" className="input" required defaultValue={a?.nombre ?? ''} placeholder="Nombre y apellido" /></div>
      <div className="campo"><label>Contacto</label><input name="contacto" className="input" defaultValue={a?.contacto ?? ''} placeholder="teléfono · correo" /></div>
      <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Habilidades / especialidad</label><input name="habilidades" className="input" defaultValue={a?.habilidades ?? ''} placeholder="ej: cirugía, logística de rutas, traducción EN/ES…" /></div>
      <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Notas</label><textarea name="notas" className="input" rows={3} defaultValue={a?.notas ?? ''} placeholder="Disponibilidad, condiciones, observaciones…" /></div>
    </div>
  );
}
