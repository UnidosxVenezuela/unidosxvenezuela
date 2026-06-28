import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SENSIBILIDADES, ETIQUETA_SENSIBILIDAD, claseSensibilidad } from '@/lib/constantes';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import { crearPublicacion, comentarPublicacion } from './actions';

export default async function TablonPage({ searchParams }: { searchParams: { grupo?: string } }) {
  await requireUsuario();
  const supabase = await createClient();

  const { data: grupos } = await supabase.from('grupos').select('id, nombre').order('nombre');

  let q = supabase.from('publicaciones').select(
    `id, contenido, sensibilidad, creado_en, grupo_id,
     autor:perfiles ( nombre_completo ),
     grupos ( nombre ),
     comentarios_publicacion ( id, contenido, creado_en, autor:perfiles ( nombre_completo ) )`
  ).order('creado_en', { ascending: false })
   .order('creado_en', { foreignTable: 'comentarios_publicacion', ascending: true })
   .limit(50);

  if (searchParams.grupo === 'general') q = q.is('grupo_id', null);
  else if (searchParams.grupo) q = q.eq('grupo_id', searchParams.grupo);

  const { data } = await q;
  const posts = (data ?? []) as any[];

  return (
    <div>
      <RealtimeRefrescar tabla="publicaciones" />
      <RealtimeRefrescar tabla="comentarios_publicacion" />
      <h1>Tablón</h1>

      <form action={crearPublicacion} className="tarjeta">
        <div className="campo">
          <label htmlFor="contenido">Nueva publicación</label>
          <textarea id="contenido" name="contenido" className="input" placeholder="Comparte un aviso, opinión o necesidad…" required />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="sensibilidad">Sensibilidad</label>
            <select id="sensibilidad" name="sensibilidad" className="input" defaultValue="interna">
              {SENSIBILIDADES.map((s) => <option key={s} value={s}>{ETIQUETA_SENSIBILIDAD[s]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="grupo_id">Grupo (vacío = general)</label>
            <select id="grupo_id" name="grupo_id" className="input" defaultValue="">
              <option value="">General</option>
              {(grupos ?? []).map((g: any) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-primario" type="submit">Publicar</button>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: 0 }}>
          La sensibilidad controla quién puede ver la publicación.
        </p>
      </form>

      <form method="get" className="fila" style={{ margin: '12px 0' }}>
        <select name="grupo" className="input" defaultValue={searchParams.grupo ?? ''} style={{ width: 'auto' }}>
          <option value="">Todas</option>
          <option value="general">Solo general</option>
          {(grupos ?? []).map((g: any) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
        <button className="btn" type="submit">Filtrar</button>
      </form>

      {posts.length === 0 && (
        <div className="tarjeta vacio"><p className="muted">Aún no hay publicaciones. Sé el primero en compartir un aviso.</p></div>
      )}

      {posts.map((p) => (
        <div key={p.id} className="tarjeta">
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <strong>{p.autor?.nombre_completo ?? 'Anónimo'}</strong>
            <span className={'insignia ' + claseSensibilidad(p.sensibilidad)}>
              {ETIQUETA_SENSIBILIDAD[p.sensibilidad as keyof typeof ETIQUETA_SENSIBILIDAD]}
            </span>
          </div>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            {p.grupos?.nombre ? 'Grupo: ' + p.grupos.nombre : 'General'} · {new Date(p.creado_en).toLocaleString('es-VE')}
          </div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.contenido}</p>

          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>
              Comentarios ({(p.comentarios_publicacion ?? []).length})
            </summary>
            <div style={{ marginTop: 8 }}>
              {(p.comentarios_publicacion ?? []).map((c: any) => (
                <div key={c.id} style={{ borderTop: '1px solid var(--borde)', padding: '6px 0' }}>
                  <div className="muted" style={{ fontSize: '.8rem' }}>
                    {c.autor?.nombre_completo ?? 'Anónimo'} · {new Date(c.creado_en).toLocaleString('es-VE')}
                  </div>
                  <div>{c.contenido}</div>
                </div>
              ))}
              <form action={comentarPublicacion} className="fila" style={{ marginTop: 8 }}>
                <input type="hidden" name="publicacion_id" value={p.id} />
                <input name="contenido" className="input" placeholder="Comentar…" required style={{ maxWidth: 420 }} />
                <button className="btn" type="submit">Enviar</button>
              </form>
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
