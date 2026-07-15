import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import {
  CATEGORIAS_OPORTUNIDAD, ETIQUETA_CATEGORIA_OPORTUNIDAD, TONO_CATEGORIA_OPORTUNIDAD, hrefSeguro,
} from '@/lib/constantes';
import { fechaCorta } from '@/lib/fechas';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import BarraBusqueda from '@/components/BarraBusqueda';

const esImagen = (p?: string | null) => !!p && /\.(jpe?g|png|webp|gif|avif)$/i.test(p);

type SP = { q?: string; cat?: string };

// Referencia de Captación para Logística (0162): las entidades (empresas,
// organizaciones, fundaciones, proyectos, alianzas) que el equipo de Captación ya
// trabajó y marcó como ENVIADAS. Solo lectura: sirve para revisar si alguna puede
// ayudar a completar una solicitud; la gestión vive en /captacion.
export default async function CaptacionReferenciaPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  if (!puedeLogistica(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  const qTexto = (searchParams.q ?? '').trim().slice(0, 120);
  const cat = (searchParams.cat ?? '').trim();
  const fCat = CATEGORIAS_OPORTUNIDAD.includes(cat as any) ? cat : null;
  const hayFiltros = Boolean(qTexto || fCat);

  // La RLS (0162) ya acota a Logística a `estado='enviado'`; se filtra igual aquí
  // para que un admin (que ve todo por la policy de Captación) vea lo mismo.
  let q = supabase.from('oportunidades')
    .select('id, categoria, estado, titulo, contacto, enlace, ubicacion, descripcion, archivo_path, creado_en, actualizado_en')
    .eq('estado', 'enviado')
    .order('actualizado_en', { ascending: false }).limit(400);
  if (fCat) q = q.eq('categoria', fCat);
  if (qTexto) {
    const s = qTexto.replace(/[%,()]/g, ' ');
    q = q.or(`titulo.ilike.%${s}%,contacto.ilike.%${s}%,descripcion.ilike.%${s}%,ubicacion.ilike.%${s}%`);
  }
  const { data } = await q;
  const entidades = (data ?? []) as any[];

  // Firmar miniaturas/archivos del bucket privado (0162 da lectura a Logística).
  const urls = new Map<string, string>();
  await Promise.all(entidades.filter((o) => o.archivo_path).map(async (o) => {
    const u = await urlFirmada(supabase, 'oportunidades', o.archivo_path, 3600);
    if (u) urls.set(o.id, u);
  }));

  return (
    <AnimarEntrada>
      <Link href="/insumos" className="muted">← Logística</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Captación — referencia para Logística</h1>
          <p className="muted sub">
            Empresas, organizaciones, fundaciones, proyectos y alianzas que el equipo de <strong>Captación</strong> ya
            trabajó y <strong>envió</strong>. Revisa si alguna te sirve para <strong>completar una solicitud</strong> y usa su contacto.
          </p>
        </div>
        <div className="fila"><BotonActualizar /></div>
      </div>

      <p className="muted fila" style={{ gap: 6, fontSize: '.88rem', marginTop: 4 }}>
        <Icono nombre="ojo" size={15} /> Vista de <strong>solo lectura</strong>: la gestión y actualización de estas fichas la lleva el equipo de Captación.
      </p>

      {/* Búsqueda + filtro por categoría */}
      <form method="get" className="fila" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12, marginBottom: 0 }}>
        <BarraBusqueda name="q" placeholder="Buscar por nombre, contacto, ubicación o descripción…" defaultValue={qTexto} className="crece" />
        {fCat && <input type="hidden" name="cat" value={fCat} />}
        <button className="btn" type="submit"><Icono nombre="filtro" /> Buscar</button>
        {hayFiltros && <Link className="btn" href="/insumos/captacion">Limpiar</Link>}
      </form>
      <div className="fila" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <span className="muted" style={{ fontSize: '.82rem' }}>Categoría:</span>
        {CATEGORIAS_OPORTUNIDAD.map((c) => {
          const activo = fCat === c;
          const p = new URLSearchParams();
          if (qTexto) p.set('q', qTexto);
          if (!activo) p.set('cat', c);
          return (
            <Link key={c} href={'/insumos/captacion' + (p.toString() ? '?' + p.toString() : '')}
              className={'pill ' + (activo ? 'pill-info' : 'pill-neutra')} style={{ textDecoration: 'none' }}>
              {ETIQUETA_CATEGORIA_OPORTUNIDAD[c]}
            </Link>
          );
        })}
      </div>

      {entidades.length === 0 ? (
        <EstadoVacio
          icono="enlace"
          titulo={hayFiltros ? 'Sin resultados' : 'Aún no hay entidades enviadas'}
          texto={hayFiltros
            ? 'Ninguna entidad enviada por Captación coincide con la búsqueda o el filtro.'
            : 'Cuando el equipo de Captación marque oportunidades como «Enviadas», aparecerán aquí como referencia.'}
        />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12, marginTop: 16 }}>
          {entidades.map((o) => {
            const url = urls.get(o.id);
            const link = hrefSeguro(o.enlace);
            return (
              <div key={o.id} className="tarjeta" style={{ padding: 12 }}>
                <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Pill tono={TONO_CATEGORIA_OPORTUNIDAD[o.categoria as keyof typeof TONO_CATEGORIA_OPORTUNIDAD] ?? 'neutra'} punto={false}>
                    {ETIQUETA_CATEGORIA_OPORTUNIDAD[o.categoria as keyof typeof ETIQUETA_CATEGORIA_OPORTUNIDAD] ?? o.categoria}
                  </Pill>
                  <span className="muted" style={{ fontSize: '.78rem' }}>{fechaCorta(o.actualizado_en)}</span>
                </div>
                {url && esImagen(o.archivo_path) && (
                  <img src={url} alt="" style={{ width: '100%', maxHeight: 130, objectFit: 'cover', borderRadius: 8, margin: '8px 0', border: '1px solid var(--borde)' }} />
                )}
                <strong style={{ display: 'block', marginTop: 6 }}>{o.titulo}</strong>
                {o.contacto && <div className="muted fila" style={{ gap: 6, fontSize: '.85rem', marginTop: 4 }}><Icono nombre="usuario" size={13} /> {o.contacto}</div>}
                {o.ubicacion && <div className="muted fila" style={{ gap: 6, fontSize: '.85rem' }}><Icono nombre="ubicacion" size={13} /> {o.ubicacion}</div>}
                {o.descripcion && <p className="muted" style={{ fontSize: '.85rem', margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.descripcion}</p>}
                <div className="fila" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                  {link && <a href={link} target="_blank" rel="noreferrer noopener" className="fila" style={{ gap: 4, fontSize: '.82rem' }}><Icono nombre="enlace" size={13} /> Enlace</a>}
                  {url && !esImagen(o.archivo_path) && <a href={url} target="_blank" rel="noreferrer noopener" className="fila" style={{ gap: 4, fontSize: '.82rem' }}><Icono nombre="documento" size={13} /> Archivo</a>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AnimarEntrada>
  );
}
