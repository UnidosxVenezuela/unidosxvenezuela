import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatoHoras } from '@/lib/constantes';
import { fechaCorta } from '@/lib/fechas';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import Consejo from '@/components/Consejos';
import BarraBusqueda from '@/components/BarraBusqueda';

/**
 * Certificados de voluntariado (0215) — panel de administración.
 * Lista a las personas con sus horas (automáticas + ajustes) para emitirles el
 * certificado, y muestra los ya emitidos. Las horas automáticas nunca se editan
 * (0164): lo que se ajusta son los AJUSTES, que suman aparte y con motivo.
 */
export default async function CertificadosPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireCoordinacion();
  const supabase = await createClient();
  const q = (searchParams.q ?? '').trim().toLowerCase();

  // La administración sí lee todas las horas (policy de 0011: propia o coordinación) y
  // todos los ajustes (0215). Se suman en memoria para no hacer una consulta por persona.
  const [{ data: perfiles }, { data: horas }, { data: ajustes }, { data: emitidos }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo, rol, verificado, creado_en').order('nombre_completo'),
    supabase.from('registro_horas').select('perfil_id, horas'),
    supabase.from('horas_ajustes').select('perfil_id, horas'),
    supabase.from('certificados')
      .select('id, folio, nombre, horas, periodo_inicio, periodo_fin, emitido_en, anulado_en')
      .order('emitido_en', { ascending: false }).limit(50),
  ]);

  const suma = (filas: any[] | null) => {
    const m = new Map<string, number>();
    for (const f of (filas ?? [])) m.set(f.perfil_id, (m.get(f.perfil_id) ?? 0) + Number(f.horas || 0));
    return m;
  };
  const auto = suma(horas as any[]);
  const ajus = suma(ajustes as any[]);

  let gente = ((perfiles as any[]) ?? []).map((p) => {
    const a = auto.get(p.id) ?? 0, j = ajus.get(p.id) ?? 0;
    return { ...p, auto: a, ajus: j, total: Math.max(a + j, 0) };
  });
  if (q) gente = gente.filter((p) => String(p.nombre_completo ?? '').toLowerCase().includes(q));
  // Primero quien tiene horas: son las candidatas naturales a un certificado.
  gente.sort((a, b) => b.total - a.total || String(a.nombre_completo).localeCompare(String(b.nombre_completo)));

  const certs = (emitidos as any[]) ?? [];
  const conHoras = gente.filter((p) => p.total > 0).length;

  return (
    <AnimarEntrada>
      <Consejo id="certificados" titulo="Certificados de voluntariado">
        Emite el <strong>certificado de reconocimiento</strong> de cada persona con sus <strong>horas</strong>. Las horas se cuentan <strong>solas</strong> mientras usan la plataforma; si hubo actividades fuera (jornadas, acopio en calle…), <strong>añade un ajuste con su motivo</strong> — el registro automático no se toca y todo queda trazado.
      </Consejo>

      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="ok" size={22} /> Certificados de voluntariado</h1>
          <p className="muted sub">{conHoras} persona{conHoras === 1 ? '' : 's'} con horas registradas · {certs.length} certificado{certs.length === 1 ? '' : 's'} emitido{certs.length === 1 ? '' : 's'}</p>
        </div>
        <Link href="/admin/usuarios" className="btn">← Usuarios</Link>
      </div>

      <form method="get" className="toolbar" style={{ marginTop: 12 }}>
        <BarraBusqueda name="q" placeholder="Buscar persona por nombre…" defaultValue={searchParams.q ?? ''} className="crece" />
        <button className="btn" type="submit"><Icono nombre="buscar" size={16} /> Buscar</button>
      </form>

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <div className="tabla-scroll"><table>
          <thead><tr>
            <th>Persona</th><th>Automáticas</th><th>Ajustes</th><th>Total</th><th></th>
          </tr></thead>
          <tbody>
            {gente.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ padding: 14 }}>No hay personas que coincidan.</td></tr>
            )}
            {gente.slice(0, 300).map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.nombre_completo || <span className="muted">(sin nombre)</span>}</strong>
                  {!p.verificado && <> <Pill tono="aviso" punto={false}>sin verificar</Pill></>}
                </td>
                <td className="muted">{formatoHoras(p.auto)}</td>
                <td style={{ color: p.ajus ? 'var(--azul)' : undefined }}>
                  {p.ajus ? (p.ajus > 0 ? '+' : '') + formatoHoras(p.ajus) : '—'}
                </td>
                <td><strong>{formatoHoras(p.total)}</strong></td>
                <td style={{ textAlign: 'right' }}>
                  <Link className="btn btn-sm" href={'/admin/certificados/persona/' + p.id}>Horas y certificado</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {gente.length > 300 && <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>Se muestran las primeras 300; usa el buscador para acotar.</p>}
      </div>

      <h2 style={{ marginTop: 22, fontSize: '1.05rem' }}>Certificados emitidos</h2>
      {certs.length === 0 ? (
        <div className="tarjeta"><p className="muted" style={{ margin: 0 }}>Todavía no se ha emitido ninguno.</p></div>
      ) : (
        <div className="tarjeta">
          <div className="tabla-scroll"><table>
            <thead><tr><th>Folio</th><th>Persona</th><th>Horas</th><th>Emitido</th><th></th></tr></thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id} style={c.anulado_en ? { opacity: .55 } : undefined}>
                  <td className="muted" style={{ fontSize: '.82rem' }}>{c.folio}</td>
                  <td>{c.nombre}{c.anulado_en && <> <Pill tono="critica" punto={false}>Anulado</Pill></>}</td>
                  <td>{formatoHoras(c.horas)}</td>
                  <td className="muted" style={{ fontSize: '.82rem' }}>{fechaCorta(c.emitido_en)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="btn btn-sm" href={'/admin/certificados/' + c.id + '/imprimir'}>Ver / imprimir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </AnimarEntrada>
  );
}
