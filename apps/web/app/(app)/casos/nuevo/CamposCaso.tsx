'use client';
import AvisoEnlace from '@/components/AvisoEnlace';
import BloqueContacto from '@/components/BloqueContacto';
import BloqueRequerimiento from '../BloqueRequerimiento';

// Ya no se clasifica el tipo de caso ni se hace búsqueda de personas: toda información
// que llega se trata como una «solicitud con ubicación» (categoría fija 'Otras
// informaciones' + requerimiento con lugar en el mapa). El formulario se enfoca en las
// preguntas del circuito de ayuda: qué es (título + descripción, arriba), cuándo, quién
// es la fuente, quién es el responsable, dónde ocurre y qué se necesita. Los
// ofrecimientos NO van aquí: se registran en «Donación-Ofrecimiento».
export default function CamposCaso() {
  return (
    <>
      {/* Sin clasificación: toda información entra como solicitud del lado de Verificación. */}
      <input type="hidden" name="categoria" value="Otras informaciones" />
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="fecha_publicacion">¿Cuándo se publicó o confirmó?</label>
          <input id="fecha_publicacion" name="fecha_publicacion" className="input" type="date" />
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
      <BloqueContacto exigir />
      <BloqueRequerimiento fijo />
      <p className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>
        <strong>Vigencia:</strong> la información debe haberse publicado o confirmado en las últimas <strong>48 horas</strong>. Antes de enviar, revisa que esté completa, con los contactos correctos, la ubicación clara y el enlace de la fuente.
      </p>
    </>
  );
}
