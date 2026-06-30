import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esCoordinacion, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETAPAS_CONTENIDO, ETIQUETA_ETAPA, ETIQUETA_ROL, ROL_DE_ETAPA, ETIQUETA_DESTINO, claseEtapa } from '@/lib/constantes';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import Avatar from '@/components/Avatar';
import EstadoVacio from '@/components/EstadoVacio';
import DetallePieza from '../../contenido/DetallePieza';

type SP = { pieza?: string };

export default async function EspacioPage({ params, searchParams }: { params: { id: string }; searchParams: SP }) {
  const { perfil } = await requireUsuario();
  const supabase = await createClient();
  const id = params.id;

  const { data: grupo } = await supabase.from('grupos')
    .select('id, nombre, descripcion, rol_objetivo, whatsapp').eq('id', id).single() as any;
  if (!grupo || !grupo.rol_objetivo) redirect('/espacios');

  const rolObj = grupo.rol_objetivo as string;
  const etapa = ETAPAS_CONTENIDO.find((e) => ROL_DE_ETAPA[e] === rolObj); // etapa del pipeline (si aplica)
  const puedeActuar = esCoordinacion(perfil) || rolesDe(perfil).includes(grupo.rol_objetivo);

  const [{ count: miembros }, { data: perfilesData }] = await Promise.all([
    supabase.from('miembros_grupo').select('*', { count: 'exact', head: true }).eq('grupo_id', id),
    supabase.from('perfiles').select('id, nombre_completo, avatar_url'),
  ]);
  const nombres = new Map<string, string>((perfilesData ?? []).map((p: any) => [p.id, p.nombre_completo]));
  const avatares = new Map<string, string | null>((perfilesData ?? []).map((p: any) => [p.id, p.avatar_url]));

  // Cola de trabajo de la etapa (solo roles de producción).
  let piezas: any[] = [];
  if (etapa) {
    const { data } = await supabase.from('piezas_contenido').select('*').eq('etapa', etapa)
      .order('actualizado_en', { ascending: false });
    piezas = (data ?? []) as any[];
  }
  // Para recopilación: casos recientes que puede ver.
  let casos: any[] = [];
  if (rolObj === 'recopilacion') {
    const { data } = await supabase.from('casos').select('id, numero, titulo, estado')
      .order('actualizado_en', { ascending: false }).limit(8);
    casos = (data ?? []) as any[];
  }

  // Panel lateral con el detalle de una pieza (acciones de la etapa) sin salir del espacio.
  const hrefPieza = (pid: string) => '/espacios/' + id + '?pieza=' + pid;
  const cerrarHref = '/espacios/' + id;
  let drawerPieza: any = null; let drawerHist: any[] = [];
  if (searchParams.pieza && etapa) {
    const [{ data: dp }, { data: dh }] = await Promise.all([
      supabase.from('piezas_contenido').select('*').eq('id', searchParams.pieza).single(),
      supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en')
        .eq('entidad', 'piezas_contenido').eq('entidad_id', searchParams.pieza).order('creado_en', { ascending: false }).limit(50),
    ]);
    drawerPieza = dp; drawerHist = dh ?? [];
  }

  return (
    <AnimarEntrada>
      {etapa && <RealtimeRefrescar tabla="piezas_contenido" />}
      <div className="pagina-cab">
        <div>
          <Link href="/espacios" className="muted" style={{ fontSize: '.85rem' }}>← Espacios de trabajo</Link>
          <h1 style={{ margin: '2px 0' }}>{grupo.nombre}</h1>
          <p className="muted sub" style={{ margin: 0 }}>
            {ETIQUETA_ROL[grupo.rol_objetivo as keyof typeof ETIQUETA_ROL] ?? rolObj} · tu espacio para manejar tu parte del flujo.
          </p>
        </div>
      </div>

      {/* Tu equipo: enlaces a la mano */}
      <div className="tarjeta" style={{ background: '#f8fafc' }}>
        <div className="fila" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span className="fila muted" style={{ gap: 6 }}><Icono nombre="grupos" size={16} /> Tu equipo · {miembros ?? 0} {((miembros ?? 0) === 1) ? 'persona' : 'personas'}</span>
          <div className="fila" style={{ flexWrap: 'wrap' }}>
            <Link className="btn" href={'/grupos/' + id}><Icono nombre="grupos" size={16} /> Abrir grupo</Link>
            <Link className="btn" href={'/grupos/' + id + '/pizarra'}><Icono nombre="pizarra" size={16} /> Pizarra</Link>
            {grupo.whatsapp && <a className="btn" href={grupo.whatsapp} target="_blank" rel="noopener noreferrer"><Icono nombre="whatsapp" size={16} /> Chat</a>}
          </div>
        </div>
      </div>

      {/* Cola de trabajo de la etapa (producción) */}
      {etapa ? (
        <>
          <h2 className="fila" style={{ gap: 8 }}>
            Tu cola en {ETIQUETA_ETAPA[etapa]} <Pill tono={tonoDeClase(claseEtapa(etapa))} punto={false}>{piezas.length}</Pill>
          </h2>
          <p className="muted" style={{ marginTop: -6 }}>Las piezas que están en tu etapa ahora. Ábrelas para trabajarlas y avanzarlas.</p>
          {piezas.length === 0 ? (
            <EstadoVacio icono="documento" titulo="No hay piezas en tu etapa" texto="Cuando lleguen piezas a tu etapa, aparecerán aquí listas para trabajar." />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
              {piezas.map((p) => (
                <Link key={p.id} href={hrefPieza(p.id)} className="tarjeta tarea-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <strong style={{ display: 'block' }}>{p.titulo}</strong>
                  <div className="fila" style={{ marginTop: 10, gap: 8, fontSize: '.85rem', justifyContent: 'space-between' }}>
                    <span className="celda-persona">
                      {p.asignado_a
                        ? <><Avatar nombre={nombres.get(p.asignado_a)} url={avatares.get(p.asignado_a)} size={22} /> {nombres.get(p.asignado_a) ?? '—'}</>
                        : <span className="muted">Sin asignar</span>}
                    </span>
                    {etapa === 'redaccion' && p.destino && <span className="muted">→ {ETIQUETA_DESTINO[p.destino as keyof typeof ETIQUETA_DESTINO]}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : rolObj === 'recopilacion' ? (
        <>
          <h2>Tu parte del flujo: reportar información</h2>
          <p className="muted" style={{ marginTop: -6 }}>Envía casos para verificación y dales seguimiento.</p>
          <div className="fila" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
            <Link className="btn btn-primario" href="/casos/nuevo"><Icono nombre="mas" size={16} /> Reportar un caso</Link>
            <Link className="btn" href="/casos"><Icono nombre="ok" size={16} /> Ver casos en verificación</Link>
          </div>
          {casos.length === 0 ? (
            <EstadoVacio icono="documento" titulo="Aún no hay casos" texto="Reporta el primero para que el equipo de verificación lo revise."
              accion={{ href: '/casos/nuevo', etiqueta: 'Reportar un caso' }} />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
              {casos.map((c) => (
                <Link key={c.id} href={'/casos/' + c.id} className="tarjeta tarea-card" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div className="muted" style={{ fontSize: '.8rem' }}>#{String(c.numero).padStart(5, '0')}</div>
                  <strong style={{ display: 'block' }}>{c.titulo}</strong>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : null}

      {drawerPieza && (
        <>
          <Link href={cerrarHref} className="drawer-backdrop" aria-label="Cerrar detalle" />
          <aside className="drawer-lateral" role="dialog" aria-modal="true" aria-label={'Detalle de la pieza ' + drawerPieza.titulo}>
            <DetallePieza
              pieza={drawerPieza} perfiles={perfilesData ?? []} historial={drawerHist}
              volver={hrefPieza(drawerPieza.id)} cerrarHref={cerrarHref} puedeEtapa={puedeActuar}
              nombres={nombres} avatares={avatares}
            />
          </aside>
        </>
      )}
    </AnimarEntrada>
  );
}
