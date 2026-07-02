import { fechaHora } from '@/lib/fechas';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, rolesDe } from '@/lib/auth';
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

/** El grupo "Envío a Redacción" toma los casos CONFIRMADOS y los pasa al estado
 *  final del flujo de verificación: «Enviado a Redacción». */
export default async function EnvioRedaccionPage() {
  const { perfil } = await requireUsuario();
  const puede = esAdministrador(perfil) || rolesDe(perfil).includes('envio_redaccion');
  if (!puede) redirect('/dashboard');
  const supabase = await createClient();

  const [{ data: confirmados }, { data: enviados }] = await Promise.all([
    supabase.from('casos').select('id, numero, titulo, categoria, actualizado_en')
      .eq('estado', 'confirmado').order('actualizado_en', { ascending: true }),
    supabase.from('casos').select('id, numero, titulo, categoria, actualizado_en')
      .eq('estado', 'enviado_redaccion').order('actualizado_en', { ascending: false }).limit(30),
  ]);

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="casos" />
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="cohete" size={24} /> Envío a Redacción</h1>
          <p className="muted sub">Casos verificados y confirmados, listos para pasarlos a Redacción. Al enviarlos, el flujo de verificación termina.</p>
        </div>
        <BotonActualizar />
      </div>

      <h2>Confirmados por enviar <span className="insignia aviso">{(confirmados ?? []).length}</span></h2>
      {(confirmados ?? []).length === 0 ? (
        <EstadoVacio icono="ok" titulo="Nada pendiente por enviar" texto="Cuando Verificación confirme un caso, aparecerá aquí para enviarlo a Redacción." />
      ) : (
        (confirmados as any[]).map((c) => (
          <div key={c.id} className="tarjeta fila" style={{ justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: '.8rem' }}>#{String(c.numero).padStart(5, '0')} · {fechaHora(c.actualizado_en)}</div>
              <strong>{c.titulo}</strong>
              <div style={{ marginTop: 4 }}>{c.categoria && <BadgeCategoria>{c.categoria}</BadgeCategoria>}</div>
            </div>
            <form action={enviarCasoRedaccion}>
              <input type="hidden" name="caso_id" value={c.id} />
              <BotonConfirmar mensaje={'¿Enviar «' + c.titulo + '» a Redacción?'} className="btn btn-primario">
                <Icono nombre="cohete" size={16} /> Enviar a Redacción
              </BotonConfirmar>
            </form>
          </div>
        ))
      )}

      <h2 style={{ marginTop: 20 }}>Enviados recientemente</h2>
      {(enviados ?? []).length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Todavía no se ha enviado ninguno.</p></div>
      ) : (
        (enviados as any[]).map((c) => (
          <div key={c.id} className="tarjeta fila" style={{ justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: '.8rem' }}>#{String(c.numero).padStart(5, '0')} · {fechaHora(c.actualizado_en)}</div>
              <strong>{c.titulo}</strong>
            </div>
            <Pill tono="ok">Enviado a Redacción</Pill>
          </div>
        ))
      )}
    </AnimarEntrada>
  );
}
