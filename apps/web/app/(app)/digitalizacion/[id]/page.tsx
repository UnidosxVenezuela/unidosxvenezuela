import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import { ETIQUETA_TIPO_LUGAR, ETIQUETA_CONDICION, ETIQUETA_ESTADO_LUGAR } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import Pill from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';

export default async function ListadoDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const esDig = rolesDe(perfil).includes('digitalizador');
  if (!esAdmin && !esDig) redirect('/dashboard');
  const supabase = await createClient();
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') redirect('/digitalizacion');
  }

  const { data: listado } = await supabase.from('listados_digitalizados')
    .select('id, tipo_lugar, lugar_nombre, documento_path, lat, lng, notas, creado_en, lugares(estado)')
    .eq('id', params.id).maybeSingle();
  if (!listado) return <div className="tarjeta"><h2>Listado no encontrado</h2><Link href="/digitalizacion">Volver</Link></div>;

  const { data: personasRaw } = await supabase.from('personas_listado')
    .select('id, nombre_completo, cedula, edad, condicion, notas, confianza')
    .eq('listado_id', params.id).order('nombre_completo');
  const personas = (personasRaw ?? []) as any[];
  const menores = personas.filter((p) => p.edad != null && p.edad < 18).length;

  // Dedup: personas de este listado cuya cédula también aparece en OTROS lugares.
  const cedulas = Array.from(new Set(personas.map((p) => (p.cedula || '').replace(/\D/g, '')).filter((c) => c.length >= 4)));
  const dupPorCedula = new Map<string, Set<string>>();
  if (cedulas.length) {
    const { data: dups } = await supabase.from('personas_listado')
      .select('cedula, listado_id, listados_digitalizados(lugar_nombre)')
      .in('cedula', cedulas).neq('listado_id', params.id);
    for (const d of (dups ?? []) as any[]) {
      const c = (d.cedula || '').replace(/\D/g, '');
      const nom = d.listados_digitalizados?.lugar_nombre;
      if (c && nom) { const s = dupPorCedula.get(c) ?? new Set<string>(); s.add(nom); dupPorCedula.set(c, s); }
    }
  }
  const docUrl = (listado as any).documento_path ? await urlFirmada(supabase, 'digitalizacion', (listado as any).documento_path, 600) : null;
  const estadoLugar = (listado as any).lugares?.estado;

  return (
    <AnimarEntrada>
      <Link href="/digitalizacion" className="muted">← Digitalización</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="grupos" size={24} /> {(listado as any).lugar_nombre}</h1>
          <p className="muted sub fila" style={{ gap: 8, flexWrap: 'wrap' }}>
            <BadgeCategoria>{ETIQUETA_TIPO_LUGAR[(listado as any).tipo_lugar] ?? (listado as any).tipo_lugar}</BadgeCategoria>
            <span>{personas.length} personas</span>
            {menores > 0 && <Pill tono="critica" punto={false}>{menores} menor(es)</Pill>}
            {estadoLugar && <Pill tono={estadoLugar === 'verificado' ? 'ok' : 'aviso'} punto={false}>{ETIQUETA_ESTADO_LUGAR[estadoLugar] ?? estadoLugar}</Pill>}
          </p>
        </div>
        {docUrl && <a className="btn" href={docUrl} target="_blank" rel="noopener noreferrer"><Icono nombre="imagen" /> Ver documento</a>}
      </div>

      <div className="tarjeta">
        <div className="tabla-scroll"><table>
          <thead><tr><th>Nombre</th><th>Cédula</th><th>Edad</th><th>Condición</th><th>Notas</th></tr></thead>
          <tbody>
            {personas.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="fila" style={{ gap: 6 }}>{p.nombre_completo}{p.edad != null && p.edad < 18 && <Pill tono="critica" punto={false}>Menor</Pill>}</span>
                  {(() => { const c = (p.cedula || '').replace(/\D/g, ''); const s = c ? dupPorCedula.get(c) : null; return s && s.size ? <div className="muted" style={{ fontSize: '.76rem' }}><Icono nombre="enlace" size={11} /> También aparece en: {[...s].join(', ')}</div> : null; })()}
                </td>
                <td className="muted">{p.cedula || '—'}</td>
                <td className="muted">{p.edad != null ? p.edad : '—'}</td>
                <td>{ETIQUETA_CONDICION[p.condicion] ?? p.condicion}</td>
                <td className="muted">{p.notas || '—'}</td>
              </tr>
            ))}
            {personas.length === 0 && <tr><td colSpan={5} className="muted">Este listado no tiene personas.</td></tr>}
          </tbody>
        </table></div>
      </div>

      <p className="muted" style={{ fontSize: '.82rem' }}>Digitalizado el {fechaHora((listado as any).creado_en)}.{(listado as any).notas ? ' · ' + (listado as any).notas : ''}</p>
    </AnimarEntrada>
  );
}
