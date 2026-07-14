import { fechaCorta } from '@/lib/fechas';
import { hrefSeguro, ETIQUETA_TIPO_INSUMO, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';

/** Toda la información de la solicitud (caso): descripción, datos de la solicitud de
 *  ayuda, observaciones de verificación, contacto y —lo que faltaba— las imágenes y
 *  adjuntos. La usan Redacción (para difundir) y Logística (para gestionar la entrega),
 *  así ambos equipos trabajan con el material completo. Espera `caso.adjuntos` como
 *  arreglo de { id, nombre, mime, href } (URL firmada) ya resuelto por el server. */
export default function InfoSolicitudCaso({ caso }: { caso: any }) {
  const adj = (caso.adjuntos ?? []) as any[];
  const imgs = adj.filter((a) => a.href && String(a.mime ?? '').startsWith('image/'));
  const docs = adj.filter((a) => a.href && !String(a.mime ?? '').startsWith('image/'));
  const waFuente = hrefSeguro(caso.fuente_url);
  return (
    <div style={{ marginTop: 10 }}>
      {caso.descripcion
        ? <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{caso.descripcion}</p>
        : <p className="muted" style={{ margin: '0 0 8px' }}>Sin descripción.</p>}

      <div className="grid grid-2" style={{ gap: 6, fontSize: '.88rem' }}>
        {caso.contacto && <div style={{ gridColumn: '1 / -1' }}><strong>Contacto / referente:</strong> {caso.contacto}</div>}
        {caso.fecha_publicacion && <div><strong>Publicación:</strong> {fechaCorta(caso.fecha_publicacion + 'T00:00:00')}</div>}
        {(caso.fuente || caso.fuente_url) && (
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>Fuente:</strong>{' '}
            {waFuente ? <a href={waFuente} target="_blank" rel="noopener noreferrer">{caso.fuente || 'Ver fuente'} ↗</a> : (caso.fuente || '—')}
          </div>
        )}
      </div>

      {caso.es_requerimiento && (
        <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, padding: '8px 10px', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8 }}>
          <Icono nombre="ubicacion" size={16} />
          <strong style={{ fontSize: '.9rem' }}>Solicitud de ayuda</strong>
          {caso.req_tipo && <Pill tono="info" punto={false}>{ETIQUETA_TIPO_INSUMO[caso.req_tipo] ?? caso.req_tipo}</Pill>}
          {caso.req_urgencia && <Pill tono="aviso" punto={false}>{ETIQUETA_PRIORIDAD[caso.req_urgencia as keyof typeof ETIQUETA_PRIORIDAD] ?? caso.req_urgencia}</Pill>}
          {caso.req_cantidad && <span className="muted" style={{ fontSize: '.85rem' }}>· {caso.req_cantidad}</span>}
          {caso.lat != null && caso.lng != null && <span className="muted" style={{ fontSize: '.82rem' }}>· Ubicación marcada en el mapa</span>}
        </div>
      )}

      {caso.notas && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--fondo-2, #f8fafc)', border: '1px solid var(--borde)', borderRadius: 8 }}>
          <div className="fila" style={{ gap: 6 }}><Icono nombre="documento" size={15} /> <strong style={{ fontSize: '.88rem' }}>Observaciones de verificación</strong></div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: '.88rem' }}>{caso.notas}</p>
        </div>
      )}

      {imgs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: '.82rem', marginBottom: 6 }}>Imágenes ({imgs.length}) — toca para abrir en tamaño completo</div>
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
            {imgs.map((a) => (
              <a key={a.id} href={a.href} target="_blank" rel="noopener noreferrer" title={a.nombre} style={{ display: 'block' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.href} alt={a.nombre} loading="lazy" style={{ width: 104, height: 104, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--borde)' }} />
              </a>
            ))}
          </div>
        </div>
      )}

      {docs.length > 0 && (
        <div className="fila" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {docs.map((a) => (
            <a key={a.id} className="adjunto-chip" href={a.href} target="_blank" rel="noopener noreferrer">
              <Icono nombre="documento" size={15} /> {a.nombre}
            </a>
          ))}
        </div>
      )}

      {adj.length === 0 && (
        <p className="muted" style={{ fontSize: '.82rem', margin: '8px 0 0' }}>Esta solicitud no tiene imágenes ni adjuntos.</p>
      )}
    </div>
  );
}
