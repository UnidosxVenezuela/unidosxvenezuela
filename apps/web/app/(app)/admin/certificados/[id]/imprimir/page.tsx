import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import BotonImprimir from '@/components/BotonImprimir';
import Pill from '@/components/Pill';
import { anularCertificado } from '../../actions';
import BotonConfirmar from '@/components/BotonConfirmar';

// El logotipo se sirve desde /public/marca. Si está el archivo OFICIAL (png o svg) se usa
// ese; si no, el emblema vectorial de respaldo. Así se sustituye dejando el fichero, sin
// tocar código.
function logoMarca(): string {
  const dir = path.join(process.cwd(), 'public', 'marca');
  for (const f of ['apoyo-por-venezuela.png', 'apoyo-por-venezuela.svg', 'logo-apoyo.png']) {
    try { if (fs.existsSync(path.join(dir, f))) return '/marca/' + f; } catch { /* fs no disponible */ }
  }
  return '/marca/corazon-apoyo.svg';
}

/** «128,5 horas» / «1 hora» — el texto del certificado va con la palabra completa,
 *  no con la abreviatura «h» que usa el resto de la app. */
function horasTexto(h: number | string | null | undefined): string {
  const n = Number(h ?? 0);
  const t = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return t + (n === 1 ? ' hora' : ' horas');
}

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function enLetras(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} de ${MES[d.getMonth()]} de ${d.getFullYear()}`;
}
/** «12 de junio – 31 de julio de 2026»: no repite el año si es el mismo. */
function periodo(a?: string | null, b?: string | null): string {
  if (!a || !b) return enLetras(a) !== '—' ? enLetras(a) : enLetras(b);
  const da = new Date(String(a).slice(0, 10) + 'T00:00:00');
  const db = new Date(String(b).slice(0, 10) + 'T00:00:00');
  if (da.getFullYear() === db.getFullYear()) {
    return `${da.getDate()} de ${MES[da.getMonth()]} – ${db.getDate()} de ${MES[db.getMonth()]} de ${db.getFullYear()}`;
  }
  return `${enLetras(a)} – ${enLetras(b)}`;
}

/** Certificado de reconocimiento (0215), listo para imprimir o guardar en PDF
 *  (A4 horizontal). Lo ve la administración y la propia persona (RLS de `certificados`). */
export default async function CertificadoImprimirPage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  const supabase = await createClient();

  const { data: cert } = await supabase.from('certificados')
    .select('id, folio, nombre, horas, periodo_inicio, periodo_fin, emitido_en, anulado_en, motivo_anulacion')
    .eq('id', params.id).maybeSingle();

  if (!cert) {
    return (
      <div className="tarjeta">
        <h2>Certificado no encontrado</h2>
        <p className="muted">Puede que se haya eliminado o que no tengas acceso a él.</p>
        <Link href="/admin/certificados">← Certificados</Link>
      </div>
    );
  }
  const c = cert as any;
  const admin = esCoordinacion(perfil);
  const logo = logoMarca();

  return (
    <div>
      <div className="pagina-cab no-print">
        <Link href="/admin/certificados" className="muted">← Certificados</Link>
        <div className="fila" style={{ gap: 8 }}>
          {c.anulado_en && <Pill tono="critica" punto={false}>Anulado</Pill>}
          <BotonImprimir label="Imprimir o guardar en PDF" />
        </div>
      </div>

      {admin && !c.anulado_en && (
        <form action={anularCertificado} className="tarjeta no-print" style={{ marginBottom: 12, padding: 12 }}>
          <input type="hidden" name="certificado_id" value={c.id} />
          <input type="hidden" name="volver" value={'/admin/certificados/' + c.id + '/imprimir'} />
          <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="campo crece" style={{ marginBottom: 0 }}>
              <label htmlFor="an-motivo">¿Se emitió por error?</label>
              <input id="an-motivo" name="motivo" className="input" maxLength={300} placeholder="Motivo de la anulación…" />
            </div>
            <BotonConfirmar mensaje="¿Anular este certificado? Quedará marcado como anulado, con su motivo." className="btn btn-peligro">
              Anular
            </BotonConfirmar>
          </div>
        </form>
      )}

      {/* ── El certificado ── */}
      <div className="cert-hoja">
        <div className="cert-marco" />
        <div className="cert-tri"><i /><i /><i /><i /></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cert-agua" src={logo} alt="" />

        <div className="cert-cont">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cert-logo" src={logo} alt="Apoyo por Venezuela" />
          <h1 className="cert-titulo">CERTIFICADO DE RECONOCIMIENTO</h1>
          <div className="cert-filete" />
          <div className="cert-otorga">Apoyo por Venezuela otorga el presente certificado a:</div>
          <div className="cert-nombre">{c.nombre}</div>
          <div className="cert-ln" />

          <p className="cert-p">
            En reconocimiento por su compromiso, dedicación y espíritu de servicio como voluntario(a),
            contribuyendo con <b>{horasTexto(c.horas)}</b> de labor voluntaria en favor de nuestra misión humanitaria.
          </p>
          <p className="cert-p">
            Su tiempo, esfuerzo y entrega han sido fundamentales para fortalecer una red de apoyo construida
            desde la solidaridad, el trabajo en equipo y el compromiso con quienes más lo necesitan.
          </p>
          <p className="cert-p">
            Agradecemos profundamente su disposición para servir, su responsabilidad y la confianza depositada
            en este proyecto. Su labor demuestra que cada acción, por pequeña que parezca, tiene el poder de
            generar un impacto real.
          </p>
          <p className="cert-p">
            Gracias por ser parte de Apoyo por Venezuela y por transformar el tiempo en esperanza.
          </p>

          <div className="cert-datos">
            <span><em>Horas de voluntariado certificadas</em><b>{horasTexto(c.horas)}</b></span>
            <span><em>Período</em><b>{periodo(c.periodo_inicio, c.periodo_fin)}</b></span>
            <span><em>Fecha de emisión</em><b>{enLetras(c.emitido_en)}</b></span>
          </div>
        </div>

        <div className="cert-abajo">
          <div className="cert-lema"><u>APOYO POR VENEZUELA</u>«Juntos hacemos posible la esperanza.»</div>
          <div className="cert-sello"><b>APOYO POR</b><b>VENEZUELA</b><i>Certificado oficial</i></div>
          <div className="cert-folio">Folio {c.folio}<br />apoyoporvenezuela.org/certificados</div>
        </div>

        {c.anulado_en && <div className="cert-anulado">ANULADO</div>}
      </div>

      {c.anulado_en && (
        <p className="muted no-print" style={{ marginTop: 10, fontSize: '.84rem' }}>
          Anulado el {enLetras(c.anulado_en)}{c.motivo_anulacion ? ' · ' + c.motivo_anulacion : ''}.
        </p>
      )}
    </div>
  );
}
