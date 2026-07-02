'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl, {
  type Map as MapLibreMap, type Marker as MapLibreMarker, type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createClient } from '@/lib/supabase/client';
import { ETIQUETA_URGENCIA, URGENCIAS, claseUrgencia, ETIQUETA_ROL } from '@/lib/constantes';
import Icono from './Icono';
import Pill, { tonoDeClase } from './Pill';
import Avatar from './Avatar';
import type { PuntoAcopio, UrgenciaAcopio, Rol } from '@unidos/types';

type Resp = { perfil_id: string; nombre: string | null; avatar: string | null; rol: Rol | null };

const ESTILO: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
const ORDEN: Record<string, number> = { alta: 0, media: 1, baja: 2 };

export default function CentrosAcopio({ userId, esCoord, esAdmin }: { userId: string; esCoord: boolean; esAdmin: boolean }) {
  const [centros, setCentros] = useState<PuntoAcopio[]>([]);
  const [responsables, setResponsables] = useState<Map<string, Resp[]>>(new Map());
  const [voluntarios, setVoluntarios] = useState<Map<string, Resp[]>>(new Map());
  const [necCount, setNecCount] = useState<Map<string, number>>(new Map());
  const [candidatos, setCandidatos] = useState<{ id: string; nombre_completo: string | null; rol: Rol | null }[]>([]);
  const [cargando, setCargando] = useState(true);
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
      supabase.from('puntos_acopio').select('*'),
      supabase.from('acopio_responsables').select('punto_id, perfil_id, perfiles(nombre_completo, avatar_url, rol)'),
      supabase.from('acopio_voluntarios').select('punto_id, perfil_id, perfiles(nombre_completo, avatar_url, rol)'),
      supabase.from('necesidades_acopio').select('punto_id').eq('resuelta', false),
    ]);
    // Necesidades abiertas por centro (vacío si la tabla aún no existe).
    const nmap = new Map<string, number>();
    for (const n of (nec.data ?? []) as any[]) nmap.set(n.punto_id, (nmap.get(n.punto_id) ?? 0) + 1);
    setNecCount(nmap);
    const arr = ((data ?? []) as PuntoAcopio[]).sort((a, b) =>
      ((ORDEN[a.urgencia] ?? 1) - (ORDEN[b.urgencia] ?? 1)) || a.nombre.localeCompare(b.nombre));
    setCentros(arr);
    // Agrupa responsables por centro (vacío si la tabla aún no existe).
    const map = new Map<string, Resp[]>();
    for (const r of (resp.data ?? []) as any[]) {
      const lista = map.get(r.punto_id) ?? [];
      lista.push({ perfil_id: r.perfil_id, nombre: r.perfiles?.nombre_completo ?? null, avatar: r.perfiles?.avatar_url ?? null, rol: r.perfiles?.rol ?? null });
      map.set(r.punto_id, lista);
    }
    setResponsables(map);
    // Agrupa voluntarios por centro (vacío si la tabla aún no existe).
    const vmap = new Map<string, Resp[]>();
    for (const r of (vol.data ?? []) as any[]) {
      const lista = vmap.get(r.punto_id) ?? [];
      lista.push({ perfil_id: r.perfil_id, nombre: r.perfiles?.nombre_completo ?? null, avatar: r.perfiles?.avatar_url ?? null, rol: r.perfiles?.rol ?? null });
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
      capacidad: str(fd.get('capacidad')),
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

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1>Centros de acopio</h1>
          <p className="muted sub">Registra los puntos y su ubicación. Entra a «Inventario» para llevar las existencias y marcar necesidades — desde el teléfono o con el código QR del centro.</p>
        </div>
        {editando === null && (
          <div className="fila" style={{ gap: 8 }}>
            <a className="btn" href="/acopio/necesidades" style={{ textDecoration: 'none' }}><Icono nombre="avisos" size={16} /> Panel de necesidades</a>
            <button className="btn btn-primario" onClick={() => abrir('nuevo')}><Icono nombre="mas" /> Nuevo centro</button>
          </div>
        )}
      </div>

      {/* Formulario crear/editar */}
      {editando !== null && (
        <form onSubmit={guardar} className="tarjeta">
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{editando === 'nuevo' ? 'Nuevo centro' : 'Editar centro'}</h2>
            <button type="button" className="btn" onClick={cerrar} style={{ minHeight: 34, padding: '4px 12px' }}>Cancelar</button>
          </div>
          <div className="mapa-grid" style={{ marginTop: 12 }}>
            <div>
              <div ref={cont} style={{ height: 360, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--borde)' }} />
              <p className="muted" style={{ fontSize: '.85rem' }}>
                <Icono nombre="ubicacion" size={14} /> {sel ? `Ubicación: ${sel.lat}, ${sel.lng}` : 'Toca el mapa para marcar la ubicación exacta.'}
              </p>
            </div>
            <div>
              <div className="campo"><label>Nombre del centro</label><input name="nombre" className="input" required defaultValue={ed?.nombre ?? ''} /></div>
              {ed && (
                <div className="campo"><label>Urgencia (en el mapa)</label>
                  <select name="urgencia" className="input" defaultValue={ed?.urgencia ?? 'media'}>
                    {URGENCIAS.map((u) => <option key={u} value={u}>{ETIQUETA_URGENCIA[u]}</option>)}
                  </select>
                </div>
              )}
              <div className="campo"><label>Capacidad / aforo</label><input name="capacidad" className="input" placeholder="ej: 200 personas · 60% lleno" defaultValue={ed?.capacidad ?? ''} /></div>
              <div className="campo"><label>Dirección</label><input name="direccion" className="input" defaultValue={ed?.direccion ?? ''} /></div>
              <div className="grid grid-2">
                <div className="campo"><label>Contacto en el sitio</label><input name="responsable" className="input" placeholder="nombre de quien atiende" defaultValue={ed?.responsable ?? ''} /></div>
                <div className="campo"><label>Teléfono</label><input name="telefono" className="input" type="tel" defaultValue={ed?.telefono ?? ''} /></div>
              </div>
              <div className="campo"><label>Horario</label><input name="horario" className="input" placeholder="8:00–18:00" defaultValue={ed?.horario ?? ''} /></div>
            </div>
          </div>
          <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar centro'}</button>
          {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
        </form>
      )}

      {/* Listado */}
      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : centros.length === 0 ? (
        <div className="tarjeta vacio">
          <Icono nombre="acopio" size={40} />
          <p className="muted" style={{ marginBottom: 0 }}>Aún no hay centros de acopio. Crea el primero.</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {centros.map((c) => (
            <div key={c.id} className="tarjeta" style={{ borderLeft: '5px solid ' + (c.urgencia === 'alta' ? '#CF142B' : c.urgencia === 'baja' ? '#0A7D2C' : '#E6A100'), opacity: c.activo ? 1 : 0.55 }}>
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <strong>{c.nombre}</strong>
                <span className="fila" style={{ gap: 6 }}>
                  {(necCount.get(c.id) ?? 0) > 0 && <Pill tono="aviso" punto={false}>{necCount.get(c.id)} necesidades</Pill>}
                  <Pill tono={tonoDeClase(claseUrgencia(c.urgencia))}>{ETIQUETA_URGENCIA[c.urgencia]}</Pill>
                </span>
              </div>
              {c.capacidad && <div className="muted" style={{ fontSize: '.9rem' }}>Capacidad: {c.capacidad}</div>}
              {c.direccion && <div className="muted fila" style={{ fontSize: '.9rem', gap: 6 }}><Icono nombre="ubicacion" size={14} /> {c.direccion}</div>}
              {(c.responsable || c.telefono) && <div className="muted fila" style={{ fontSize: '.9rem', gap: 6 }}><Icono nombre="usuario" size={14} /> Contacto: {[c.responsable, c.telefono].filter(Boolean).join(' · ')}</div>}
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

              <div className="fila" style={{ marginTop: 10 }}>
                <a className="btn btn-primario" href={'/acopio/' + c.id} style={{ minHeight: 34, padding: '4px 12px', textDecoration: 'none' }}><Icono nombre="caja" size={16} /> Inventario</a>
                <button className="btn" style={{ minHeight: 34, padding: '4px 12px' }} onClick={() => abrir(c)}>Editar</button>
                {(esCoord || c.creado_por === userId) && (
                  <>
                    <button className="btn" style={{ minHeight: 34, padding: '4px 12px' }} onClick={() => alternarActivo(c)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                    <button className="btn btn-peligro" style={{ minHeight: 34, padding: '4px 12px' }} onClick={() => eliminar(c)}><Icono nombre="basura" size={16} /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function str(v: FormDataEntryValue | null): string | null { const s = String(v ?? '').trim(); return s || null; }
