'use client';
// Redacción de un correo institucional a partir de una PLANTILLA, con
// previsualización en vivo (0217). El render usa exactamente las mismas funciones
// que la Server Action (`lib/correo.ts`), así que lo que se ve aquí es lo que sale.
//
// Va DENTRO del <form> de la página: los campos se envían con `name`, sin estado
// oculto ni JSON serializado. Las variables viajan como `var_<nombre>`.
import { useMemo, useState } from 'react';
import Icono from '@/components/Icono';
import { cuerpoFinal, etiquetaVariable, extraerVariables, renderizarTexto } from '@/lib/correo';

export type PlantillaCorreo = {
  id: string; clave: string; nombre: string; asunto: string;
  cuerpo_html: string; variables: string[] | null;
};
type Opcion = { id: string; etiqueta: string };

export default function Redactor({ plantillas, oportunidades, proveedores, oportunidadInicial, correoActivo }: {
  plantillas: PlantillaCorreo[];
  oportunidades: Opcion[];
  proveedores: Opcion[];
  oportunidadInicial?: string;
  correoActivo: boolean;
}) {
  const [plantillaId, setPlantillaId] = useState(plantillas[0]?.id ?? '');
  const [valores, setValores] = useState<Record<string, string>>({});

  const plantilla = plantillas.find((p) => p.id === plantillaId);
  const variables = useMemo(() => {
    if (!plantilla) return [] as string[];
    return plantilla.variables && plantilla.variables.length
      ? plantilla.variables
      : extraerVariables(plantilla.asunto, plantilla.cuerpo_html);
  }, [plantilla]);

  const asunto = plantilla ? renderizarTexto(plantilla.asunto, valores) : '';
  const cuerpo = plantilla ? cuerpoFinal(plantilla.cuerpo_html, valores) : '';
  const faltan = variables.filter((v) => !(valores[v] ?? '').trim());

  return (
    <div className="grid grid-2" style={{ alignItems: 'start', gap: 16 }}>
      {/* ── Columna 1: los datos ── */}
      <div>
        <div className="campo">
          <label htmlFor="plantilla_id">Plantilla</label>
          <select id="plantilla_id" name="plantilla_id" className="input" required
            value={plantillaId} onChange={(e) => { setPlantillaId(e.target.value); setValores({}); }}>
            {plantillas.length === 0 && <option value="">— No hay plantillas activas —</option>}
            {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="destinatario_nombre">Nombre del destinatario</label>
            <input id="destinatario_nombre" name="destinatario_nombre" className="input"
              placeholder="ej.: María Pérez" maxLength={120} />
          </div>
          <div className="campo">
            <label htmlFor="destinatario_email">Correo del destinatario</label>
            <input id="destinatario_email" name="destinatario_email" className="input" type="email"
              inputMode="email" required placeholder="contacto@empresa.com" maxLength={200} />
          </div>
        </div>

        {/* Vínculo: de qué cuelga este correo (queda en el seguimiento de la entidad). */}
        <details style={{ margin: '4px 0 12px', border: '1px solid var(--borde)', borderRadius: 10, padding: '10px 12px' }}
          open={!!oportunidadInicial}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Vincular a una empresa o proveedor · opcional</summary>
          <p className="muted" style={{ fontSize: '.82rem', margin: '8px 0 10px' }}>
            Si vinculas el correo, queda en el <strong>seguimiento</strong> de esa ficha: se puede ver qué se le escribió y cuándo.
          </p>
          <div className="grid grid-2">
            <div className="campo">
              <label htmlFor="oportunidad_id">Empresa o aliado</label>
              <select id="oportunidad_id" name="oportunidad_id" className="input" defaultValue={oportunidadInicial ?? ''}>
                <option value="">— Ninguna —</option>
                {oportunidades.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="proveedor_id">Proveedor</label>
              <select id="proveedor_id" name="proveedor_id" className="input" defaultValue="">
                <option value="">— Ninguno —</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
              </select>
            </div>
          </div>
        </details>

        {/* Variables de la plantilla */}
        {variables.length > 0 && (
          <div className="tarjeta" style={{ padding: 12 }}>
            <h2 className="fila" style={{ gap: 8, marginTop: 0, fontSize: '1rem' }}>
              <Icono nombre="pizarra" size={16} /> Datos de la plantilla
              <span className="muted" style={{ fontWeight: 400, fontSize: '.82rem' }}>({variables.length})</span>
            </h2>
            <div className="grid grid-2">
              {variables.map((v) => (
                <div className="campo" key={v}>
                  <label htmlFor={'var_' + v}>{etiquetaVariable(v)}</label>
                  <input id={'var_' + v} name={'var_' + v} className="input" maxLength={300}
                    value={valores[v] ?? ''} placeholder={'{{' + v + '}}'}
                    onChange={(e) => setValores((prev) => ({ ...prev, [v]: e.target.value }))} />
                </div>
              ))}
            </div>
            {faltan.length > 0 && (
              <p className="muted" style={{ fontSize: '.82rem', margin: '6px 0 0' }}>
                Faltan por completar: <strong>{faltan.map(etiquetaVariable).join(', ')}</strong>.
              </p>
            )}
          </div>
        )}

        <div className="campo" style={{ marginTop: 12 }}>
          <label htmlFor="asunto">Asunto <span className="muted">(opcional: si lo dejas vacío se usa el de la plantilla)</span></label>
          <input id="asunto" name="asunto" className="input" maxLength={300} placeholder={asunto || 'Asunto del correo'} />
        </div>
      </div>

      {/* ── Columna 2: la previsualización ── */}
      <div>
        <div className="tarjeta" style={{ position: 'sticky', top: 12 }}>
          <h2 className="fila" style={{ gap: 8, marginTop: 0, fontSize: '1rem' }}>
            <Icono nombre="ojo" size={16} /> Previsualización
          </h2>
          {!correoActivo && (
            <p className="muted" style={{ fontSize: '.82rem', margin: '0 0 8px' }}>
              El envío de correo no está configurado (falta <code>RESEND_API_KEY</code>). El correo quedará <strong>registrado</strong>, pero no saldrá.
            </p>
          )}
          <div style={{ borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
            <div className="muted" style={{ fontSize: '.8rem' }}>Asunto</div>
            <strong style={{ display: 'block', marginBottom: 10 }}>{asunto || '—'}</strong>
            <div className="muted" style={{ fontSize: '.8rem' }}>Cuerpo</div>
            {plantilla
              ? <div style={{ fontSize: '.92rem', lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: cuerpo }} />
              : <p className="muted" style={{ margin: 0 }}>Elige una plantilla para ver el correo.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
