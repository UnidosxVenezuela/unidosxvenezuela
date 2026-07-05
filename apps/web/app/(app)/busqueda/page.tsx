import Link from 'next/link';
import { nombreMostrado } from '@/lib/nombre';
import { ETIQUETA_ESTADO_BUSQUEDA, ESTADOS_BUSQUEDA, claseEstadoBusqueda } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Consejo from '@/components/Consejos';
import { guardBusqueda, PanelVerificacion } from './_guard';

const SELECT =
  'id, caso_id, codigo, estado_busqueda, es_nna, edad, sexo, ultima_ubicacion, proxima_revision, creado_en, ' +
  'caso:casos!busqueda_casos_caso_id_fkey(titulo, asignado_a, estado, asignado:perfiles!casos_asignado_a_fkey(nombre_completo))';

export default async function BusquedaPage({ searchParams }: { searchParams: { vista?: string } }) {
  const g = await guardBusqueda();
  if (!g.identidadOk) return <PanelVerificacion />;
  const { supabase, user, esAdmin } = g;
  // Vista del equipo de menores (Buscador NNA puro): su tablero es solo de NNA.
  const vistaNna = g.esBuscadorNna && !g.esBuscadorGeneral && !esAdmin;

  const { data } = await supabase.from('busqueda_casos').select(SELECT).order('creado_en', { ascending: false });
  let fichas = (data ?? []) as any[];
  const soloMias = searchParams.vista === 'mia';
  const vencidas = searchParams.vista === 'revisar';
  const ahora = Date.now();
  const esVencida = (f: any) => ['activo', 'en_revision'].includes(f.estado_busqueda) && f.proxima_revision && new Date(f.proxima_revision).getTime() <= ahora;

  const totalMias = fichas.filter((f) => f.caso?.asignado_a === user.id).length;
  const totalVencidas = fichas.filter(esVencida).length;
  if (soloMias) fichas = fichas.filter((f) => f.caso?.asignado_a === user.id);
  if (vencidas) fichas = fichas.filter(esVencida);

  const porEstado = (e: string) => fichas.filter((f) => f.estado_busqueda === e);
  const nnaTotal = fichas.filter((f) => f.es_nna).length;

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="busqueda_casos" />
      <Consejo id="busqueda" titulo="Grupo de Búsqueda · Personas desaparecidas">
        Cada tarjeta es una persona reportada como <strong>desaparecida</strong>. Trabaja el caso, verifícalo contra las <strong>fuentes</strong> y, si hay coincidencia, márcala como <strong>pendiente</strong> para que el <strong>mando</strong> la apruebe. Con <strong>menores (NNA)</strong> la confirmación nunca se da directo: se deriva a la autoridad.
      </Consejo>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="usuario" size={24} /> {vistaNna ? 'Desaparecidos · Menores (NNA)' : 'Desaparecidos'}</h1>
          <p className="muted sub">
            {vistaNna
              ? 'Casos de menores desaparecidos que atiende el equipo de Buscador NNA.'
              : <>Casos de personas desaparecidas que gestiona el Grupo de Búsqueda. {nnaTotal > 0 && <><strong>{nnaTotal}</strong> {nnaTotal === 1 ? 'menor (NNA)' : 'menores (NNA)'}.</>}</>}
          </p>
        </div>
        <div className="fila">
          <BotonActualizar />
          <Link className="btn" href="/busqueda/recursos"><Icono nombre="ayuda" size={16} /> Recursos</Link>
          <Link className="btn btn-primario" href="/busqueda/nuevo"><Icono nombre="mas" /> Nuevo caso</Link>
        </div>
      </div>

      <div className="fila" style={{ marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <Link href="/busqueda" className={'btn' + (!soloMias && !vencidas ? ' btn-primario' : '')}>Todos</Link>
        <Link href="/busqueda?vista=mia" className={'btn' + (soloMias ? ' btn-primario' : '')}><Icono nombre="usuario" size={15} /> Mi carga{totalMias > 0 && <span className="insignia" style={{ marginLeft: 6 }}>{totalMias}</span>}</Link>
        <Link href="/busqueda?vista=revisar" className={'btn' + (vencidas ? ' btn-primario' : '')}><Icono nombre="reloj" size={15} /> Por revisar{totalVencidas > 0 && <span className="insignia" style={{ marginLeft: 6 }}>{totalVencidas}</span>}</Link>
      </div>

      {fichas.length === 0 ? (
        <EstadoVacio
          icono="usuario"
          titulo={soloMias ? 'No tienes casos asignados' : vencidas ? 'Nada por revisar' : 'Aún no hay casos'}
          texto={soloMias ? 'Cuando tomes un caso, aparecerá aquí.' : vencidas ? 'Ningún caso activo tiene su revisión vencida.' : 'Registra el primer caso de persona desaparecida.'}
          accion={soloMias || vencidas ? undefined : { href: '/busqueda/nuevo', etiqueta: 'Nuevo caso' }}
        />
      ) : (
        <div className="tablero-insumos">
          {ESTADOS_BUSQUEDA.map((e) => (
            <div key={e} className="tablero-col">
              <h3 className="fila" style={{ gap: 6, justifyContent: 'space-between' }}>
                <span>{ETIQUETA_ESTADO_BUSQUEDA[e]}</span>
                <span className="insignia">{porEstado(e).length}</span>
              </h3>
              {porEstado(e).length === 0 && <p className="muted" style={{ fontSize: '.85rem', margin: '0 4px' }}>—</p>}
              {porEstado(e).map((f) => (
                <Link key={f.id} href={'/busqueda/' + f.caso_id} className="tarjeta insumo-card">
                  <div className="fila" style={{ justifyContent: 'space-between', gap: 6 }}>
                    <span className="insignia">{f.codigo}</span>
                    {f.es_nna && <Pill tono="critica" punto={false}>NNA</Pill>}
                  </div>
                  <strong style={{ display: 'block', margin: '6px 0 2px' }}>{f.caso?.titulo ?? '—'}</strong>
                  <div className="muted" style={{ fontSize: '.82rem' }}>
                    {f.edad != null ? `${f.edad} años` : 'Edad n/d'}{f.ultima_ubicacion ? ` · ${f.ultima_ubicacion}` : ''}
                  </div>
                  {f.caso?.asignado?.nombre_completo ? (
                    <div className="muted fila" style={{ gap: 4, fontSize: '.8rem', marginTop: 4 }}>
                      <Icono nombre="usuario" size={13} /> {nombreMostrado(f.caso.asignado.nombre_completo, esAdmin)}
                    </div>
                  ) : (
                    <div className="fila" style={{ gap: 4, fontSize: '.8rem', marginTop: 4 }}>
                      <Pill tono={tonoDeClase(claseEstadoBusqueda(e))} punto={false}>Sin asignar</Pill>
                    </div>
                  )}
                  {esVencida(f) && <div className="fila" style={{ gap: 4, marginTop: 4 }}><Pill tono="aviso" punto={false}><Icono nombre="reloj" size={12} /> Revisión vencida</Pill></div>}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </AnimarEntrada>
  );
}
