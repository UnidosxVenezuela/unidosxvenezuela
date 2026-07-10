import Icono from '@/components/Icono';
import AvisoEnlace from '@/components/AvisoEnlace';
import BloqueRequerimiento from './BloqueRequerimiento';
import { editarCaso } from './actions';

/** Formulario colapsable para corregir/completar los datos de un caso. Reutilizado
 *  por el detalle (Validación/recopilación) y por Envío a Redacción. La edición
 *  queda registrada en el historial del caso y en el Registro de actividad. */
export default function FormEditarCaso({ caso, volver }: { caso: any; volver: string }) {
  return (
    <details className="tarjeta">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}><Icono nombre="pizarra" size={16} /> Editar datos de la solicitud</summary>
      <form action={editarCaso} style={{ marginTop: 10 }}>
        <input type="hidden" name="caso_id" value={caso.id} />
        <input type="hidden" name="volver" value={volver} />
        <div className="campo"><label>Título</label><input name="titulo" className="input" required defaultValue={caso.titulo ?? ''} /></div>
        <div className="campo"><label>Descripción</label><textarea name="descripcion" className="input" rows={3} defaultValue={caso.descripcion ?? ''} /></div>
        {/* Sin clasificación de tipo: se conserva la categoría existente del caso. */}
        <input type="hidden" name="categoria" value={caso.categoria ?? 'Otras informaciones'} />
        <div className="grid grid-2">
          <div className="campo"><label>Fecha de publicación</label><input name="fecha_publicacion" type="date" className="input" defaultValue={caso.fecha_publicacion ?? ''} /></div>
          <div className="campo"><label>Fuente</label><input name="fuente" className="input" defaultValue={caso.fuente ?? ''} /></div>
          <div className="campo"><label>Enlace de la fuente</label><AvisoEnlace name="fuente_url" defaultValue={caso.fuente_url ?? ''} /></div>
          <div className="campo"><label>Responsable / referente</label><input name="contacto" className="input" defaultValue={caso.contacto ?? ''} placeholder="Teléfono, WhatsApp, organización" /></div>
        </div>
        {/* Solicitud de ayuda con ubicación (no aplica a Desaparecidos). */}
        {caso.categoria !== 'Desaparecidos' && (
          <BloqueRequerimiento defaults={{
            es_requerimiento: caso.es_requerimiento, lat: caso.lat, lng: caso.lng,
            req_tipo: caso.req_tipo, req_cantidad: caso.req_cantidad, req_urgencia: caso.req_urgencia,
          }} />
        )}
        <button className="btn btn-primario" type="submit">Guardar cambios</button>
        <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>Corrige o completa la información. La edición queda registrada en el historial.</p>
      </form>
    </details>
  );
}
