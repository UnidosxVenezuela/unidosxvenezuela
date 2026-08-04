import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireUsuario, puedeAlianzas, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import { nombreMostrado } from '@/lib/nombre';
import { cuerpoFinal, etiquetaVariable } from '@/lib/correo';
import { ETIQUETA_ESTADO_CORREO, claseEstadoCorreo, ETIQUETA_ENTIDAD_CORREO } from '@/lib/constantes';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import Pill, { tonoDeClase } from '@/components/Pill';

export const metadata = { title: 'Correo enviado' };
export const dynamic = 'force-dynamic';

/** Detalle de un envío del registro (0217).
 *  El cuerpo NO está guardado —a propósito: hay correos que llevan contraseñas
 *  temporales— así que se RECONSTRUYE con la plantilla y las variables anotadas. */
export default async function DetalleCorreoPage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  const { data, error } = await supabase.from('correo_envios')
    .select('id, folio, plantilla_id, destinatario_email, destinatario_nombre, entidad, entidad_id, oportunidad_id, proveedor_id, caso_id, asunto, variables, estado, proveedor_mensaje_id, error, enviado_por, enviado_en, creado_en')
    .eq('id', params.id).maybeSingle();
  if (error) {
    // Sin la migración 0217 no hay tabla: se avisa en vez de romper.
    return (
      <AnimarEntrada>
        <Link href="/alianzas/correo" className="muted">← Correo institucional</Link>
        <div className="tarjeta" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}><strong>Aún no disponible.</strong> <span className="muted">Falta aplicar la migración <code>0217_correo_institucional.sql</code>.</span></p>
        </div>
      </AnimarEntrada>
    );
  }
  if (!data) notFound();
  const e = data as any;

  // Plantilla + autor + vínculo, en paralelo (todos opcionales).
  const [plaRes, autorRes, oppRes] = await Promise.all([
    e.plantilla_id
      ? supabase.from('correo_plantillas').select('nombre, clave, cuerpo_html').eq('id', e.plantilla_id).maybeSingle()
      : Promise.resolve({ data: null }),
    e.enviado_por
      ? supabase.from('perfiles').select('nombre_completo').eq('id', e.enviado_por).maybeSingle()
      : Promise.resolve({ data: null }),
    e.oportunidad_id
      ? supabase.from('oportunidades').select('titulo').eq('id', e.oportunidad_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const plantilla = (plaRes as any).data as any;
  const autor = (autorRes as any).data as any;
  const oportunidad = (oppRes as any).data as any;

  const valores: Record<string, string> = {};
  const vars = (e.variables ?? {}) as Record<string, unknown>;
  Object.entries(vars).forEach(([k, v]) => { valores[k] = String(v ?? ''); });
  const cuerpo = plantilla?.cuerpo_html ? cuerpoFinal(plantilla.cuerpo_html, valores) : '';
  const listaVars = Object.keys(valores);

  const Dato = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
    <div>
      <div className="muted" style={{ fontSize: '.78rem' }}>{etiqueta}</div>
      <div>{children}</div>
    </div>
  );

  return (
    <AnimarEntrada>
      <Link href="/alianzas/correo" className="muted">← Correo institucional</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="documento" size={24} /> {e.asunto || 'Correo sin asunto'}</h1>
          <p className="muted sub">Folio <strong>{e.folio}</strong> · registrado {fechaHora(e.creado_en)}</p>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <Pill tono={tonoDeClase(claseEstadoCorreo(e.estado))} punto={false}>
            {ETIQUETA_ESTADO_CORREO[e.estado] ?? e.estado}
          </Pill>
        </div>
      </div>

      {e.estado === 'pendiente' && (
        <div className="tarjeta" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}>
            <strong>Sin resultado anotado.</strong>{' '}
            <span className="muted">El correo se registró pero no llegó a cerrarse con su resultado (la sesión se interrumpió). La constancia del intento se conserva.</span>
          </p>
        </div>
      )}
      {e.error && (
        <div className="tarjeta" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0 }}><strong>Motivo del fallo:</strong> <span className="muted">{e.error}</span></p>
        </div>
      )}

      <div className="tarjeta">
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Dato etiqueta="Destinatario">
            {e.destinatario_nombre ? <div>{e.destinatario_nombre}</div> : null}
            <span className="muted">{e.destinatario_email}</span>
          </Dato>
          <Dato etiqueta="Plantilla">{plantilla?.nombre ?? <span className="muted">—</span>}</Dato>
          <Dato etiqueta="Enviado por">{autor?.nombre_completo ? nombreMostrado(autor.nombre_completo, esAdministrador(perfil)) : <span className="muted">—</span>}</Dato>
          <Dato etiqueta="Fecha de envío">{e.enviado_en ? fechaHora(e.enviado_en) : <span className="muted">—</span>}</Dato>
          <Dato etiqueta="Vínculo">
            {oportunidad?.titulo
              ? <Link href={'/captacion/' + e.oportunidad_id}>{oportunidad.titulo}</Link>
              : e.entidad
                ? <>{ETIQUETA_ENTIDAD_CORREO[e.entidad] ?? e.entidad}{e.entidad_id ? <span className="muted"> · {e.entidad_id}</span> : null}</>
                : <span className="muted">Sin vínculo</span>}
          </Dato>
          <Dato etiqueta="Identificador del proveedor de correo">
            {e.proveedor_mensaje_id ?? <span className="muted">—</span>}
          </Dato>
        </div>
      </div>

      {listaVars.length > 0 && (
        <div className="tarjeta" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Datos con los que se redactó</h2>
          <div className="tabla-scroll"><table>
            <thead><tr><th>Dato</th><th>Valor</th></tr></thead>
            <tbody>
              {listaVars.map((v) => (
                <tr key={v}><td>{etiquetaVariable(v)}</td><td>{valores[v]}</td></tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Cuerpo del correo</h2>
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 0 }}>
          El texto enviado <strong>no se guarda</strong>: se reconstruye con la plantilla y los datos de arriba. Es deliberado — hay correos de la plataforma que llevan contraseñas temporales, y guardarlos sería guardarlas.
        </p>
        {cuerpo
          ? <div style={{ borderTop: '1px solid var(--borde)', paddingTop: 10, fontSize: '.92rem', lineHeight: 1.55 }}
              dangerouslySetInnerHTML={{ __html: cuerpo }} />
          : <p className="muted" style={{ margin: 0 }}>La plantilla original ya no existe: no se puede reconstruir el cuerpo.</p>}
      </div>
    </AnimarEntrada>
  );
}
