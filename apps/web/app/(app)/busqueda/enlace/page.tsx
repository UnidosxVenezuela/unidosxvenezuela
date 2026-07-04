import Link from 'next/link';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_SEXO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import Consejo from '@/components/Consejos';
import { guardEnlace, PanelVerificacion } from '../_guard';
import { registrarContactoBusqueda } from '../actions';

export default async function EnlacePage() {
  const g = await guardEnlace();
  if (!g.identidadOk) {
    return (
      <AnimarEntrada>
        <div className="pagina-cab"><div><h1 className="fila" style={{ gap: 8 }}><Icono nombre="whatsapp" size={24} /> Enlace de contacto</h1></div></div>
        <PanelVerificacion />
      </AnimarEntrada>
    );
  }
  const { supabase } = g;
  const { data } = await supabase.rpc('listar_cola_enlace');
  const cola = (data ?? []) as any[];
  const pendientes = cola.filter((c) => c.estado_busqueda === 'coincidencia_aprobada');
  const cerrados = cola.filter((c) => c.estado_busqueda !== 'coincidencia_aprobada');

  return (
    <AnimarEntrada>
      <Consejo id="busqueda-enlace" titulo="Enlace de contacto">
        Aquí llegan los casos <strong>aprobados por el mando</strong>. Realiza la <strong>llamada de confirmación</strong> con la familia y regístrala; el caso pasa a <strong>reunificado</strong>. Los casos de <strong>menores (NNA)</strong> no llegan aquí: los gestiona el mando con la autoridad.
      </Consejo>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="whatsapp" size={24} /> Enlace de contacto</h1>
          <p className="muted sub">Llamadas de confirmación de casos aprobados.</p>
        </div>
        <div className="fila"><BotonActualizar /></div>
      </div>

      <h2 className="fila" style={{ gap: 6 }}>Por llamar <span className="insignia aviso">{pendientes.length}</span></h2>
      {pendientes.length === 0 ? (
        <EstadoVacio icono="ok" titulo="Nada pendiente" texto="Cuando el mando apruebe una coincidencia, aparecerá aquí para que hagas la llamada." />
      ) : (
        pendientes.map((c) => (
          <div key={c.caso_id} className="tarjeta">
            <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <strong className="fila" style={{ gap: 8 }}><span className="insignia">{c.codigo}</span> {c.titulo}</strong>
                <div className="muted" style={{ fontSize: '.85rem', marginTop: 4 }}>
                  {c.edad != null ? `${c.edad} años` : 'Edad n/d'}{c.sexo ? ` · ${ETIQUETA_SEXO[c.sexo] ?? c.sexo}` : ''}{c.ultima_ubicacion ? ` · ${c.ultima_ubicacion}` : ''}
                </div>
                {c.aprobado_en && <div className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>Aprobado {fechaHora(c.aprobado_en)}</div>}
              </div>
            </div>
            <form action={registrarContactoBusqueda} style={{ marginTop: 10 }}>
              <input type="hidden" name="caso_id" value={c.caso_id} />
              <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input name="resultado" className="input crece" placeholder="Resultado de la llamada (con quién hablaste, acuerdos…)" maxLength={300} />
                <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Registrar llamada y reunificar</BotonEnviar>
              </div>
            </form>
          </div>
        ))
      )}

      {cerrados.length > 0 && (
        <>
          <h2 className="fila" style={{ gap: 6, marginTop: 20 }}>Reunificados por mí <span className="insignia ok">{cerrados.length}</span></h2>
          {cerrados.map((c) => (
            <div key={c.caso_id} className="tarjeta fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong className="fila" style={{ gap: 8 }}><span className="insignia">{c.codigo}</span> {c.titulo}</strong>
              <Pill tono="ok" punto={false}>Reunificado</Pill>
            </div>
          ))}
        </>
      )}

      <p className="muted" style={{ fontSize: '.8rem', marginTop: 16 }}>
        <Link href="/busqueda/recursos">Ver guiones de la llamada de confirmación →</Link>
      </p>
    </AnimarEntrada>
  );
}
