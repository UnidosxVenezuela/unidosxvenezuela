import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireUsuario, puedeCaptacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import { hrefSeguro, ETIQUETA_ESTADO_OPORTUNIDAD, ESTADOS_OPORTUNIDAD, tonoEstadoOportunidad, ETIQUETA_CATEGORIA_OPORTUNIDAD } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import CamposOportunidad from '../CamposOportunidad';
import { editarOportunidad, cambiarEstadoOportunidad, eliminarOportunidad } from '../actions';

const esImagen = (p?: string | null) => !!p && /\.(jpe?g|png|webp|gif|avif)$/i.test(p);

export default async function OportunidadPage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeCaptacion(perfil)) redirect('/dashboard');
  const supabase = await createClient();
  const { data: o } = await supabase.from('oportunidades').select('*').eq('id', params.id).maybeSingle();
  if (!o) notFound();
  const oo = o as any;
  const url = oo.archivo_path ? await urlFirmada(supabase, 'oportunidades', oo.archivo_path, 3600) : null;
  const link = hrefSeguro(oo.enlace);

  return (
    <AnimarEntrada>
      <Link href="/captacion" className="muted">← Captación</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>{oo.titulo}
            <Pill tono={tonoEstadoOportunidad(oo.estado)} punto={false}>{ETIQUETA_ESTADO_OPORTUNIDAD[oo.estado as keyof typeof ETIQUETA_ESTADO_OPORTUNIDAD] ?? oo.estado}</Pill>
          </h1>
          <p className="muted sub">{ETIQUETA_CATEGORIA_OPORTUNIDAD[oo.categoria as keyof typeof ETIQUETA_CATEGORIA_OPORTUNIDAD] ?? oo.categoria} · actualizado {fechaHora(oo.actualizado_en)}</p>
        </div>
      </div>

      {/* Clasificación (mover de estado) */}
      <div className="tarjeta">
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Clasificación</h2>
        <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
          {ESTADOS_OPORTUNIDAD.map((e) => (
            e === oo.estado ? (
              <Pill key={e} tono={tonoEstadoOportunidad(e)} punto={false}>{ETIQUETA_ESTADO_OPORTUNIDAD[e]} · actual</Pill>
            ) : (
              <form key={e} action={cambiarEstadoOportunidad}>
                <input type="hidden" name="id" value={oo.id} />
                <input type="hidden" name="estado" value={e} />
                <input type="hidden" name="volver" value={'/captacion/' + oo.id} />
                <BotonEnviar className="btn btn-sm">Mover a {ETIQUETA_ESTADO_OPORTUNIDAD[e]}</BotonEnviar>
              </form>
            )
          ))}
        </div>
      </div>

      {/* Adjunto + enlace */}
      {(url || link) && (
        <div className="tarjeta">
          {url && esImagen(oo.archivo_path) && <img src={url} alt="" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--borde)', marginBottom: 8 }} />}
          <div className="fila" style={{ gap: 14, flexWrap: 'wrap' }}>
            {url && <a href={url} target="_blank" rel="noreferrer noopener" className="fila" style={{ gap: 6 }}><Icono nombre="documento" size={16} /> Ver archivo adjunto</a>}
            {link && <a href={link} target="_blank" rel="noreferrer noopener" className="fila" style={{ gap: 6 }}><Icono nombre="enlace" size={16} /> Abrir enlace</a>}
          </div>
        </div>
      )}

      {/* Editar datos */}
      <form action={editarOportunidad} className="tarjeta">
        <input type="hidden" name="id" value={oo.id} />
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Editar datos</h2>
        <CamposOportunidad o={oo} />
        <div style={{ marginTop: 12 }}>
          <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Guardar cambios</BotonEnviar>
        </div>
      </form>

      {/* Eliminar */}
      <form action={eliminarOportunidad} style={{ marginTop: 12 }}>
        <input type="hidden" name="id" value={oo.id} />
        <BotonConfirmar className="btn btn-peligro" confirmar="Sí, eliminar" mensaje={'¿Eliminar «' + oo.titulo + '»? No se puede deshacer.'}>
          <Icono nombre="basura" size={16} /> Eliminar oportunidad
        </BotonConfirmar>
      </form>
    </AnimarEntrada>
  );
}
