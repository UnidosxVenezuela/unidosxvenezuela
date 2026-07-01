import Link from 'next/link';
import { requireUsuario, puedePsicosocial, esCoordPsicosocial } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_APOYO, ETIQUETA_ESTADO_ACOMP, ESTADOS_ACOMP, claseEstadoAcomp, clasePrioridad, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';

export default async function PsicosocialPage({ searchParams }: { searchParams: { vista?: string } }) {
  const { user, perfil } = await requireUsuario();
  if (!puedePsicosocial(perfil)) redirect('/dashboard');
  const coord = esCoordPsicosocial(perfil);
  const soloMias = searchParams.vista === 'mia';

  const supabase = await createClient();
  let q = supabase.from('acompanamientos')
    .select('id, numero, persona, tipo, riesgo, estado, asignado_a, creado_en, perfiles!acompanamientos_asignado_a_fkey(nombre_completo)')
    .order('creado_en', { ascending: false });
  if (soloMias) q = q.eq('asignado_a', user!.id);
  const { data } = await q;
  const casos = (data ?? []) as any[];
  const porEstado = (e: string) => casos.filter((c) => c.estado === e);

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="acompanamientos" />
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="corazon" size={24} /> Apoyo Psicosocial</h1>
          <p className="muted sub">Acompañamiento en salud mental. Espacio confidencial: cada caso solo lo ven el profesional asignado y la coordinación psicosocial.</p>
        </div>
        <div className="fila">
          <BotonActualizar />
          <Link className="btn" href="/psicosocial/recursos"><Icono nombre="ayuda" size={16} /> Recursos y crisis</Link>
          <Link className="btn btn-primario" href="/psicosocial/nueva"><Icono nombre="mas" /> Nueva solicitud</Link>
        </div>
      </div>

      <div className="fila" style={{ marginBottom: 16, gap: 8 }}>
        <Link href="/psicosocial" className={'btn' + (!soloMias ? ' btn-primario' : '')}>Todos</Link>
        <Link href="/psicosocial?vista=mia" className={'btn' + (soloMias ? ' btn-primario' : '')}><Icono nombre="usuario" size={15} /> Mi carga</Link>
      </div>

      {casos.length === 0 ? (
        <EstadoVacio
          icono="corazon"
          titulo={soloMias ? 'No tienes casos asignados' : 'Aún no hay solicitudes'}
          texto={soloMias ? 'Cuando te asignen un acompañamiento, aparecerá aquí.' : 'Registra la primera solicitud para empezar a acompañar.'}
          accion={soloMias ? undefined : { href: '/psicosocial/nueva', etiqueta: 'Nueva solicitud' }}
        />
      ) : (
        <div className="tablero-insumos">
          {ESTADOS_ACOMP.map((e) => (
            <div key={e} className="tablero-col">
              <h3 className="fila" style={{ gap: 6, justifyContent: 'space-between' }}>
                <span>{ETIQUETA_ESTADO_ACOMP[e] ?? e}</span>
                <span className="insignia">{porEstado(e).length}</span>
              </h3>
              {porEstado(e).length === 0 && <p className="muted" style={{ fontSize: '.85rem', margin: '0 4px' }}>—</p>}
              {porEstado(e).map((c) => (
                <Link key={c.id} href={'/psicosocial/' + c.id} className="tarjeta insumo-card">
                  <div className="fila" style={{ justifyContent: 'space-between', gap: 6 }}>
                    <span className="insignia">PS-{c.numero}</span>
                    <Pill tono={tonoDeClase(clasePrioridad(c.riesgo))} punto={false}>
                      Riesgo {ETIQUETA_PRIORIDAD[c.riesgo as keyof typeof ETIQUETA_PRIORIDAD] ?? c.riesgo}
                    </Pill>
                  </div>
                  <strong style={{ display: 'block', margin: '6px 0 2px' }}>{c.persona}</strong>
                  <div className="muted" style={{ fontSize: '.82rem' }}>{ETIQUETA_TIPO_APOYO[c.tipo as keyof typeof ETIQUETA_TIPO_APOYO] ?? c.tipo}</div>
                  {c.perfiles?.nombre_completo && (
                    <div className="muted fila" style={{ gap: 4, fontSize: '.8rem', marginTop: 4 }}>
                      <Icono nombre="usuario" size={13} /> {c.perfiles.nombre_completo}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}

      {coord && (
        <p className="muted" style={{ fontSize: '.8rem', marginTop: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icono nombre="admin" size={14} /> Coordinación psicosocial: ves todos los casos del área.
        </p>
      )}
    </AnimarEntrada>
  );
}
