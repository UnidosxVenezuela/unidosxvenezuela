import { fechaHora, fechaCorta } from '@/lib/fechas';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import { hrefSeguro, ETIQUETA_TIPO_INSUMO, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BadgeCategoria from '@/components/BadgeCategoria';
import BotonActualizar from '@/components/BotonActualizar';
import BotonConfirmar from '@/components/BotonConfirmar';
import EstadoVacio from '@/components/EstadoVacio';
import Pill from '@/components/Pill';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import { enviarCasoRedaccion } from '../casos/actions';
import AccionesRedaccionCaso from './AccionesRedaccionCaso';
import FormEditarCaso from '../casos/FormEditarCaso';

/** Toda la información de la solicitud para Redacción: descripción, datos de la
 *  solicitud de ayuda, observaciones de verificación, contacto y —lo que faltaba—
 *  las imágenes y adjuntos. Así Redacción difunde con el material completo. */
function InfoSolicitud({ caso }: { caso: any }) {
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

/** El grupo Redacción toma los casos CONFIRMADOS y los pasa al estado
 *  final del flujo de verificación: «Enviado a Redacción». */
export default async function EnvioRedaccionPage() {
  const { perfil } = await requireUsuario();
  // El Admin de Redes supervisa (solo lectura; la RLS bloquea la escritura).
  const puede = esAdministrador(perfil) || esAdminRedes(perfil) || rolesDe(perfil).includes('redaccion');
  if (!puede) redirect('/dashboard');
  const supabase = await createClient();

  // Por RAPIDEZ ante la emergencia, TODA solicitud confirmada se difunde en paralelo
  // (a la vez que Logística la trabaja): Redacción recibe todas las confirmadas. Las
  // que Logística marcó «no se pudo cubrir» (requiere_difusion, 0149) se resaltan como
  // prioridad de difusión, pero no son las únicas. Se traen TODOS los datos que necesita
  // Redacción para difundir con la información completa (descripción, observaciones,
  // contacto y datos de la solicitud de ayuda). Los adjuntos/imágenes se cargan aparte.
  const COLS = 'id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, contacto, notas, actualizado_en, requiere_difusion, es_requerimiento, req_tipo, req_cantidad, req_urgencia, lat, lng';
  const [{ data: confirmados }, { data: enviados }] = await Promise.all([
    supabase.from('casos').select(COLS)
      .eq('estado', 'confirmado').order('actualizado_en', { ascending: true }),
    supabase.from('casos').select(COLS)
      .eq('estado', 'enviado_redaccion').order('actualizado_en', { ascending: false }),
  ]);

  // Adjuntos (imágenes y archivos) de TODAS las solicitudes listadas, con URL firmada
  // del bucket privado. Con la migración 0151, Redacción ya puede leer estas filas.
  const listado = [...((confirmados as any[]) ?? []), ...((enviados as any[]) ?? [])];
  const ids = listado.map((c) => c.id);
  if (ids.length) {
    const { data: adjRaw } = await supabase
      .from('casos_adjuntos').select('id, caso_id, url, nombre, mime').in('caso_id', ids).order('creado_en');
    const porCaso = new Map<string, any[]>();
    for (const a of ((adjRaw as any[]) ?? [])) {
      const arr = porCaso.get(a.caso_id) ?? [];
      arr.push(a);
      porCaso.set(a.caso_id, arr);
    }
    // Firma cada grupo en orden (URL válida 1 h para ver/descargar la imagen).
    for (const [cid, arr] of porCaso) {
      const firmados = await Promise.all(arr.map(async (a) => ({ ...a, href: await urlFirmada(supabase, 'adjuntos', a.url, 3600) })));
      porCaso.set(cid, firmados);
    }
    for (const c of listado) c.adjuntos = porCaso.get(c.id) ?? [];
  }

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="casos" />
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="cohete" size={24} /> Envío a Redacción</h1>
          <p className="muted sub">Todas las solicitudes <strong>confirmadas</strong> se difunden en redes, <strong>en paralelo</strong> a la gestión de Logística (por rapidez ante la emergencia). Las de <strong>prioridad</strong> son las que Logística no pudo cubrir.</p>
        </div>
        <BotonActualizar />
      </div>

      <h2>Por difundir <span className="insignia aviso">{(confirmados ?? []).length}</span></h2>
      {(confirmados ?? []).length === 0 ? (
        <EstadoVacio icono="ok" titulo="Nada pendiente por difundir" texto="Cuando Verificación confirme una solicitud, aparecerá aquí para difundirla en redes." />
      ) : (
        (confirmados as any[]).map((c) => (
          <div key={c.id} className="tarjeta">
            <div className="fila" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div>
                <div className="muted" style={{ fontSize: '.8rem' }}>#{String(c.numero).padStart(5, '0')} · {fechaHora(c.actualizado_en)}</div>
                <strong>{c.titulo}</strong>
                <div className="fila" style={{ marginTop: 4, gap: 6, flexWrap: 'wrap' }}>
                  {c.categoria && <BadgeCategoria>{c.categoria}</BadgeCategoria>}
                  {c.requiere_difusion && <Pill tono="alta" punto={false}>⚠ Prioriza · Logística no pudo cubrir</Pill>}
                </div>
              </div>
              <form action={enviarCasoRedaccion}>
                <input type="hidden" name="caso_id" value={c.id} />
                <BotonConfirmar mensaje={'¿Enviar «' + c.titulo + '» a Redacción?'} className="btn btn-primario">
                  <Icono nombre="cohete" size={16} /> Enviar a Redacción
                </BotonConfirmar>
              </form>
            </div>
            <InfoSolicitud caso={c} />
            <AccionesRedaccionCaso caso={c} />
            <FormEditarCaso caso={c} volver="/envio-redaccion" />
          </div>
        ))
      )}

      <h2 style={{ marginTop: 20 }}>Enviados a Redacción <span className="insignia">{(enviados ?? []).length}</span></h2>
      {(enviados ?? []).length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Todavía no se ha enviado ninguno.</p></div>
      ) : (
        (enviados as any[]).map((c) => (
          <div key={c.id} className="tarjeta">
            <div className="fila" style={{ justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div className="muted" style={{ fontSize: '.8rem' }}>#{String(c.numero).padStart(5, '0')} · {fechaHora(c.actualizado_en)}</div>
                <strong>{c.titulo}</strong>
              </div>
              <Pill tono="ok">Enviado a Redacción</Pill>
            </div>
            <InfoSolicitud caso={c} />
            <AccionesRedaccionCaso caso={c} />
            <FormEditarCaso caso={c} volver="/envio-redaccion" />
          </div>
        ))
      )}
    </AnimarEntrada>
  );
}
