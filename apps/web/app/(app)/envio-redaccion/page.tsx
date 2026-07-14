import { fechaHora } from '@/lib/fechas';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
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
import InfoSolicitud from '@/components/InfoSolicitudCaso';

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
