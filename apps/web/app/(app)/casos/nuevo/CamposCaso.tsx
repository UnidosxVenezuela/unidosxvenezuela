'use client';
import { useState } from 'react';
import { CATEGORIAS_CASO, SITUACIONES_BUSQUEDA } from '@/lib/constantes';
import AvisoEnlace from '@/components/AvisoEnlace';

// Campos del caso: categoría, fecha, fuente y enlace. Cuando la categoría es
// «Desaparecidos», el formulario se despliega para capturar los datos de la persona
// y del reporte (edad, sexo, última ubicación, situación, quién reporta, es NNA), de
// modo que la ficha del Grupo de Búsqueda nazca lo más completa posible (0100).
export default function CamposCaso({ defecto = CATEGORIAS_CASO[1] }: { defecto?: string }) {
  const [cat, setCat] = useState(defecto);
  const esDesaparecido = cat === 'Desaparecidos';
  return (
    <>
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="categoria">Categoría</label>
          <select id="categoria" name="categoria" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIAS_CASO.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fecha_publicacion">{esDesaparecido ? 'Fecha de desaparición' : 'Fecha de publicación'}</label>
          <input id="fecha_publicacion" name="fecha_publicacion" className="input" type="date" />
        </div>
        <div className="campo">
          <label htmlFor="fuente">Fuente</label>
          <input id="fuente" name="fuente" className="input" placeholder={esDesaparecido ? 'Ej.: Familia · reporte directo' : 'Ej.: Facebook - Familia Pérez'} />
        </div>
        <div className="campo">
          <label htmlFor="fuente_url">Enlace de la fuente (opcional)</label>
          <AvisoEnlace name="fuente_url" />
        </div>
      </div>

      {esDesaparecido && (
        <div className="tarjeta" style={{ background: 'var(--gris-claro, #f8fafc)', borderColor: '#cbd5e1', marginBottom: 12 }}>
          <strong>Datos de la persona desaparecida</strong>
          <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 10px' }}>
            El <strong>título</strong> del caso es el nombre completo de la persona. Completa lo que sepas; el Grupo de Búsqueda podrá afinarlo después.
          </p>
          <div className="grid grid-2">
            <div className="campo">
              <label htmlFor="edad">Edad</label>
              <input id="edad" name="edad" type="number" min={0} max={130} className="input" placeholder="Años" />
            </div>
            <div className="campo">
              <label htmlFor="sexo">Sexo</label>
              <select id="sexo" name="sexo" className="input" defaultValue="">
                <option value="">Sin especificar</option>
                <option value="m">Masculino</option>
                <option value="f">Femenino</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="ultima_ubicacion">Última ubicación conocida</label>
            <input id="ultima_ubicacion" name="ultima_ubicacion" className="input" placeholder="Sector, referencia, hora aproximada…" />
          </div>
          <div className="grid grid-2">
            <div className="campo">
              <label htmlFor="situacion">Situación</label>
              <select id="situacion" name="situacion" className="input" defaultValue="">
                <option value="">Sin especificar</option>
                {SITUACIONES_BUSQUEDA.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="reporta_telefono">Teléfono de quien reporta</label>
              <input id="reporta_telefono" name="reporta_telefono" type="tel" className="input" placeholder="Ej.: 0412 000 0000" />
            </div>
          </div>
          <div className="campo">
            <label htmlFor="reporta_nombre">Nombre de quien reporta</label>
            <input id="reporta_nombre" name="reporta_nombre" className="input" placeholder="Familiar o persona que reporta" />
          </div>
          <label className="fila" style={{ gap: 8, alignItems: 'flex-start', marginTop: 4, cursor: 'pointer' }}>
            <input type="checkbox" name="es_nna" style={{ marginTop: 3 }} />
            <span>
              La persona es <strong>menor de edad (NNA)</strong>
              <span className="muted" style={{ display: 'block', fontSize: '.8rem' }}>
                Irá al equipo especializado de menores y no será visible para el buscador general.
              </span>
            </span>
          </label>
        </div>
      )}
    </>
  );
}
