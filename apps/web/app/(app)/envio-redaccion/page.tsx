import { fechaHora } from '@/lib/fechas';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
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
  // prioridad de difusión, pero no son las únicas.
  const COLS = 'id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, actualizado_en, requiere_difusion';
  const [{ data: confirmados }, { data: enviados }] = await Promise.all([
    supabase.from('casos').select(COLS)
      .eq('estado', 'confirmado').order('actualizado_en', { ascending: true }),
    supabase.from('casos').select(COLS)
      .eq('estado', 'enviado_redaccion').order('actualizado_en', { ascending: false }),
  ]);

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
            <AccionesRedaccionCaso caso={c} />
            <FormEditarCaso caso={c} volver="/envio-redaccion" />
          </div>
        ))
      )}
    </AnimarEntrada>
  );
}
