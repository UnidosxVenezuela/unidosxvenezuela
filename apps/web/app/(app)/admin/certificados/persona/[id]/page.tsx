import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatoHoras } from '@/lib/constantes';
import { fechaCorta } from '@/lib/fechas';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BotonConfirmar from '@/components/BotonConfirmar';
import { ajustarHoras, eliminarAjuste, emitirCertificado } from '../../actions';

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Horas y certificado de UNA persona (0215). Aquí se ve el desglose (automáticas +
 * ajustes), se añade un ajuste con motivo y se emite el certificado con las horas ya
 * revisadas. Las horas automáticas no se editan nunca: son la evidencia (0164).
 */
export default async function PersonaCertificadoPage({ params }: { params: { id: string } }) {
  await requireCoordinacion();
  const supabase = await createClient();
  const id = params.id;

  const [{ data: perfil }, { data: horas }, { data: ajustes }, { data: certs }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo, rol, verificado, creado_en, organizacion').eq('id', id).maybeSingle(),
    supabase.from('registro_horas').select('horas, fecha').eq('perfil_id', id).order('fecha'),
    supabase.from('horas_ajustes').select('id, horas, motivo, fecha, creado_en').eq('perfil_id', id).order('fecha', { ascending: false }),
    supabase.from('certificados').select('id, folio, horas, emitido_en, anulado_en').eq('perfil_id', id).order('emitido_en', { ascending: false }),
  ]);

  if (!perfil) {
    return <div className="tarjeta"><h2>Persona no encontrada</h2><Link href="/admin/certificados">← Certificados</Link></div>;
  }

  const filasH = (horas as any[]) ?? [];
  const filasA = (ajustes as any[]) ?? [];
  const auto = filasH.reduce((s, r) => s + Number(r.horas || 0), 0);
  const ajus = filasA.reduce((s, r) => s + Number(r.horas || 0), 0);
  const total = Math.max(auto + ajus, 0);

  // Período sugerido: desde la primera actividad registrada hasta la última.
  const fechas = [...filasH.map((r) => r.fecha), ...filasA.map((r) => r.fecha)].filter(Boolean).sort();
  const ini = fechas[0] ?? (perfil.creado_en ? String(perfil.creado_en).slice(0, 10) : hoy());
  const fin = fechas[fechas.length - 1] ?? hoy();
  const emitidos = (certs as any[]) ?? [];
  const sinNombre = !String(perfil.nombre_completo ?? '').trim();

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <Link href="/admin/certificados" className="muted">← Certificados</Link>
          <h1 style={{ marginTop: 4 }}>{perfil.nombre_completo || '(sin nombre)'}</h1>
          <p className="muted sub">
            {perfil.organizacion ? perfil.organizacion + ' · ' : ''}
            En la plataforma desde {fechaCorta(perfil.creado_en)}
            {!perfil.verificado && <> · <Pill tono="aviso" punto={false}>sin verificar</Pill></>}
          </p>
        </div>
      </div>

      {/* Desglose */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '14px 0' }}>
        <div className="tarjeta"><div className="muted" style={{ fontSize: '.8rem' }}>Horas automáticas</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{formatoHoras(auto)}</div>
          <div className="muted" style={{ fontSize: '.76rem' }}>contadas por la plataforma</div></div>
        <div className="tarjeta"><div className="muted" style={{ fontSize: '.8rem' }}>Ajustes manuales</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--azul)' }}>{ajus > 0 ? '+' : ''}{formatoHoras(ajus)}</div>
          <div className="muted" style={{ fontSize: '.76rem' }}>{filasA.length} ajuste{filasA.length === 1 ? '' : 's'}</div></div>
        <div className="tarjeta" style={{ borderColor: 'var(--azul)' }}><div className="muted" style={{ fontSize: '.8rem' }}>Total a certificar</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--azul)' }}>{formatoHoras(total)}</div>
          <div className="muted" style={{ fontSize: '.76rem' }}>automáticas + ajustes</div></div>
      </div>

      <div className="grid grid-2" style={{ gap: 14, alignItems: 'start' }}>
        {/* Ajustar horas */}
        <div className="tarjeta">
          <h3 className="aside-titulo"><Icono nombre="reloj" size={16} /> Ajustar horas</h3>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '.84rem' }}>
            Para actividades que <strong>no quedaron registradas</strong> en la plataforma. Suma horas (12) o resta (-3).
            El conteo automático <strong>no se modifica</strong>: el ajuste va aparte y queda con tu nombre y el motivo.
          </p>
          <form action={ajustarHoras}>
            <input type="hidden" name="perfil_id" value={id} />
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="campo"><label htmlFor="aj-horas">Horas</label>
                <input id="aj-horas" name="horas" className="input" required placeholder="12" inputMode="decimal" /></div>
              <div className="campo"><label htmlFor="aj-fecha">Fecha</label>
                <input id="aj-fecha" name="fecha" type="date" className="input" defaultValue={hoy()} /></div>
            </div>
            <div className="campo"><label htmlFor="aj-motivo">Motivo</label>
              <input id="aj-motivo" name="motivo" className="input" required maxLength={300}
                     placeholder="Jornada de acopio del 20/7, sin registrar en la app" /></div>
            <button className="btn btn-primario" type="submit">Añadir ajuste</button>
          </form>

          {filasA.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
              {filasA.map((a) => (
                <div key={a.id} className="fila" style={{ justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--borde)' }}>
                  <div>
                    <strong style={{ color: Number(a.horas) < 0 ? 'var(--rojo)' : 'var(--azul)' }}>
                      {Number(a.horas) > 0 ? '+' : ''}{formatoHoras(a.horas)}
                    </strong>
                    <span className="muted" style={{ fontSize: '.82rem' }}> · {a.motivo}</span>
                    <div className="muted" style={{ fontSize: '.74rem' }}>{fechaCorta(a.fecha)}</div>
                  </div>
                  <form action={eliminarAjuste}>
                    <input type="hidden" name="perfil_id" value={id} />
                    <input type="hidden" name="ajuste_id" value={a.id} />
                    <BotonConfirmar mensaje={'¿Quitar el ajuste de ' + formatoHoras(a.horas) + '? El total volverá a su valor anterior.'}
                      className="btn btn-peligro" style={{ minHeight: 26, padding: '0 8px', fontSize: '.75rem' }}>✕</BotonConfirmar>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Emitir certificado */}
        <div className="tarjeta">
          <h3 className="aside-titulo"><Icono nombre="ok" size={16} /> Emitir certificado</h3>
          {sinNombre ? (
            <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>
              Esta persona <strong>no tiene nombre completo</strong> en su perfil. Complétalo en Administración → Usuarios
              antes de emitir: el nombre queda impreso en el certificado.
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '.84rem' }}>
                Las horas y el nombre <strong>se congelan</strong> al emitir: si después cambian, el certificado ya entregado no se altera.
              </p>
              <form action={emitirCertificado}>
                <input type="hidden" name="perfil_id" value={id} />
                <div className="campo"><label htmlFor="ce-horas">Horas a certificar</label>
                  <input id="ce-horas" name="horas" className="input" defaultValue={String(total).replace('.', ',')} inputMode="decimal" />
                  <span className="muted" style={{ fontSize: '.78rem' }}>Viene del total calculado; puedes corregirlo aquí si hace falta.</span></div>
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <div className="campo"><label htmlFor="ce-ini">Desde</label>
                    <input id="ce-ini" name="inicio" type="date" className="input" defaultValue={ini} /></div>
                  <div className="campo"><label htmlFor="ce-fin">Hasta</label>
                    <input id="ce-fin" name="fin" type="date" className="input" defaultValue={fin} /></div>
                </div>
                <button className="btn btn-primario" type="submit"><Icono nombre="documento" size={15} /> Emitir e imprimir</button>
              </form>
            </>
          )}

          {emitidos.length > 0 && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--borde)', paddingTop: 10 }}>
              <div className="muted" style={{ fontSize: '.8rem', marginBottom: 6 }}>Ya emitidos</div>
              {emitidos.map((c) => (
                <div key={c.id} className="fila" style={{ justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
                  <span style={{ fontSize: '.82rem' }}>
                    <span className="muted">{c.folio}</span> · {formatoHoras(c.horas)} · {fechaCorta(c.emitido_en)}
                    {c.anulado_en && <> <Pill tono="critica" punto={false}>Anulado</Pill></>}
                  </span>
                  <Link className="btn btn-sm" href={'/admin/certificados/' + c.id + '/imprimir'}>Ver</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AnimarEntrada>
  );
}
