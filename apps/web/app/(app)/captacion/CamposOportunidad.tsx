import {
  CATEGORIAS_OPORTUNIDAD, ETIQUETA_CATEGORIA_OPORTUNIDAD,
  RUBROS_PROSPECCION, SCORE_CONFIABILIDAD,
} from '@/lib/constantes';

/** Campos compartidos del formulario de oportunidad (crear y editar). Server component.
 *  Incluye la Ficha de Prospección (0199): datos de empresa para el «Captado» del
 *  departamento de Alianzas Estratégicas. Los campos de la ficha son opcionales — el CRM
 *  simple de Captación sigue funcionando sin llenarlos; solo al usarla se activa el
 *  candado de la 2ª verificación. */
export default function CamposOportunidad({ o }: { o?: any }) {
  // Abre la ficha si ya trae datos de empresa (para no esconder lo que se está editando).
  const fichaAbierta = !!(o?.rubro || o?.capacidades || o?.responsable_nombre || o?.volumen || o?.origen);
  return (
    <>
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

      {/* Ficha de Prospección (0199): datos de empresa para el respaldo de la alianza. */}
      <details open={fichaAbierta} style={{ marginTop: 14, border: '1px solid var(--borde)', borderRadius: 10, padding: '10px 12px', background: 'var(--fondo-2, #f8fafc)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>🏢 Ficha de Prospección (empresa) · opcional</summary>
        <p className="muted" style={{ fontSize: '.82rem', margin: '8px 0 10px' }}>
          Complétala si es una <strong>empresa mediana/grande</strong> a la que se presentará una alianza. Es el respaldo para la 2ª verificación y la reportería que se presenta a la empresa.
        </p>
        <div className="grid grid-2">
          <div className="campo">
            <label>Origen</label>
            <select name="origen" className="input" defaultValue={o?.origen ?? ''}>
              <option value="">— Sin especificar —</option>
              <option value="prospeccion">Prospección (empresa)</option>
              <option value="captacion">Captación</option>
            </select>
          </div>
          <div className="campo">
            <label>Rubro</label>
            <select name="rubro" className="input" defaultValue={o?.rubro ?? ''}>
              <option value="">— Sin especificar —</option>
              {RUBROS_PROSPECCION.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Dirección</label><input name="direccion" className="input" defaultValue={o?.direccion ?? ''} placeholder="ciudad / dirección fiscal" /></div>
          <div className="campo"><label>Responsable de la alianza</label><input name="responsable_nombre" className="input" defaultValue={o?.responsable_nombre ?? ''} placeholder="nombre y apellido" /></div>
          <div className="campo"><label>Cargo del responsable</label><input name="responsable_cargo" className="input" defaultValue={o?.responsable_cargo ?? ''} placeholder="ej: Gerente de RSE" /></div>
          <div className="campo"><label>Teléfono del responsable</label><input name="responsable_telefono" className="input" inputMode="tel" defaultValue={o?.responsable_telefono ?? ''} placeholder="+58…" /></div>
          <div className="campo">
            <label>Score de confiabilidad</label>
            <select name="score_confiabilidad" className="input" defaultValue={o?.score_confiabilidad ?? ''}>
              <option value="">— Sin evaluar —</option>
              {SCORE_CONFIABILIDAD.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
            </select>
          </div>
          <div className="campo"><label>Contactos operativos</label><input name="contactos_operativos" className="input" defaultValue={o?.contactos_operativos ?? ''} placeholder="quién coordina la entrega" /></div>
          <div className="campo"><label>Contactos alternos</label><input name="contactos_alternos" className="input" defaultValue={o?.contactos_alternos ?? ''} placeholder="respaldo" /></div>
        </div>

        <p className="muted" style={{ fontWeight: 600, margin: '12px 0 4px', fontSize: '.85rem' }}>Capacidades y recursos de la empresa</p>
        <div className="grid grid-2">
          <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Capacidades y recursos</label><textarea name="capacidades" className="input" rows={2} defaultValue={o?.capacidades ?? ''} placeholder="Qué puede aportar la empresa (insumos, servicios, personal…)" /></div>
          <div className="campo"><label>Volumen / cantidad</label><input name="volumen" className="input" defaultValue={o?.volumen ?? ''} placeholder="ej: 1000 medicamentos / mes" /></div>
          <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
            <input id="transporte" name="transporte" type="checkbox" defaultChecked={!!o?.transporte} style={{ width: 18, height: 18 }} />
            <label htmlFor="transporte" style={{ margin: 0 }}>Cuenta con transporte propio</label>
          </div>
          <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Logística de entrega</label><textarea name="logistica_entrega" className="input" rows={2} defaultValue={o?.logistica_entrega ?? ''} placeholder="Cómo y dónde entrega" /></div>
          <div className="campo" style={{ gridColumn: '1 / -1' }}><label>Restricciones, horarios y condiciones</label><textarea name="restricciones" className="input" rows={2} defaultValue={o?.restricciones ?? ''} placeholder="Horarios de atención, requisitos, condiciones" /></div>
        </div>
      </details>
    </>
  );
}
