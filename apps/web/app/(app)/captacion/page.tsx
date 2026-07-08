import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeCaptacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import { hrefSeguro } from '@/lib/constantes';
import {
  CATEGORIAS_OPORTUNIDAD, ETIQUETA_CATEGORIA_OPORTUNIDAD, TONO_CATEGORIA_OPORTUNIDAD,
  ESTADOS_OPORTUNIDAD, ETIQUETA_ESTADO_OPORTUNIDAD, tonoEstadoOportunidad,
} from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import BotonActualizar from '@/components/BotonActualizar';
import Kpi from '@/components/Kpi';
import FlujoTrabajo from '@/components/FlujoTrabajo';
import Consejo from '@/components/Consejos';
import { cambiarEstadoOportunidad, eliminarOportunidad } from './actions';

const esImagen = (p?: string | null) => !!p && /\.(jpe?g|png|webp|gif|avif)$/i.test(p);

export default async function CaptacionPage({ searchParams }: { searchParams: { cat?: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeCaptacion(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  const cat = (searchParams.cat ?? '').trim();
  const filtro = CATEGORIAS_OPORTUNIDAD.includes(cat as any) ? cat : null;

  let q = supabase.from('oportunidades')
    .select('id, categoria, estado, titulo, contacto, enlace, ubicacion, descripcion, archivo_path, creado_en, actualizado_en')
    .order('actualizado_en', { ascending: false }).limit(400);
  if (filtro) q = q.eq('categoria', filtro);
  const { data } = await q;
  const oportunidades = (data ?? []) as any[];

  // Firmar las miniaturas (bucket privado) en paralelo.
  const urls = new Map<string, string>();
  await Promise.all(oportunidades.filter((o) => o.archivo_path).map(async (o) => {
    const u = await urlFirmada(supabase, 'oportunidades', o.archivo_path, 3600);
    if (u) urls.set(o.id, u);
  }));

  const porEstado = (e: string) => oportunidades.filter((o) => o.estado === e);
  const total = oportunidades.length;
  const cInv = porEstado('investigacion').length;
  const cVer = porEstado('verificado').length;
  const cEnv = porEstado('enviado').length;

  const Tarjeta = ({ o }: { o: any }) => {
    const url = urls.get(o.id);
    const link = hrefSeguro(o.enlace);
    return (
      <div className="tarjeta" style={{ padding: 12 }}>
        <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Pill tono={TONO_CATEGORIA_OPORTUNIDAD[o.categoria as keyof typeof TONO_CATEGORIA_OPORTUNIDAD] ?? 'neutra'} punto={false}>
            {ETIQUETA_CATEGORIA_OPORTUNIDAD[o.categoria as keyof typeof ETIQUETA_CATEGORIA_OPORTUNIDAD] ?? o.categoria}
          </Pill>
          <span className="muted" style={{ fontSize: '.78rem' }}>{fechaHora(o.actualizado_en)}</span>
        </div>
        {url && esImagen(o.archivo_path) && (
          <img src={url} alt="" style={{ width: '100%', maxHeight: 130, objectFit: 'cover', borderRadius: 8, margin: '8px 0', border: '1px solid var(--borde)' }} />
        )}
        <strong style={{ display: 'block', marginTop: 6 }}>{o.titulo}</strong>
        {o.contacto && <div className="muted fila" style={{ gap: 6, fontSize: '.85rem' }}><Icono nombre="usuario" size={13} /> {o.contacto}</div>}
        {o.ubicacion && <div className="muted fila" style={{ gap: 6, fontSize: '.85rem' }}><Icono nombre="ubicacion" size={13} /> {o.ubicacion}</div>}
        {o.descripcion && <p className="muted" style={{ fontSize: '.85rem', margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.descripcion}</p>}
        <div className="fila" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          {link && <a href={link} target="_blank" rel="noreferrer noopener" className="fila" style={{ gap: 4, fontSize: '.82rem' }}><Icono nombre="enlace" size={13} /> Enlace</a>}
          {url && !esImagen(o.archivo_path) && <a href={url} target="_blank" rel="noreferrer noopener" className="fila" style={{ gap: 4, fontSize: '.82rem' }}><Icono nombre="documento" size={13} /> Archivo</a>}
        </div>

        <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10, borderTop: '1px solid var(--borde)', paddingTop: 8 }}>
          {/* Mover de estado (pipeline Investigación → Verificado → Enviado) */}
          {o.estado === 'investigacion' && (
            <form action={cambiarEstadoOportunidad}>
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="estado" value="verificado" />
              <BotonEnviar className="btn btn-sm">Verificar →</BotonEnviar>
            </form>
          )}
          {o.estado === 'verificado' && (
            <>
              <form action={cambiarEstadoOportunidad}>
                <input type="hidden" name="id" value={o.id} /><input type="hidden" name="estado" value="investigacion" />
                <BotonEnviar className="btn btn-sm">← Investigación</BotonEnviar>
              </form>
              <form action={cambiarEstadoOportunidad}>
                <input type="hidden" name="id" value={o.id} /><input type="hidden" name="estado" value="enviado" />
                <BotonEnviar className="btn btn-sm btn-primario">Enviar →</BotonEnviar>
              </form>
            </>
          )}
          {o.estado === 'enviado' && (
            <form action={cambiarEstadoOportunidad}>
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="estado" value="verificado" />
              <BotonEnviar className="btn btn-sm">← Verificado</BotonEnviar>
            </form>
          )}
          <Link className="btn btn-sm" href={'/captacion/' + o.id}>Abrir</Link>
          <form action={eliminarOportunidad}>
            <input type="hidden" name="id" value={o.id} />
            <BotonConfirmar className="btn btn-sm btn-peligro" confirmar="Sí, eliminar"
              mensaje={'¿Eliminar la oportunidad «' + o.titulo + '»? No se puede deshacer.'}>
              <Icono nombre="basura" size={14} />
            </BotonConfirmar>
          </form>
        </div>
      </div>
    );
  };

  return (
    <AnimarEntrada>
      <Consejo id="captacion" titulo="Captación de Oportunidades">
        Registra <strong>fundaciones, organizaciones, empresas, proyectos y alianzas</strong> como tarjetas y llévalas por el flujo <strong>Investigación → Verificado → Enviado</strong>. Cada tarjeta guarda contacto, enlace, ubicación, descripción y un archivo/foto.
      </Consejo>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="enlace" size={24} /> Captación de Oportunidades</h1>
          <p className="muted sub">Contactos estratégicos y oportunidades. {total > 0 && <><strong>{total}</strong> en total.</>}</p>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <BotonActualizar />
          <Link className="btn btn-primario" href="/captacion/nueva"><Icono nombre="mas" /> Nueva oportunidad</Link>
        </div>
      </div>

      {/* Tarjetas de estado (resumen del proceso) */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Total" valor={total} sub={filtro ? ETIQUETA_CATEGORIA_OPORTUNIDAD[filtro as keyof typeof ETIQUETA_CATEGORIA_OPORTUNIDAD] : 'Todas las oportunidades'} color="var(--azul)" icono="enlace" tinte="#eef2ff" />
        <Kpi etiqueta="Investigación" valor={cInv} sub="Recién detectadas" color="#a16207" icono="buscar" tinte="#fef9c3" />
        <Kpi etiqueta="Verificado" valor={cVer} sub="Datos confirmados" color="#16a34a" icono="ok" tinte="#d1fae5" />
        <Kpi etiqueta="Enviado" valor={cEnv} sub="Contactadas / derivadas" color="var(--azul)" icono="cohete" tinte="#eef2ff" />
      </div>

      {/* Flujo del proceso */}
      <p className="muted" style={{ margin: '0 0 6px', fontWeight: 600 }}>El flujo · las tres etapas</p>
      <FlujoTrabajo pasos={[
        { etiqueta: 'Investigación', valor: cInv, icono: 'buscar', color: '#a16207', tinte: '#fef9c3' },
        { etiqueta: 'Verificado', valor: cVer, icono: 'ok', color: '#16a34a', tinte: '#d1fae5' },
        { etiqueta: 'Enviado', valor: cEnv, icono: 'cohete', color: '#0033A0', tinte: '#eef2ff' },
      ]} />

      {/* Filtro por categoría */}
      <div className="fila" style={{ gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <Link href="/captacion" className={!filtro ? 'btn btn-primario' : 'btn'} style={{ minHeight: 32, padding: '3px 12px' }}>Todas</Link>
        {CATEGORIAS_OPORTUNIDAD.map((c) => (
          <Link key={c} href={'/captacion?cat=' + c} className={filtro === c ? 'btn btn-primario' : 'btn'} style={{ minHeight: 32, padding: '3px 12px' }}>
            {ETIQUETA_CATEGORIA_OPORTUNIDAD[c]}
          </Link>
        ))}
      </div>

      {total === 0 ? (
        <EstadoVacio icono="enlace" titulo="Aún no hay oportunidades"
          texto="Crea la primera con «Nueva oportunidad»: una fundación, empresa, proyecto o alianza que quieras investigar." />
      ) : (
        <div className="grid grid-3" style={{ alignItems: 'start' }}>
          {ESTADOS_OPORTUNIDAD.map((e) => {
            const lista = porEstado(e);
            return (
              <div key={e}>
                <h2 className="fila" style={{ gap: 8, fontSize: '1rem' }}>
                  <Pill tono={tonoEstadoOportunidad(e)} punto={false}>{ETIQUETA_ESTADO_OPORTUNIDAD[e]}</Pill>
                  <span className="muted" style={{ fontSize: '.85rem' }}>{lista.length}</span>
                </h2>
                {lista.length === 0
                  ? <p className="muted" style={{ fontSize: '.85rem' }}>Nada aquí.</p>
                  : <div className="fila" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>{lista.map((o) => <Tarjeta key={o.id} o={o} />)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </AnimarEntrada>
  );
}
