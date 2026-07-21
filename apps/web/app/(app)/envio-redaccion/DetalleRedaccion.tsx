import Link from 'next/link';
import { fechaHora } from '@/lib/fechas';
import { pasoRedaccion } from '@/lib/flujo';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import EstadoCaso from '@/components/EstadoCaso';
import BadgeCategoria from '@/components/BadgeCategoria';
import FlujoProgreso from '@/components/FlujoProgreso';
import BotonConfirmar from '@/components/BotonConfirmar';
import InfoSolicitud from '@/components/InfoSolicitudCaso';
import { enviarCasoRedaccion, tomarCasoRedaccion, soltarCasoRedaccion } from '../casos/actions';
import AccionesRedaccionCaso from './AccionesRedaccionCaso';
import FormEditarCaso from '../casos/FormEditarCaso';

/** Panel lateral (drawer) de una solicitud en «Envío a Redacción»: información
 *  completa + todas las herramientas (tomar/soltar, enviar, copiar/descargar,
 *  marcar publicada con canales, editar). `volver` mantiene el panel abierto. */
export default function DetalleRedaccion(
  { caso, puedeOperar, esAdmin, redactorNombre, miId, volver, whatsappGrupo = null, publicaciones = [] }:
  { caso: any; puedeOperar: boolean; esAdmin: boolean; redactorNombre?: string | null; miId: string; volver: string; whatsappGrupo?: string | null; publicaciones?: any[] },
) {
  const p = pasoRedaccion(caso);
  const esMiRedaccion = caso.redactor_id && caso.redactor_id === miId;
  const puedeSoltar = puedeOperar && (esMiRedaccion || esAdmin);

  return (
    <div>
      <div className="muted" style={{ fontSize: '.8rem' }}>#{String(caso.numero).padStart(5, '0')} · Actualizada {fechaHora(caso.actualizado_en)}</div>
      <h2 style={{ margin: '4px 0 8px' }}>{caso.titulo}</h2>
      <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <EstadoCaso estado={caso.estado} />
        {caso.categoria && <BadgeCategoria>{caso.categoria}</BadgeCategoria>}
        {caso.publicado_en && <Pill tono="ok" punto={false}>📣 Publicada</Pill>}
        {!caso.publicado_en && caso.requiere_difusion && <Pill tono="alta" punto={false}>⚠ Prioriza · Logística no pudo cubrir</Pill>}
      </div>
      <FlujoProgreso paso={p.paso} total={p.total} completo={p.completo} etiqueta={p.etiqueta} />

      {/* Redactor asignado (0169): tomar / soltar la difusión */}
      <div className="tarjeta" style={{ marginTop: 12, padding: 12 }}>
        <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="fila" style={{ gap: 6 }}>
            <Icono nombre="usuario" size={15} />
            {caso.redactor_id
              ? <span>Redacta <strong>{redactorNombre ?? '—'}</strong>{esMiRedaccion ? ' (tú)' : ''}</span>
              : <span className="muted">Sin redactor asignado</span>}
          </span>
          {puedeOperar && (
            caso.redactor_id
              ? (puedeSoltar && (
                  <form action={soltarCasoRedaccion}>
                    <input type="hidden" name="caso_id" value={caso.id} />
                    <input type="hidden" name="volver" value={volver} />
                    <button className="btn btn-sm">Soltar</button>
                  </form>
                ))
              : (
                <form action={tomarCasoRedaccion}>
                  <input type="hidden" name="caso_id" value={caso.id} />
                  <input type="hidden" name="volver" value={volver} />
                  <button className="btn btn-sm btn-primario"><Icono nombre="usuario" size={14} /> Tomar para redactar</button>
                </form>
              )
          )}
        </div>
      </div>

      {/* Información completa para difundir */}
      <InfoSolicitud caso={caso} />

      {/* Enviar a Redacción (mueve al estado del pipeline) — solo confirmadas */}
      {puedeOperar && caso.estado === 'confirmado' && (
        <form action={enviarCasoRedaccion} style={{ marginTop: 10 }}>
          <input type="hidden" name="caso_id" value={caso.id} />
          <input type="hidden" name="volver" value={volver} />
          <BotonConfirmar mensaje={'¿Marcar «' + caso.titulo + '» como enviada a Redacción?'} className="btn btn-primario" confirmar="Sí, enviar">
            <Icono nombre="cohete" size={16} /> Enviar a Redacción
          </BotonConfirmar>
        </form>
      )}

      {/* Copiar / descargar / WhatsApp + tipo de difusión + publicación por canal */}
      <AccionesRedaccionCaso caso={caso} puedeMarcar={puedeOperar} esAdmin={esAdmin} volver={volver} whatsappGrupo={whatsappGrupo} publicaciones={publicaciones} />

      {/* Editar los datos de la solicitud (la RLS decide quién puede guardar) */}
      <div style={{ marginTop: 12 }}>
        <FormEditarCaso caso={caso} volver={volver} />
      </div>

      <div style={{ marginTop: 12 }}>
        <Link href={'/casos?caso=' + caso.id} className="muted" style={{ fontSize: '.85rem' }}>Ver historial completo en Solicitudes ↗</Link>
      </div>
    </div>
  );
}
