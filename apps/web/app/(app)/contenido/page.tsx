import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esCoordinacion, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { esLiderContenido } from '@/lib/nav-flags';
import { nombreMostrado } from '@/lib/nombre';
import Consejo from '@/components/Consejos';
import { ETAPAS_CONTENIDO, ETIQUETA_ETAPA, ETIQUETA_DESTINO, claseEtapa, ROL_DE_ETAPA } from '@/lib/constantes';
import type { EtapaContenido } from '@unidos/types';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import ResaltarNuevos from '@/components/ResaltarNuevos';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonActualizar from '@/components/BotonActualizar';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import Avatar from '@/components/Avatar';
import EstadoVacio from '@/components/EstadoVacio';
import DetallePieza from './DetallePieza';
import LineamientosMarca from './LineamientosMarca';
import { crearPieza } from './actions';
import BotonEnviar from '@/components/BotonEnviar';
import DrawerModal from '@/components/DrawerModal';

type SP = { pieza?: string };

export default async function ContenidoPage({ searchParams }: { searchParams: SP }) {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  // El Admin de Redes supervisa el contenido (solo lectura; la RLS bloquea la escritura).
  const supervisa = esAdminRedes(perfil);
  const supabase = await createClient();
  // El Admin de Redes OPERA el contenido con su 2ª verificación (identidad) aprobada;
  // la RLS aplica el mismo criterio.
  let puedeOperarRedes = false;
  if (supervisa) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    puedeOperarRedes = (vi as any)?.estado === 'aprobada';
  }
  // El área de Contenido queda para el admin, el Admin de Redes y los líderes de sus grupos.
  if (!esAdmin && !supervisa && !(await esLiderContenido(supabase, user!.id))) redirect('/dashboard');

  const [{ data: piezasData }, { data: perfilesData }, { data: marca }] = await Promise.all([
    supabase.from('piezas_contenido').select('*').order('actualizado_en', { ascending: false }),
    supabase.from('perfiles').select('id, nombre_completo, avatar_url'),
    supabase.from('lineamientos_marca').select('*').eq('id', 1).maybeSingle(),
  ]);
  const piezas = (piezasData ?? []) as any[];
  const nombres = new Map<string, string>((perfilesData ?? []).map((p: any) => [p.id, nombreMostrado(p.nombre_completo, esAdmin)]));
  const avatares = new Map<string, string | null>((perfilesData ?? []).map((p: any) => [p.id, p.avatar_url]));
  const porEtapa = (e: EtapaContenido) => piezas.filter((p) => p.etapa === e);

  // Pie de autoría: creador + quienes la modificaron (uno o varios).
  const autoria = (p: any) => {
    const creador = p.creado_por ? (nombres.get(p.creado_por) ?? '—') : null;
    const otros = ((p.colaboradores ?? []) as string[])
      .filter((id) => id !== p.creado_por).map((id) => nombres.get(id)).filter(Boolean) as string[];
    return { creador, otros };
  };

  const hrefPieza = (id: string) => '/contenido?pieza=' + id;
  let drawerPieza: any = null; let drawerHist: any[] = []; let drawerAdjuntos: any[] = []; let drawerPuedeEtapa = false;
  if (searchParams.pieza) {
    const [{ data: dp }, { data: dh }, { data: da }] = await Promise.all([
      supabase.from('piezas_contenido').select('*').eq('id', searchParams.pieza).single(),
      supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en')
        .eq('entidad', 'piezas_contenido').eq('entidad_id', searchParams.pieza).order('creado_en', { ascending: false }).limit(50),
      supabase.from('piezas_adjuntos').select('id, url, nombre, mime, creado_por, creado_en')
        .eq('pieza_id', searchParams.pieza).order('creado_en'),
    ]);
    drawerPieza = dp; drawerHist = dh ?? []; drawerAdjuntos = da ?? [];
    if (dp) {
      const rolEtapa = ROL_DE_ETAPA[dp.etapa as EtapaContenido];
      // El influencer puede actuar en cualquier etapa; el resto en la suya.
      drawerPuedeEtapa = esCoordinacion(perfil) || puedeOperarRedes || rolesDe(perfil).includes('influencers')
        || (!!rolEtapa && rolesDe(perfil).includes(rolEtapa));
    }
  }

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="piezas_contenido" />
      <Consejo id="contenido" titulo="Cómo se produce el contenido">
        Crea una pieza y avánzala por etapas: <strong>Redacción → Diseño/Video → Community Manager → Publicado</strong>. Cada quien trabaja su etapa y la autoría queda registrada.
      </Consejo>
      <div className="pagina-cab">
        <div>
          <h1>Producción de Contenido</h1>
          <p className="muted sub">Redacción escribe el contenido y el caption → Diseño/Video producen la pieza → Redes la publica.</p>
        </div>
        <BotonActualizar />
      </div>

      <LineamientosMarca m={marca} esAdmin={esAdmin} />

      <details className="tarjeta" style={{ margin: '12px 0' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }} className="fila"><Icono nombre="mas" size={16} /> Nueva pieza de contenido</summary>
        <form action={crearPieza} style={{ marginTop: 12 }}>
          <div className="campo"><label>Título</label><input name="titulo" className="input" required placeholder="Ej. Campaña de recolección — semana 1" /></div>
          <div className="campo"><label>Contenido (texto para el diseño o el video) — opcional</label><textarea name="contenido" className="input" rows={3} /></div>
          <div className="campo"><label>Descripción (caption para redes) — opcional</label><textarea name="descripcion" className="input" rows={2} /></div>
          <BotonEnviar cargando="Creando…"><Icono nombre="mas" size={16} /> Crear pieza</BotonEnviar>
        </form>
      </details>

      <div>
        <div className="grupo-main">
          {piezas.length === 0 ? (
            <EstadoVacio
              icono="imagen"
              titulo="Todavía no hay piezas"
              texto="Crea una con «Nueva pieza»: Redacción escribe el contenido y la descripción, pasa a Diseño o Video para producir la pieza, y termina en Redes Sociales para publicar."
            />
          ) : (
            <ResaltarNuevos>
            <div className="tablero">
              {ETAPAS_CONTENIDO.map((e) => (
                <div key={e} className="tablero-col">
                  <div className="tablero-col-cab">
                    <Pill tono={tonoDeClase(claseEtapa(e))}>{ETIQUETA_ETAPA[e]}</Pill>
                    <span className="muted" style={{ fontWeight: 700 }}>{porEtapa(e).length}</span>
                  </div>
                  {porEtapa(e).map((p) => {
                    const a = autoria(p);
                    return (
                      <Link key={p.id} data-fila href={hrefPieza(p.id)} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 0, display: 'block' }}>
                        <strong style={{ display: 'block' }}>{p.titulo}</strong>
                        <div style={{ marginTop: 8, fontSize: '.82rem' }}>
                          {p.asignado_a
                            ? <span className="celda-persona"><Avatar nombre={nombres.get(p.asignado_a)} url={avatares.get(p.asignado_a)} size={20} /> {nombres.get(p.asignado_a) ?? '—'}</span>
                            : <span className="muted">Sin asignar</span>}
                        </div>
                        {e === 'redaccion' && p.destino && <div className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>→ {ETIQUETA_DESTINO[p.destino as keyof typeof ETIQUETA_DESTINO]}</div>}
                        <div className="muted" style={{ fontSize: '.72rem', marginTop: 6, borderTop: '1px solid var(--borde)', paddingTop: 4 }}>
                          {a.creador ? <>Hecho por <strong style={{ color: 'var(--texto)' }}>{a.creador}</strong>{a.otros.length ? ' · editado por ' + a.otros.join(', ') : ''}</> : 'Sin autor'}
                        </div>
                      </Link>
                    );
                  })}
                  {porEtapa(e).length === 0 && <p className="muted" style={{ fontSize: '.82rem', margin: '2px 4px' }}>—</p>}
                </div>
              ))}
            </div>
            </ResaltarNuevos>
          )}
        </div>
        {drawerPieza && (
          <>
            <Link href="/contenido" className="drawer-backdrop" aria-label="Cerrar detalle" />
            <DrawerModal cerrarHref="/contenido" etiqueta={'Detalle de la pieza ' + drawerPieza.titulo}>
              <DetallePieza
                pieza={drawerPieza} perfiles={perfilesData ?? []} historial={drawerHist} adjuntos={drawerAdjuntos}
                volver={hrefPieza(drawerPieza.id)} cerrarHref="/contenido" puedeEtapa={drawerPuedeEtapa}
                miId={user!.id} esCoord={esAdmin}
                nombres={nombres} avatares={avatares}
              />
            </DrawerModal>
          </>
        )}
      </div>
    </AnimarEntrada>
  );
}
