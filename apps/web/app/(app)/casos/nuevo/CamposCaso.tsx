'use client';
import AvisoEnlace from '@/components/AvisoEnlace';
import BloqueAlcance from '@/components/BloqueAlcance';
import BloqueContacto from '@/components/BloqueContacto';
import BloqueUbicacion from '@/components/BloqueUbicacion';
import BloqueRequerimiento from '../BloqueRequerimiento';
import { OPCIONES_VIGENCIA, TIPOS_FUENTE } from '@/lib/constantes';

// Ya no se clasifica el tipo de caso ni se hace búsqueda de personas: toda información
// que llega se trata como una «solicitud con ubicación» (categoría fija 'Otras
// informaciones' + requerimiento con lugar en el mapa). El formulario captura los datos
// en BLOQUES ordenados (requerimiento Pasos 4 y 5): Contacto → Ubicación → Necesidad →
// Vigencia → Fuente. Al verificarse, cada bloque se marca con su semáforo 🟢🟡🔴 y el
// caso NO puede confirmarse hasta que todos estén en verde (candado 0173). Los
// ofrecimientos NO van aquí: se registran en «Donación-Ofrecimiento».
export default function CamposCaso() {
  return (
    <>
      {/* Sin clasificación: toda información entra como solicitud del lado de Verificación. */}
      <input type="hidden" name="categoria" value="Otras informaciones" />

      {/* Filtro institucional de alcance (Paso 2) */}
      <BloqueAlcance />

      {/* Contacto y referente (datos prioritarios, Paso 3) */}
      <BloqueContacto exigir />

      {/* Ubicación administrativa (Paso 4.2) */}
      <BloqueUbicacion />

      {/* Necesidad + ubicación en el mapa */}
      <BloqueRequerimiento fijo />

      {/* Vigencia (Paso 4.4) */}
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="fecha_publicacion">¿Cuándo se publicó o confirmó?</label>
          <input id="fecha_publicacion" name="fecha_publicacion" className="input" type="date" />
        </div>
        <div className="campo">
          <label htmlFor="sigue_vigente">¿Sigue vigente?</label>
          <select id="sigue_vigente" name="sigue_vigente" className="input" defaultValue="">
            <option value="">Sin especificar</option>
            {OPCIONES_VIGENCIA.map((v) => <option key={v.valor} value={v.valor}>{v.etiqueta}</option>)}
          </select>
        </div>
      </div>

      {/* Fuente (Paso 4.5) */}
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="fuente_tipo">Tipo de fuente</label>
          <select id="fuente_tipo" name="fuente_tipo" className="input" defaultValue="">
            <option value="">Sin especificar</option>
            {TIPOS_FUENTE.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fuente">¿Quién es la fuente?</label>
          <input id="fuente" name="fuente" className="input" placeholder="Red oficial, persona, grupo o contacto directo" />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="fuente_url">Enlace de la fuente (opcional)</label>
        <AvisoEnlace name="fuente_url" />
      </div>

      <p className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>
        <strong>Vigencia:</strong> la información debe haberse publicado o confirmado en las últimas <strong>48 horas</strong>. Antes de enviar, revisa que esté completa, con los contactos correctos, la ubicación clara y el enlace de la fuente.
      </p>
    </>
  );
}
