import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esCoordinacion, puedePipeline } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETAPAS_CONTENIDO, ETIQUETA_ETAPA, ETIQUETA_DESTINO, claseEtapa, ROL_DE_ETAPA } from '@/lib/constantes';
import type { EtapaContenido } from '@unidos/types';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';
import Pill, { tonoDeClase } from '@/components/Pill';
import Avatar from '@/components/Avatar';
import DetallePieza from './DetallePieza';

type SP = { pieza?: string };

export default async function ContenidoPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  if (!puedePipeline(perfil?.rol)) redirect('/dashboard');
  const supabase = await createClient();
  const rol = perfil?.rol;

  const [{ data: piezasData }, { data: perfilesData }] = await Promise.all([
    supabase.from('piezas_contenido').select('*').order('actualizado_en', { ascending: false }),
    supabase.from('perfiles').select('id, nombre_completo, avatar_url'),
  ]);
  const piezas = (piezasData ?? []) as any[];
  const nombres = new Map<string, string>((perfilesData ?? []).map((p: any) => [p.id, p.nombre_completo]));
  const avatares = new Map<string, string | null>((perfilesData ?? []).map((p: any) => [p.id, p.avatar_url]));
  const porEtapa = (e: EtapaContenido) => piezas.filter((p) => p.etapa === e);

  const hrefPieza = (id: string) => '/contenido?pieza=' + id;
  let drawerPieza: any = null; let drawerHist: any[] = []; let drawerPuedeEtapa = false;
  if (searchParams.pieza) {
    const [{ data: dp }, { data: dh }] = await Promise.all([
      supabase.from('piezas_contenido').select('*').eq('id', searchParams.pieza).single(),
      supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en')
        .eq('entidad', 'piezas_contenido').eq('entidad_id', searchParams.pieza).order('creado_en', { ascending: false }).limit(50),
    ]);
    drawerPieza = dp; drawerHist = dh ?? [];
    if (dp) drawerPuedeEtapa = esCoordinacion(rol) || ROL_DE_ETAPA[dp.etapa as EtapaContenido] === rol;
  }

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="piezas_contenido" />
      <div className="pagina-cab">
        <div>
          <h1>Producción de Contenido</h1>
          <p className="muted sub">Casos confirmados que avanzan de Redacción a Diseño/Video y luego a Redes.</p>
        </div>
        <BotonActualizar />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', margin: '16px 0' }}>
        {ETAPAS_CONTENIDO.map((e) => (
          <div key={e} className="tarjeta" style={{ marginBottom: 0 }}>
            <div style={{ marginBottom: 6 }}><Pill tono={tonoDeClase(claseEtapa(e))}>{ETIQUETA_ETAPA[e]}</Pill></div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1 }}>{porEtapa(e).length}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="grupo-main">
          {piezas.length === 0 ? (
            <div className="tarjeta vacio">
              <Icono nombre="documento" size={40} />
              <p className="muted" style={{ marginBottom: 0 }}>Todavía no hay piezas. Desde Verificación, envía un caso confirmado a Redacción.</p>
            </div>
          ) : (
            <div className="tablero">
              {ETAPAS_CONTENIDO.map((e) => (
                <div key={e} className="tablero-col">
                  <div className="tablero-col-cab">
                    <Pill tono={tonoDeClase(claseEtapa(e))}>{ETIQUETA_ETAPA[e]}</Pill>
                    <span className="muted" style={{ fontWeight: 700 }}>{porEtapa(e).length}</span>
                  </div>
                  {porEtapa(e).map((p) => (
                    <Link key={p.id} href={hrefPieza(p.id)} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 0, display: 'block' }}>
                      <strong style={{ display: 'block' }}>{p.titulo}</strong>
                      <div style={{ marginTop: 8, fontSize: '.82rem' }}>
                        {p.asignado_a
                          ? <span className="celda-persona"><Avatar nombre={nombres.get(p.asignado_a)} url={avatares.get(p.asignado_a)} size={20} /> {nombres.get(p.asignado_a) ?? '—'}</span>
                          : <span className="muted">Sin asignar</span>}
                      </div>
                      {e === 'redaccion' && p.destino && <div className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>→ {ETIQUETA_DESTINO[p.destino as keyof typeof ETIQUETA_DESTINO]}</div>}
                    </Link>
                  ))}
                  {porEtapa(e).length === 0 && <p className="muted" style={{ fontSize: '.82rem', margin: '2px 4px' }}>—</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        {drawerPieza && (
          <>
            <Link href="/contenido" className="drawer-backdrop" aria-label="Cerrar detalle" />
            <aside className="drawer-lateral" role="dialog" aria-modal="true" aria-label={'Detalle de la pieza ' + drawerPieza.titulo}>
              <DetallePieza
                pieza={drawerPieza} perfiles={perfilesData ?? []} historial={drawerHist}
                volver={hrefPieza(drawerPieza.id)} cerrarHref="/contenido" puedeEtapa={drawerPuedeEtapa}
                nombres={nombres} avatares={avatares}
              />
            </aside>
          </>
        )}
      </div>
    </AnimarEntrada>
  );
}
