// Buzón de problemas e ideas (0234) — solo administración.
// La RLS ya acota (`sug_select` = admin o autor), pero la ruta también se cierra: una
// pantalla que se abre y sale vacía es peor que una que dice que no es para ti.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import { ESTADO_SUGERENCIA, ESTADOS_SUGERENCIA, TIPO_SUGERENCIA, tonoEstadoSugerencia } from '@/lib/sugerencias';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import EstadoVacio from '@/components/EstadoVacio';
import { atenderSugerencia } from '../../sugerencias/actions';

export const dynamic = 'force-dynamic';

export default async function AdminSugerenciasPage({
  searchParams,
}: { searchParams: { estado?: string; tipo?: string } }) {
  const { perfil } = await requireUsuario();
  if (!esAdministrador(perfil)) redirect('/dashboard');

  const supabase = await createClient();
  let consulta = supabase
    .from('sugerencias')
    .select('id, tipo, mensaje, ruta, autor_sello, estado, nota_admin, atendida_en, creado_en')
    .order('creado_en', { ascending: false })
    .limit(200);
  if (searchParams.estado) consulta = consulta.eq('estado', searchParams.estado);
  if (searchParams.tipo) consulta = consulta.eq('tipo', searchParams.tipo);

  const { data, error } = await consulta;

  if (error) {
    return (
      <div>
        <h1 className="fila" style={{ gap: 8 }}><Icono nombre="buzon" size={24} /> Buzón del equipo</h1>
        <div className="tarjeta">
          <p className="muted" style={{ margin: 0 }}>
            El buzón todavía no está disponible: falta aplicar la migración <code>0234</code>.
          </p>
        </div>
      </div>
    );
  }

  const filas = (data ?? []) as any[];
  const sinLeer = filas.filter((s) => s.estado === 'nueva').length;
  const filtro = (k: 'estado' | 'tipo', v: string) => {
    const sp = new URLSearchParams();
    if (searchParams.estado) sp.set('estado', searchParams.estado);
    if (searchParams.tipo) sp.set('tipo', searchParams.tipo);
    if (sp.get(k) === v) sp.delete(k); else sp.set(k, v);
    return '/admin/sugerencias' + (sp.toString() ? '?' + sp.toString() : '');
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="fila" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 className="fila" style={{ gap: 8, margin: 0 }}>
          <Icono nombre="buzon" size={24} /> Buzón del equipo
        </h1>
        {sinLeer > 0 && <span className="pill pill-aviso">{sinLeer} sin leer</span>}
      </div>
      <p className="muted">
        Lo que el equipo reporta mientras usa la plataforma. Cada reporte llega con la
        página en la que estaba la persona. <strong>Lo que escribas en la nota lo ve quien
        reportó</strong>: es la vuelta del circuito, y es lo que hace que la gente siga
        contando cosas.
      </p>

      <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {(['problema', 'idea'] as const).map((t) => (
          <Link key={t} href={filtro('tipo', t) as any}
            className={'btn' + (searchParams.tipo === t ? ' btn-primario' : '')}
            style={{ minHeight: 32, padding: '2px 12px' }}>
            {TIPO_SUGERENCIA[t]}
          </Link>
        ))}
        {ESTADOS_SUGERENCIA.map((e) => (
          <Link key={e} href={filtro('estado', e) as any}
            className={'btn' + (searchParams.estado === e ? ' btn-primario' : '')}
            style={{ minHeight: 32, padding: '2px 12px' }}>
            {ESTADO_SUGERENCIA[e]}
          </Link>
        ))}
      </div>

      {filas.length === 0 ? (
        <EstadoVacio icono="buzon" titulo="Nada por aquí"
          texto="Cuando alguien reporte un problema o proponga una idea, aparecerá aquí." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filas.map((s) => (
            <article key={s.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span className="fila" style={{ gap: 6 }}>
                  <Icono nombre={s.tipo === 'idea' ? 'cohete' : 'avisos'} size={16} />
                  <strong>{TIPO_SUGERENCIA[s.tipo as 'problema' | 'idea'] ?? s.tipo}</strong>
                  <span className="muted">· {s.autor_sello}</span>
                </span>
                <Pill tono={tonoEstadoSugerencia(s.estado)} punto={false}>
                  {ESTADO_SUGERENCIA[s.estado as keyof typeof ESTADO_SUGERENCIA] ?? s.estado}
                </Pill>
              </div>

              <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{s.mensaje}</p>

              <div className="muted" style={{ fontSize: '.82rem', marginTop: 6 }}>
                {fechaHora(s.creado_en)}
                {s.ruta && <> · <Link href={s.ruta as any}>{s.ruta}</Link></>}
              </div>

              <form action={atenderSugerencia} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={s.id} />
                <div className="campo">
                  <label htmlFor={'nota-' + s.id} className="muted" style={{ fontSize: '.82rem' }}>
                    Respuesta para quien reportó (le llega un aviso)
                  </label>
                  <textarea id={'nota-' + s.id} name="nota" className="input" rows={2}
                    defaultValue={s.nota_admin ?? ''}
                    placeholder="Qué se va a hacer, o por qué no." />
                </div>
                <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <label htmlFor={'estado-' + s.id} className="sr-solo">Estado</label>
                  <select id={'estado-' + s.id} name="estado" className="input"
                    defaultValue={s.estado} style={{ maxWidth: 190 }}>
                    {ESTADOS_SUGERENCIA.map((e) => (
                      <option key={e} value={e}>{ESTADO_SUGERENCIA[e]}</option>
                    ))}
                  </select>
                  <button className="btn btn-primario" type="submit">Guardar</button>
                </div>
              </form>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
