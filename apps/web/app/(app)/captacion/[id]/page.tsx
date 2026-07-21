import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireUsuario, puedeAlianzas, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import { hrefSeguro, ETIQUETA_ESTADO_OPORTUNIDAD, ESTADOS_OPORTUNIDAD, tonoEstadoOportunidad, ETIQUETA_CATEGORIA_OPORTUNIDAD, CAMPOS_VERIF_FICHA } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import { nombreMostrado } from '@/lib/nombre';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import CamposOportunidad from '../CamposOportunidad';
import VerificacionCamposFicha from '../VerificacionCamposFicha';
import { editarOportunidad, cambiarEstadoOportunidad, eliminarOportunidad, crearOfrecimientoDesdeCaptacion } from '../actions';

const esImagen = (p?: string | null) => !!p && /\.(jpe?g|png|webp|gif|avif)$/i.test(p);

// Días transcurridos entre dos fechas (Pendiente → Verificado). null si falta alguna.
function diasEntre(desde?: string | null, hasta?: string | null): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(desde).getTime(), b = new Date(hasta).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

export default async function OportunidadPage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
  const esAdmin = esAdministrador(perfil);
  const supabase = await createClient();
  const { data: o } = await supabase.from('oportunidades').select('*').eq('id', params.id).maybeSingle();
  if (!o) notFound();
  const oo = o as any;
  const url = oo.archivo_path ? await urlFirmada(supabase, 'oportunidades', oo.archivo_path, 3600) : null;
  const link = hrefSeguro(oo.enlace);
  // Puente a Donación-Ofrecimiento (0192): ¿ya se creó un ofrecimiento desde esta
  // entidad? Best-effort — si la migración aún no está aplicada, vuelve vacío.
  const { data: ofr } = await supabase.from('oportunidades_donacion').select('id, numero').eq('captacion_oportunidad_id', params.id).maybeSingle();
  const ofrecimiento = ofr as any;

  // 2ª verificación de la ficha (0199): estados por campo (best-effort; si 0199 no está
  // aplicada vuelve vacío y el panel muestra todo «sin revisar»).
  const { data: vcRaw } = await supabase.from('oportunidad_captacion_verif_campo')
    .select('campo, estado, nota, verificado_por, verificado_en').eq('oportunidad_id', params.id);
  const estadosVerif: Record<string, any> = {};
  ((vcRaw as any[]) ?? []).forEach((r) => { estadosVerif[r.campo] = r; });
  // Nombres de quienes verificaron (para mostrar autoría en el panel).
  const idsVerif = Array.from(new Set([
    ...((vcRaw as any[]) ?? []).map((r) => r.verificado_por).filter(Boolean),
    oo.verificado_por,
  ].filter(Boolean)));
  const nombresVerif = new Map<string, string>();
  if (idsVerif.length) {
    const { data: perfilesData } = await supabase.from('perfiles').select('id, nombre_completo').in('id', idsVerif);
    ((perfilesData as any[]) ?? []).forEach((p) => nombresVerif.set(p.id, nombreMostrado(p.nombre_completo, esAdmin)));
  }

  // ¿La ficha está en uso? (rubro/capacidades/origen prospección o verificación iniciada).
  const fichaEnUso = !!(oo.rubro || oo.capacidades || oo.origen === 'prospeccion' || (vcRaw as any[])?.length);
  const fichaVerificada = CAMPOS_VERIF_FICHA.every((c) => estadosVerif[c.key]?.estado === 'verificado');
  const diasVerif = diasEntre(oo.creado_en, oo.verificado_en);

  return (
    <AnimarEntrada>
      <Link href="/captacion" className="muted">← Captación</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>{oo.titulo}
            <Pill tono={tonoEstadoOportunidad(oo.estado)} punto={false}>{ETIQUETA_ESTADO_OPORTUNIDAD[oo.estado as keyof typeof ETIQUETA_ESTADO_OPORTUNIDAD] ?? oo.estado}</Pill>
          </h1>
          <p className="muted sub">
            {ETIQUETA_CATEGORIA_OPORTUNIDAD[oo.categoria as keyof typeof ETIQUETA_CATEGORIA_OPORTUNIDAD] ?? oo.categoria}
            {oo.rubro ? ' · ' + oo.rubro : ''} · actualizado {fechaHora(oo.actualizado_en)}
          </p>
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
        {/* Tiempo Pendiente → Verificado (sellado por el trigger 0199). */}
        {oo.verificado_en && (
          <p className="muted" style={{ fontSize: '.82rem', margin: '10px 0 0' }}>
            <Icono nombre="reloj" size={13} /> Verificada {diasVerif === 0 ? 'el mismo día' : 'en ' + diasVerif + (diasVerif === 1 ? ' día' : ' días')}
            {oo.verificado_por && nombresVerif.get(oo.verificado_por) ? ' · por ' + nombresVerif.get(oo.verificado_por) : ''}
            {' · ' + fechaHora(oo.verificado_en)}
          </p>
        )}
        {/* Aviso del candado: no se puede enviar a Logística sin completar la 2ª verificación. */}
        {fichaEnUso && !fichaVerificada && (
          <p style={{ marginTop: 10, fontSize: '.85rem', background: 'var(--pill-aviso-bg)', color: 'var(--pill-aviso-fg)', padding: '8px 10px', borderRadius: 8 }}>
            🔒 Completa la <strong>2ª verificación de la ficha</strong> (los {CAMPOS_VERIF_FICHA.length} campos en verde) antes de enviarla a Logística.
          </p>
        )}
      </div>

      {/* 2ª verificación campo por campo de la Ficha (0199) — solo si la ficha está en uso. */}
      {fichaEnUso && (
        <VerificacionCamposFicha oportunidadId={oo.id} estados={estadosVerif}
          volver={'/captacion/' + oo.id} nombres={nombresVerif} puedeVerificar={puedeAlianzas(perfil)} />
      )}

      {/* Puente a Donación-Ofrecimiento (0192): convertir sin re-tipear */}
      <div className="tarjeta">
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>💛 Donación</h2>
        {ofrecimiento ? (
          <div className="fila" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill tono="ok" punto={false}>Ofrecimiento creado</Pill>
            <Link href={'/insumos/oportunidades/' + ofrecimiento.id} className="fila" style={{ gap: 6 }}>
              <Icono nombre="enlace" size={16} /> Ver ofrecimiento{ofrecimiento.numero ? ' OF-' + String(ofrecimiento.numero).padStart(5, '0') : ''} →
            </Link>
          </div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
              Si esta entidad va a <strong>donar</strong>, crea el ofrecimiento sin re-tipear: se copian sus datos y queda enlazado a esta ficha. Logística y Verificación reciben el aviso.
            </p>
            <form action={crearOfrecimientoDesdeCaptacion}>
              <input type="hidden" name="id" value={oo.id} />
              <BotonEnviar className="btn btn-primario"><Icono nombre="corazon" size={16} /> Crear ofrecimiento de donación</BotonEnviar>
            </form>
          </>
        )}
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
