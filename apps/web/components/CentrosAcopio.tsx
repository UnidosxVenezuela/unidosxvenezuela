'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl, {
  type Map as MapLibreMap, type Marker as MapLibreMarker, type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createClient } from '@/lib/supabase/client';
import { ETIQUETA_URGENCIA, URGENCIAS, claseUrgencia, ETIQUETA_ROL, ETIQUETA_TIPO_LUGAR, TIPOS_LUGAR, TONO_TIPO_LUGAR } from '@/lib/constantes';
import Icono from './Icono';
import Pill, { tonoDeClase } from './Pill';
import Avatar from './Avatar';
import type { PuntoAcopio, UrgenciaAcopio, Rol } from '@unidos/types';
import { nombreMostrado } from '@/lib/nombre';
import EntradaTelefono from './EntradaTelefono';

type Resp = { perfil_id: string; nombre: string | null; avatar: string | null; rol: Rol | null };
type CentroLider = PuntoAcopio & { creador?: { nombre_completo: string | null; telefono: string | null } | null };

const ESTILO: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
const ORDEN: Record<string, number> = { alta: 0, media: 1, baja: 2 };

export default function CentrosAcopio({ userId, esAdmin }: { userId: string; esAdmin: boolean }) {
  const [centros, setCentros] = useState<CentroLider[]>([]);
  const [responsables, setResponsables] = useState<Map<string, Resp[]>>(new Map());
  const [voluntarios, setVoluntarios] = useState<Map<string, Resp[]>>(new Map());
  const [necCount, setNecCount] = useState<Map<string, number>>(new Map());
  const [candidatos, setCandidatos] = useState<{ id: string; nombre_completo: string | null; rol: Rol | null }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [editando, setEditando] = useState<PuntoAcopio | 'nuevo' | null>(null);
  const [sel, setSel] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cont = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const marcador = useRef<MapLibreMarker | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, resp, vol, nec] = await Promise.all([
      supabase.from('puntos_acopio').select('*, creador:perfiles!creado_por(nombre_completo, telefono)'),
      supabase.from('acopio_responsables').select('punto_id, perfil_id, perfiles(nombre_completo, avatar_url, rol)'),
      supabase.from('acopio_voluntarios').select('punto_id, perfil_id, perfiles(nombre_completo, avatar_url, rol)'),
      supabase.from('necesidades_acopio').select('punto_id').eq('resuelta', false),
    ]);
    // Necesidades abiertas por centro (vacío si la tabla aún no existe).
    const nmap = new Map<string, number>();
    for (const n of (nec.data ?? []) as any[]) nmap.set(n.punto_id, (nmap.get(n.punto_id) ?? 0) + 1);
    setNecCount(nmap);
    const arr = ((data ?? []) as CentroLider[]).sort((a, b) =>
      ((ORDEN[a.urgencia] ?? 1) - (ORDEN[b.urgencia] ?? 1)) || a.nombre.localeCompare(b.nombre));
    setCentros(arr);
    // Agrupa responsables por centro (vacío si la tabla aún no existe).
    const map = new Map<string, Resp[]>();
    for (const r of (resp.data ?? []) as any[]) {
      const lista = map.get(r.punto_id) ?? [];
      lista.push({ perfil_id: r.perfil_id, nombre: nombreMostrado(r.perfiles?.nombre_completo, esAdmin) || null, avatar: r.perfiles?.avatar_url ?? null, rol: r.perfiles?.rol ?? null });
      map.set(r.punto_id, lista);
    }
    setResponsables(map);
    // Agrupa voluntarios por centro (vacío si la tabla aún no existe).
    const vmap = new Map<string, Resp[]>();
    for (const r of (vol.data ?? []) as any[]) {
      const lista = vmap.get(r.punto_id) ?? [];
      lista.push({ perfil_id: r.perfil_id, nombre: nombreMostrado(r.perfiles?.nombre_completo, esAdmin) || null, avatar: r.perfiles?.avatar_url ?? null, rol: r.perfiles?.rol ?? null });
      vmap.set(r.punto_id, lista);
    }
    setVoluntarios(vmap);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Candidatos a responsable (solo el admin asigna).
  useEffect(() => {
    if (!esAdmin) return;
    createClient().from('perfiles').select('id, nombre_completo, rol').order('nombre_completo')
      .then(({ data }) => setCandidatos((data ?? []) as any[]));
  }, [esAdmin]);

  // Mapa selector: vive mientras el formulario está abierto.
  useEffect(() => {
    if (editando === null || !cont.current) return;
    const inicial = editando !== 'nuevo' ? editando : null;
    const m = new maplibregl.Map({
      container: cont.current, style: ESTILO,
      center: inicial ? [inicial.lng, inicial.lat] : [-66.9, 10.48],
      zoom: inicial ? 14 : 6,
    });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    const poner = (lng: number, lat: number) => {
      setSel({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) });
      if (!marcador.current) {
        marcador.current = new maplibregl.Marker({ color: '#CF142B', draggable: true }).setLngLat([lng, lat]).addTo(m);
        marcador.current.on('dragend', () => { const p = marcador.current!.getLngLat(); setSel({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); });
      } else marcador.current.setLngLat([lng, lat]);
    };
    m.on('click', (e) => poner(e.lngLat.lng, e.lngLat.lat));
    if (inicial) { setSel({ lat: inicial.lat, lng: inicial.lng }); poner(inicial.lng, inicial.lat); }
    else setSel(null);
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; marcador.current = null; };
  }, [editando]);

  function abrir(c: PuntoAcopio | 'nuevo') { setError(null); setEditando(c); }
  function cerrar() { setEditando(null); setSel(null); }

  // El panel lateral se cierra con Escape (mismo gesto que DrawerModal).
  useEffect(() => {
    if (editando === null) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setEditando(null); setSel(null); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [editando]);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!sel) { setError('Marca la ubicación en el mapa (toca o arrastra el pin).'); return; }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const nombre = String(fd.get('nombre') || '').trim();
    if (!nombre) { setError('El nombre es obligatorio.'); return; }
    setGuardando(true);
    const supabase = createClient();
    const payload = {
      nombre,
      tipo: (String(fd.get('tipo') || 'acopio') as PuntoAcopio['tipo']),
      capacidad: str(fd.get('capacidad')),
      camas_total: intOf(fd.get('camas_total')),
      camas_ocupadas: intOf(fd.get('camas_ocupadas')),
      urgencia: (String(fd.get('urgencia') || 'media') as UrgenciaAcopio),
      direccion: str(fd.get('direccion')),
      responsable: str(fd.get('responsable')),
      telefono: str(fd.get('telefono')),
      horario: str(fd.get('horario')),
      lat: sel.lat, lng: sel.lng,
    };
    const res = editando === 'nuevo'
      ? await supabase.from('puntos_acopio').insert({ ...payload, creado_por: userId })
      : await supabase.from('puntos_acopio').update(payload).eq('id', (editando as PuntoAcopio).id);
    setGuardando(false);
    if (res.error) { setError(res.error.message); return; }
    cerrar();
    cargar();
  }

  async function alternarActivo(c: PuntoAcopio) {
    await createClient().from('puntos_acopio').update({ activo: !c.activo }).eq('id', c.id);
    cargar();
  }
  async function eliminar(c: PuntoAcopio) {
    if (!confirm('¿Eliminar este centro de acopio?')) return;
    const { error } = await createClient().from('puntos_acopio').delete().eq('id', c.id);
    if (error) { alert(error.message); return; }
    cargar();
  }
  async function asignarResp(puntoId: string, perfilId: string) {
    if (!perfilId) return;
    const { error } = await createClient().from('acopio_responsables').insert({ punto_id: puntoId, perfil_id: perfilId, asignado_por: userId });
    if (error) { alert(error.message); return; }
    cargar();
  }
  async function quitarResp(puntoId: string, perfilId: string) {
    const { error } = await createClient().from('acopio_responsables').delete().eq('punto_id', puntoId).eq('perfil_id', perfilId);
    if (error) { alert(error.message); return; }
    cargar();
  }
  async function asignarVol(puntoId: string, perfilId: string) {
    if (!perfilId) return;
    const { error } = await createClient().from('acopio_voluntarios').insert({ punto_id: puntoId, perfil_id: perfilId, asignado_por: userId });
    if (error) { alert(error.message); return; }
    cargar();
  }
  async function quitarVol(puntoId: string, perfilId: string) {
    const { error } = await createClient().from('acopio_voluntarios').delete().eq('punto_id', puntoId).eq('perfil_id', perfilId);
    if (error) { alert(error.message); return; }
    cargar();
  }

  const ed = editando !== null && editando !== 'nuevo' ? editando : null;
  const centrosVisibles = filtroTipo === 'todos' ? centros : centros.filter((c) => (c.tipo ?? 'acopio') === filtroTipo);
  // ¿El usuario LIDERA este centro? (admin, su creador o un responsable). Solo
  // los líderes gestionan; el resto lo ve para coordinarse (contacto del líder).
  const lidero = (c: CentroLider) => esAdmin || c.creado_por === userId || (responsables.get(c.id) ?? []).some((r) => r.perfil_id === userId);

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1>Centros y lugares</h1>
          <p className="muted sub">Centros de acopio, albergues, hospitales y otros lugares. Los que <strong>Digitalización verifica</strong> aparecen aquí para gestionarlos: datos, capacidad de camas, inventario y necesidades — desde el teléfono o con el código QR del centro.</p>
        </div>
        {editando === null && (
          <div className="fila" style={{ gap: 8 }}>
            <a className="btn" href="/acopio/necesidades" style={{ textDecoration: 'none' }}><Icono nombre="avisos" size={16} /> Panel de necesidades</a>
            <button className="btn btn-primario" onClick={() => abrir('nuevo')}><Icono nombre="mas" /> Nuevo centro</button>
          </div>
        )}
      </div>

      {/* Crear/editar en PANEL LATERAL derecho (drawer), no arriba de la lista */}
      {editando !== null && (
        <>
          <button type="button" className="drawer-backdrop" aria-label="Cerrar edición" onClick={cerrar} />
          <aside className="drawer-lateral" role="dialog" aria-modal="true" aria-label={editando === 'nuevo' ? 'Nuevo centro' : 'Editar centro'}>
            <form onSubmit={guardar}>
              <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{ margin: '2px 0' }}>{editando === 'nuevo' ? 'Nuevo centro' : 'Editar centro'}</h2>
                <button type="button" className="btn" onClick={cerrar} style={{ minHeight: 34, padding: '4px 10px' }} aria-label="Cerrar">✕</button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div ref={cont} style={{ height: 280, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--borde)' }} />
                <p className="muted" style={{ fontSize: '.85rem' }}>
                  <Icono nombre="ubicacion" size={14} /> {sel ? `Ubicación: ${sel.lat}, ${sel.lng}` : 'Toca el mapa para marcar la ubicación exacta.'}
                </p>
              </div>
              <div className="campo"><label>Nombre del centro</label><input name="nombre" className="input" required defaultValue={ed?.nombre ?? ''} /></div>
              <div className="campo"><label>Tipo de lugar</label>
                <select name="tipo" className="input" defaultValue={ed?.tipo ?? 'acopio'}>
                  {TIPOS_LUGAR.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_LUGAR[t]}</option>)}
                </select>
              </div>
              {ed && (
                <div className="campo"><label>Urgencia (en el mapa)</label>
                  <select name="urgencia" className="input" defaultValue={ed?.urgencia ?? 'media'}>
                    {URGENCIAS.map((u) => <option key={u} value={u}>{ETIQUETA_URGENCIA[u]}</option>)}
                  </select>
                </div>
              )}
              <div className="campo"><label>Capacidad / aforo</label><input name="capacidad" className="input" placeholder="ej: 200 personas · 60% lleno" defaultValue={ed?.capacidad ?? ''} /></div>
              <div className="grid grid-2">
                <div className="campo"><label>Camas de albergue (total)</label><input name="camas_total" className="input" type="number" min={0} step={1} placeholder="0 si no es albergue" defaultValue={ed?.camas_total ?? 0} /></div>
                <div className="campo"><label>Camas ocupadas</label><input name="camas_ocupadas" className="input" type="number" min={0} step={1} defaultValue={ed?.camas_ocupadas ?? 0} /></div>
              </div>
              <div className="campo"><label>Dirección</label><input name="direccion" className="input" defaultValue={ed?.direccion ?? ''} /></div>
              <div className="grid grid-2">
                <div className="campo"><label>Contacto en el sitio</label><input name="responsable" className="input" placeholder="nombre de quien atiende" defaultValue={ed?.responsable ?? ''} /></div>
                <div className="campo"><label>Teléfono (WhatsApp)</label><EntradaTelefono name="telefono" defaultValue={ed?.telefono ?? ''} /></div>
              </div>
              <div className="campo"><label>Horario</label><input name="horario" className="input" placeholder="8:00–18:00" defaultValue={ed?.horario ?? ''} /></div>
              <button className="btn btn-primario" disabled={guardando} style={{ width: '100%' }}>{guardando ? 'Guardando…' : 'Guardar centro'}</button>
              {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
            </form>
          </aside>
        </>
      )}

      {/* Filtro por tipo */}
      {!cargando && centros.length > 0 && (
        <div className="fila" style={{ gap: 6, flexWrap: 'wrap', margin: '4px 0 12px' }}>
          {(['todos', ...TIPOS_LUGAR] as const).map((t) => {
            const n = t === 'todos' ? centros.length : centros.filter((c) => (c.tipo ?? 'acopio') === t).length;
            const activo = filtroTipo === t;
            return (
              <button key={t} type="button" aria-pressed={activo}
                className={activo ? 'btn btn-primario' : 'btn'} style={{ minHeight: 32, padding: '3px 12px' }}
                onClick={() => setFiltroTipo(t)}>
                {t === 'todos' ? 'Todos' : ETIQUETA_TIPO_LUGAR[t]} · {n}
              </button>
            );
          })}
        </div>
      )}

      {/* Listado */}
      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : centros.length === 0 ? (
        <div className="tarjeta vacio">
          <Icono nombre="acopio" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>Aún no hay centros ni lugares. Crea el primero, o verifica un lugar en Digitalización para que aparezca aquí.</p>
        </div>
      ) : centrosVisibles.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>No hay lugares de este tipo.</p></div>
      ) : (
        <div className="grid grid-2">
          {centrosVisibles.map((c) => (
            <div key={c.id} className="tarjeta" style={{ borderLeft: '5px solid ' + (c.urgencia === 'alta' ? '#CF142B' : c.urgencia === 'baja' ? '#0A7D2C' : '#E6A100'), opacity: c.activo ? 1 : 0.55 }}>
              <div className="fila" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <span className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <strong>{c.nombre}</strong>
                  <Pill tono={TONO_TIPO_LUGAR[c.tipo ?? 'acopio'] ?? 'neutra'} punto={false}>{ETIQUETA_TIPO_LUGAR[c.tipo ?? 'acopio'] ?? c.tipo}</Pill>
                </span>
                <span className="fila" style={{ gap: 6 }}>
                  {(necCount.get(c.id) ?? 0) > 0 && <Pill tono="aviso" punto={false}>{necCount.get(c.id)} necesidades</Pill>}
                  <Pill tono={tonoDeClase(claseUrgencia(c.urgencia))}>{ETIQUETA_URGENCIA[c.urgencia]}</Pill>
                </span>
              </div>
              {c.lugar_id && <div className="muted fila" style={{ fontSize: '.82rem', gap: 6 }}><Icono nombre="ok" size={13} /> Verificado desde Digitalización</div>}
              {c.capacidad && <div className="muted" style={{ fontSize: '.9rem' }}>Capacidad: {c.capacidad}</div>}
              {Number(c.camas_total) > 0 && (() => {
                const total = Number(c.camas_total); const ocup = Math.max(0, Math.min(Number(c.camas_ocupadas), total)); const libres = total - ocup;
                const pct = total > 0 ? Math.round((ocup / total) * 100) : 0;
                const color = pct >= 90 ? '#CF142B' : pct >= 60 ? '#E6A100' : '#0A7D2C';
                return (
                  <div style={{ margin: '4px 0' }}>
                    <div className="fila" style={{ fontSize: '.9rem', gap: 6 }}><span aria-hidden>🛏</span> <span>Albergue: <strong>{ocup}/{total}</strong> camas · {libres} libres · {pct}% ocupado</span></div>
                    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Ocupación del albergue: ${pct}%`}
                      style={{ height: 6, borderRadius: 6, background: 'var(--borde)', overflow: 'hidden', marginTop: 2 }}>
                      <div style={{ width: pct + '%', height: '100%', background: color }} />
                    </div>
                  </div>
                );
              })()}
              {c.direccion && <div className="muted fila" style={{ fontSize: '.9rem', gap: 6 }}><Icono nombre="ubicacion" size={14} /> {c.direccion}</div>}
              {c.creador?.nombre_completo && <div className="muted fila" style={{ fontSize: '.85rem', gap: 6 }}><Icono nombre="usuario" size={14} /> Líder: {nombreMostrado(c.creador.nombre_completo, esAdmin)}{c.creador.telefono ? ' · ' + c.creador.telefono : ''}</div>}
              {(c.responsable || c.telefono) && <div className="muted fila" style={{ fontSize: '.9rem', gap: 6 }}><Icono nombre="usuario" size={14} /> Contacto en sitio: {[c.responsable, c.telefono].filter(Boolean).join(' · ')}</div>}
              {c.horario && <div className="muted fila" style={{ fontSize: '.85rem', gap: 6 }}><Icono nombre="reloj" size={14} /> {c.horario}</div>}

              <div className="acopio-resp">
                <div className="acopio-resp-tit">Coordinadores responsables</div>
                {(responsables.get(c.id) ?? []).length === 0
                  ? <span className="muted" style={{ fontSize: '.88rem' }}>Sin coordinador asignado.</span>
                  : (
                    <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {(responsables.get(c.id) ?? []).map((r) => (
                        <span key={r.perfil_id} className="chip-resp" title={r.rol ? ETIQUETA_ROL[r.rol] : undefined}>
                          <Avatar nombre={r.nombre} url={r.avatar} size={20} /> {r.nombre ?? '—'}
                          {esAdmin && <button type="button" className="chip-x" onClick={() => quitarResp(c.id, r.perfil_id)} aria-label={'Quitar a ' + (r.nombre ?? 'responsable')}>✕</button>}
                        </span>
                      ))}
                    </div>
                  )}
                {esAdmin && (
                  <select className="input" style={{ minHeight: 36, marginTop: 8 }} value=""
                    onChange={(e) => { const v = e.target.value; e.currentTarget.value = ''; asignarResp(c.id, v); }}>
                    <option value="">+ Asignar coordinador responsable…</option>
                    {candidatos
                      .filter((p) => !(responsables.get(c.id) ?? []).some((r) => r.perfil_id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{(p.nombre_completo || p.id) + (p.rol ? ' · ' + ETIQUETA_ROL[p.rol] : '')}</option>
                      ))}
                  </select>
                )}
              </div>

              {(esAdmin || (voluntarios.get(c.id) ?? []).length > 0) && (
                <div className="acopio-resp">
                  <div className="acopio-resp-tit">Voluntarios (solo suman)</div>
                  {(voluntarios.get(c.id) ?? []).length === 0
                    ? <span className="muted" style={{ fontSize: '.88rem' }}>Sin voluntarios asignados.</span>
                    : (
                      <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {(voluntarios.get(c.id) ?? []).map((r) => (
                          <span key={r.perfil_id} className="chip-resp" title={r.rol ? ETIQUETA_ROL[r.rol] : undefined}>
                            <Avatar nombre={r.nombre} url={r.avatar} size={20} /> {r.nombre ?? '—'}
                            {esAdmin && <button type="button" className="chip-x" onClick={() => quitarVol(c.id, r.perfil_id)} aria-label={'Quitar a ' + (r.nombre ?? 'voluntario')}>✕</button>}
                          </span>
                        ))}
                      </div>
                    )}
                  {esAdmin && (
                    <select className="input" style={{ minHeight: 36, marginTop: 8 }} value=""
                      onChange={(e) => { const v = e.target.value; e.currentTarget.value = ''; asignarVol(c.id, v); }}>
                      <option value="">+ Asignar voluntario (solo suma)…</option>
                      {candidatos
                        .filter((p) => !(voluntarios.get(c.id) ?? []).some((r) => r.perfil_id === p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>{(p.nombre_completo || p.id) + (p.rol ? ' · ' + ETIQUETA_ROL[p.rol] : '')}</option>
                        ))}
                    </select>
                  )}
                </div>
              )}

              {lidero(c) ? (
                <div className="fila" style={{ marginTop: 10 }}>
                  <a className="btn btn-primario" href={'/acopio/' + c.id} style={{ minHeight: 34, padding: '4px 12px', textDecoration: 'none' }}><Icono nombre="caja" size={16} /> Inventario</a>
                  <button className="btn" style={{ minHeight: 34, padding: '4px 12px' }} onClick={() => abrir(c)}>Editar</button>
                  <button className="btn" style={{ minHeight: 34, padding: '4px 12px' }} onClick={() => alternarActivo(c)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                  <button className="btn btn-peligro" style={{ minHeight: 34, padding: '4px 12px' }} onClick={() => eliminar(c)}><Icono nombre="basura" size={16} /></button>
                </div>
              ) : (
                <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: '.85rem' }}>
                  <Icono nombre="usuario" size={14} /> Lo gestiona su líder. Usa su contacto para coordinar un envío o una solicitud de traspaso.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function str(v: FormDataEntryValue | null): string | null { const s = String(v ?? '').trim(); return s || null; }
function intOf(v: FormDataEntryValue | null): number { const n = parseInt(String(v ?? '').trim(), 10); return Number.isFinite(n) && n > 0 ? n : 0; }
