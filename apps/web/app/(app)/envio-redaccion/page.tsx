import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminRedes, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import { fechaHora } from '@/lib/fechas';
import { nombreMostrado } from '@/lib/nombre';
import {
  CATEGORIAS_CASO, CANALES_DIFUSION, ETIQUETA_CANAL_DIFUSION,
} from '@/lib/constantes';
import {
  etapaRedaccion, ETAPAS_REDACCION, ETIQUETA_ETAPA_REDACCION, pasoRedaccion,
} from '@/lib/flujo';
import Icono from '@/components/Icono';
import Kpi from '@/components/Kpi';
import BotonExportar from '@/components/BotonExportar';
import Pill from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import EstadoCaso from '@/components/EstadoCaso';
import FlujoProgreso from '@/components/FlujoProgreso';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import BarraBusqueda from '@/components/BarraBusqueda';
import FiltroSelect from '@/components/FiltroSelect';
import DrawerModal from '@/components/DrawerModal';
import Consejo from '@/components/Consejos';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import ResaltarNuevos from '@/components/ResaltarNuevos';
import TarjetaRedaccion from './TarjetaRedaccion';
import DetalleRedaccion from './DetalleRedaccion';

type SP = { q?: string; categoria?: string; etapa?: string; canal?: string; prioridad?: string; vista?: string; caso?: string };

// Columnas seguras (0166 ya desplegado). redactor_id/canales (0169) se traen aparte,
// best-effort, para no romper la vista si esa migración aún no está aplicada.
const COLS = 'id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, contacto, notas, creado_por, actualizado_en, requiere_difusion, es_requerimiento, req_tipo, req_cantidad, req_urgencia, lat, lng, estado, publicado_en, publicacion_url';

export default async function EnvioRedaccionPage({ searchParams }: { searchParams: SP }) {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const puede = esAdmin || esAdminRedes(perfil) || rolesDe(perfil).includes('redaccion');
  if (!puede) redirect('/dashboard');
  // Operar (tomar/enviar/marcar) es de Redacción/admin; el Admin de Redes supervisa (lectura).
  const puedeOperar = esAdmin || rolesDe(perfil).includes('redaccion');
  const supabase = await createClient();

  // ── Filtros ──
  const q = (searchParams.q ?? '').trim().slice(0, 120);
  const nBuscado = q.match(/^(?:sol[-\s]?)?#?0*(\d{1,10})$/i)?.[1];
  const fCat = CATEGORIAS_CASO.includes(searchParams.categoria ?? '') ? searchParams.categoria! : '';
  const fEtapa = ETAPAS_REDACCION.includes((searchParams.etapa ?? '') as any) ? searchParams.etapa! : '';
  const fCanal = CANALES_DIFUSION.includes(searchParams.canal ?? '') ? searchParams.canal! : '';
  const fPrioridad = searchParams.prioridad === '1';
  const vista = searchParams.vista === 'lista' ? 'lista' : 'tablero';
  const hayFiltros = Boolean(q || fCat || fEtapa || fCanal || fPrioridad);

  // ── KPIs (conteos exactos, RLS-scoped) ──
  const base = () => supabase.from('casos').select('*', { count: 'exact', head: true });
  const [kPorDif, kEnviadas, kPublicadas, kPrioridad] = await Promise.all([
    base().eq('estado', 'confirmado').is('publicado_en', null),
    base().eq('estado', 'enviado_redaccion').is('publicado_en', null),
    base().not('publicado_en', 'is', null),
    base().eq('requiere_difusion', true).is('publicado_en', null).in('estado', ['confirmado', 'enviado_redaccion']),
  ]);
  const nPorDif = kPorDif.count ?? 0, nEnv = kEnviadas.count ?? 0, nPub = kPublicadas.count ?? 0, nPri = kPrioridad.count ?? 0;
  const totalRelevante = nPorDif + nEnv + nPub;
  const difundidas = nEnv + nPub;
  const pctCobertura = totalRelevante ? Math.round((difundidas / totalRelevante) * 100) : 0;

  // ── Conjunto relevante para Redacción: confirmadas/enviadas (pipeline activo) +
  //    las ya publicadas (pueden estar en cualquier estado). Se unen y de-duplican. ──
  const [{ data: activos }, { data: publicados }] = await Promise.all([
    supabase.from('casos').select(COLS).in('estado', ['confirmado', 'enviado_redaccion']).order('actualizado_en', { ascending: false }).limit(500),
    supabase.from('casos').select(COLS).not('publicado_en', 'is', null).order('actualizado_en', { ascending: false }).limit(500),
  ]);
  const porId = new Map<string, any>();
  for (const c of [...((activos as any[]) ?? []), ...((publicados as any[]) ?? [])]) porId.set(c.id, c);
  let lista = Array.from(porId.values()).sort((a, b) => (a.actualizado_en < b.actualizado_en ? 1 : -1));

  // redactor_id + canales (0169) best-effort: si faltan las columnas, se omite sin romper.
  const ids = lista.map((c) => c.id);
  if (ids.length) {
    const { data: ext } = await supabase.from('casos').select('id, redactor_id, canales_publicacion').in('id', ids);
    if (ext) {
      const m = new Map((ext as any[]).map((r) => [r.id, r]));
      for (const c of lista) { const e: any = m.get(c.id); if (e) { c.redactor_id = e.redactor_id; c.canales_publicacion = e.canales_publicacion ?? []; } }
    }
  }

  // Filtros en memoria (incluye canal, que depende de la columna 0169).
  if (fCat) lista = lista.filter((c) => c.categoria === fCat);
  if (fEtapa) lista = lista.filter((c) => etapaRedaccion(c) === fEtapa);
  if (fPrioridad) lista = lista.filter((c) => c.requiere_difusion && !c.publicado_en);
  if (fCanal) lista = lista.filter((c) => ((c.canales_publicacion ?? []) as string[]).includes(fCanal));
  if (q) {
    const s = q.toLowerCase();
    lista = lista.filter((c) =>
      (nBuscado && String(c.numero) === String(Number(nBuscado)))
      || String(c.titulo ?? '').toLowerCase().includes(s)
      || String(c.descripcion ?? '').toLowerCase().includes(s)
      || String(c.fuente ?? '').toLowerCase().includes(s));
  }

  // Nombres de redactores (respeta privacidad de apellidos).
  const redIds = Array.from(new Set(lista.map((c) => c.redactor_id).filter(Boolean)));
  const nombreRed = new Map<string, string>();
  if (redIds.length || searchParams.caso) {
    const { data: perfs } = await supabase.from('perfiles').select('id, nombre_completo');
    for (const p of ((perfs as any[]) ?? [])) nombreRed.set(p.id, nombreMostrado(p.nombre_completo, esAdmin));
  }

  // ── Enlaces que conservan filtros ──
  const filtros = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, categoria: fCat, etapa: fEtapa, canal: fCanal, prioridad: fPrioridad ? '1' : '', vista: vista === 'lista' ? 'lista' : '' })) if (v) filtros.set(k, v as string);
  const baseHref = '/envio-redaccion' + (filtros.toString() ? '?' + filtros.toString() : '');
  const hrefCaso = (cid: string) => { const p = new URLSearchParams(filtros); p.set('caso', cid); return '/envio-redaccion?' + p.toString(); };
  const cerrarHref = baseHref;
  const hrefVista = (v: 'lista' | 'tablero') => { const p = new URLSearchParams(filtros); p.delete('vista'); if (v === 'lista') p.set('vista', 'lista'); return '/envio-redaccion' + (p.toString() ? '?' + p.toString() : ''); };
  const kpiHref = (params: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q); if (fCat) p.set('categoria', fCat); if (vista === 'lista') p.set('vista', 'lista');
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    return '/envio-redaccion' + (p.toString() ? '?' + p.toString() : '');
  };

  // ── Drawer (?caso=ID) ──
  let dCaso: any = null;
  if (searchParams.caso) {
    const { data: dc } = await supabase.from('casos').select(COLS).eq('id', searchParams.caso).single();
    dCaso = dc;
    if (dCaso) {
      const { data: dext } = await supabase.from('casos').select('id, redactor_id, canales_publicacion').eq('id', dCaso.id).maybeSingle();
      if (dext) { dCaso.redactor_id = (dext as any).redactor_id; dCaso.canales_publicacion = (dext as any).canales_publicacion ?? []; }
      const { data: dAdj } = await supabase.from('casos_adjuntos').select('id, url, nombre, mime').eq('caso_id', dCaso.id).order('creado_en');
      dCaso.adjuntos = await Promise.all(((dAdj as any[]) ?? []).map(async (a) => ({ ...a, href: await urlFirmada(supabase, 'adjuntos', a.url, 3600) })));
      if (dCaso.redactor_id && !nombreRed.has(dCaso.redactor_id)) {
        const { data: rp } = await supabase.from('perfiles').select('nombre_completo').eq('id', dCaso.redactor_id).maybeSingle();
        if (rp) nombreRed.set(dCaso.redactor_id, nombreMostrado((rp as any).nombre_completo, esAdmin));
      }
    }
  }

  const porEtapa = (et: string) => lista.filter((c) => etapaRedaccion(c) === et);
  const tonoEtapa: Record<string, 'info' | 'aviso' | 'ok'> = { por_difundir: 'info', en_redaccion: 'aviso', publicada: 'ok' };

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="casos" />
      <Consejo id="envio-redaccion" titulo="Difundir las solicitudes confirmadas">
        Toda solicitud <strong>confirmada</strong> llega aquí para difundirse en redes, en paralelo a Logística.
        <strong> Tómala</strong> para redactarla, <strong>copia</strong> su información, publícala y <strong>márcala publicada</strong> con sus canales. Las de <strong>prioridad</strong> son las que Logística no pudo cubrir.
      </Consejo>

      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="cohete" size={24} /> Envío a Redacción</h1>
          <p className="muted sub">Difunde en redes las solicitudes confirmadas y lleva el registro de qué se publicó y dónde.</p>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <BotonExportar csvHref="/envio-redaccion/export" imprimirHref="/envio-redaccion/imprimir" />
          <BotonActualizar />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Por difundir" valor={nPorDif} sub="Confirmadas, sin enviar" color="var(--azul)" icono="documento" tinte="#eef2ff" href={kpiHref({ etapa: 'por_difundir' })} />
        <Kpi etiqueta="Prioridad" valor={nPri} sub="Logística no pudo cubrir" color="#b91c1c" icono="avisos" tinte="#fee2e2" href={kpiHref({ prioridad: '1' })} />
        <Kpi etiqueta="En redacción" valor={nEnv} sub="Enviadas, en proceso" color="#a16207" icono="reloj" tinte="#fef9c3" href={kpiHref({ etapa: 'en_redaccion' })} />
        <Kpi etiqueta="Publicadas" valor={nPub} sub="Difusión cerrada" color="#16a34a" icono="ok" tinte="#d1fae5" href={kpiHref({ etapa: 'publicada' })} />
      </div>

      {/* Cobertura de difusión */}
      {totalRelevante > 0 && (
        <div className="cobertura">
          <span className="cobertura-et">Cobertura de difusión</span>
          <div className="cobertura-barra" role="progressbar" aria-valuenow={pctCobertura} aria-valuemin={0} aria-valuemax={100} aria-label="Cobertura de difusión">
            <div className="cobertura-fill" style={{ width: pctCobertura + '%' }} />
          </div>
          <span className="muted" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{difundidas} de {totalRelevante} enviadas o publicadas</span>
        </div>
      )}

      {/* Búsqueda + filtros */}
      <div className="toolbar" style={{ marginTop: 14 }}>
        <form method="get" className="fila crece" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 0 }}>
          {vista === 'lista' && <input type="hidden" name="vista" value="lista" />}
          <BarraBusqueda name="q" placeholder="Buscar por número (#00012), título, descripción o fuente…" defaultValue={q} className="crece" />
          <div className="campo-filtro">
            <label htmlFor="f-etapa">Etapa</label>
            <FiltroSelect id="f-etapa" name="etapa" className="input" defaultValue={fEtapa} style={{ width: 'auto' }}>
              <option value="">Todas</option>
              {ETAPAS_REDACCION.map((e) => <option key={e} value={e}>{ETIQUETA_ETAPA_REDACCION[e]}</option>)}
            </FiltroSelect>
          </div>
          <div className="campo-filtro">
            <label htmlFor="f-cat">Categoría</label>
            <FiltroSelect id="f-cat" name="categoria" className="input" defaultValue={fCat} style={{ width: 'auto' }}>
              <option value="">Todas</option>
              {CATEGORIAS_CASO.map((c) => <option key={c} value={c}>{c}</option>)}
            </FiltroSelect>
          </div>
          <div className="campo-filtro">
            <label htmlFor="f-canal">Canal</label>
            <FiltroSelect id="f-canal" name="canal" className="input" defaultValue={fCanal} style={{ width: 'auto' }}>
              <option value="">Todos</option>
              {CANALES_DIFUSION.map((c) => <option key={c} value={c}>{ETIQUETA_CANAL_DIFUSION[c]}</option>)}
            </FiltroSelect>
          </div>
          <label className="fila" style={{ gap: 6, fontSize: '.85rem', cursor: 'pointer' }}>
            <input type="checkbox" name="prioridad" value="1" defaultChecked={fPrioridad} style={{ width: 'auto', minHeight: 0 }} /> Solo prioridad
          </label>
          <button className="btn" type="submit"><Icono nombre="filtro" /> Filtrar</button>
          {hayFiltros && <Link className="btn" href={vista === 'lista' ? '/envio-redaccion?vista=lista' : '/envio-redaccion'}>Limpiar</Link>}
        </form>
        <div className="toolbar-acciones">
          <div className="seg" aria-label="Cómo ver las solicitudes">
            <Link href={hrefVista('tablero')} aria-current={vista === 'tablero' ? 'page' : undefined} className={vista === 'tablero' ? 'activo' : undefined}>Tablero</Link>
            <Link href={hrefVista('lista')} aria-current={vista === 'lista' ? 'page' : undefined} className={vista === 'lista' ? 'activo' : undefined}>Lista</Link>
          </div>
        </div>
      </div>

      {lista.length === 0 ? (
        <EstadoVacio
          icono={hayFiltros ? 'buscar' : 'ok'}
          titulo={hayFiltros ? 'Sin resultados' : 'Nada pendiente por difundir'}
          texto={hayFiltros
            ? 'Ninguna solicitud coincide con la búsqueda o los filtros.'
            : 'Cuando Verificación confirme una solicitud, aparecerá aquí para difundirla en redes.'}
        />
      ) : vista === 'tablero' ? (
        <ResaltarNuevos>
          <div className="tablero" style={{ marginTop: 4 }}>
            {ETAPAS_REDACCION.map((et) => {
              const items = porEtapa(et);
              return (
                <div key={et} className="tablero-col">
                  <div className="tablero-col-cab">
                    <strong style={{ fontSize: '.9rem' }}>{ETIQUETA_ETAPA_REDACCION[et]}</strong>
                    <Pill tono={tonoEtapa[et]} punto={false}>{items.length}</Pill>
                  </div>
                  {items.length === 0 && <p className="muted" style={{ fontSize: '.85rem', margin: '4px' }}>—</p>}
                  {items.map((c) => <TarjetaRedaccion key={c.id} caso={c} href={hrefCaso(c.id)} redactorNombre={c.redactor_id ? nombreRed.get(c.redactor_id) : null} />)}
                </div>
              );
            })}
          </div>
        </ResaltarNuevos>
      ) : (
        <ResaltarNuevos>
          <div className="tarjeta" style={{ marginTop: 4 }}>
            <div className="tabla-scroll"><table>
              <thead><tr><th>ID</th><th>Título</th><th>Categoría</th><th>Redactor</th><th>Etapa</th><th>Canales</th><th>Actualización</th></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const p = pasoRedaccion(c);
                  const canales = (c.canales_publicacion ?? []) as string[];
                  return (
                    <tr key={c.id} data-fila>
                      <td className="muted">#{String(c.numero).padStart(5, '0')}</td>
                      <td>
                        <div className="celda-titulo">
                          <span className="fila" style={{ gap: 6 }}>
                            <Link href={hrefCaso(c.id)}>{c.titulo}</Link>
                            {!c.publicado_en && c.requiere_difusion && <Pill tono="alta" punto={false}>Prioriza</Pill>}
                          </span>
                          {c.descripcion && <div className="desc">{String(c.descripcion).slice(0, 60)}</div>}
                        </div>
                      </td>
                      <td>{c.categoria ? <BadgeCategoria>{c.categoria}</BadgeCategoria> : '—'}</td>
                      <td className="muted" style={{ fontSize: '.82rem' }}>{c.redactor_id ? (nombreRed.get(c.redactor_id) ?? '—') : '—'}</td>
                      <td><FlujoProgreso paso={p.paso} total={p.total} completo={p.completo} etiqueta={p.etiqueta} compacto /></td>
                      <td>{canales.length ? <span className="fila" style={{ gap: 3, flexWrap: 'wrap' }}>{canales.map((x) => <span key={x} className="insignia" style={{ fontSize: '.7rem' }}>{ETIQUETA_CANAL_DIFUSION[x] ?? x}</span>)}</span> : <span className="muted">—</span>}</td>
                      <td className="muted" style={{ fontSize: '.82rem' }}>{fechaHora(c.actualizado_en)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </ResaltarNuevos>
      )}

      {dCaso && (
        <>
          <Link href={cerrarHref} className="drawer-backdrop" aria-label="Cerrar detalle" />
          <DrawerModal cerrarHref={cerrarHref} etiqueta={'Detalle de la solicitud ' + dCaso.titulo}>
            <DetalleRedaccion caso={dCaso} puedeOperar={puedeOperar} esAdmin={esAdmin} redactorNombre={dCaso.redactor_id ? nombreRed.get(dCaso.redactor_id) : null} miId={user!.id} volver={hrefCaso(dCaso.id)} />
          </DrawerModal>
        </>
      )}
    </AnimarEntrada>
  );
}
