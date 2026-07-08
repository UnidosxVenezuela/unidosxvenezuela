import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminDigitalizacion, esVerificadorDigitalizacion, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import { ETIQUETA_TIPO_LUGAR, ETIQUETA_CONDICION, ETIQUETA_ESTADO_LUGAR, ETIQUETA_ESTADO_LISTADO, tonoEstadoListado, CONDICIONES_PERSONA } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import Pill from '@/components/Pill';
import BadgeCategoria from '@/components/BadgeCategoria';
import BotonConfirmar from '@/components/BotonConfirmar';
import { verificarListado, editarPersonaListado, eliminarPersonaListado } from '../actions';

export default async function ListadoDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const roles = rolesDe(perfil);
  const esDig = roles.includes('digitalizador');
  const supervisa = esAdminDigitalizacion(perfil);   // admin del área (0124)
  const esVerif = esVerificadorDigitalizacion(perfil); // revisor (0125)
  if (!esAdmin && !esDig && !supervisa && !esVerif) redirect('/dashboard');
  const supabase = await createClient();
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') redirect('/digitalizacion');
  }

  const { data: listado } = await supabase.from('listados_digitalizados')
    .select('id, tipo_lugar, lugar_nombre, documento_path, lat, lng, notas, creado_en, creado_por, estado, verificado_en, nota_verificacion, lugares(estado)')
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

  const id = params.id;
  const estado = (listado as any).estado as string | undefined;
  const enRevision = estado === 'por_verificar' || estado === 'observado';
  const esCreador = (listado as any).creado_por === user!.id;
  const puedeRevisar = esAdmin || esVerif || supervisa;
  // El admin general puede verificar su propia captura; nadie más (separación de tareas).
  const bloqueoAuto = !esAdmin && esCreador;
  const puedeVerificar = puedeRevisar && enRevision && !bloqueoAuto;
  // Corregir la información: el revisor y el digitalizador mientras esté en revisión.
  const puedeEditar = enRevision && (esAdmin || esVerif || supervisa || esDig);

  return (
    <AnimarEntrada>
      <Link href="/digitalizacion" className="muted">← Digitalización</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="grupos" size={24} /> {(listado as any).lugar_nombre}</h1>
          <p className="muted sub fila" style={{ gap: 8, flexWrap: 'wrap' }}>
            <BadgeCategoria>{ETIQUETA_TIPO_LUGAR[(listado as any).tipo_lugar] ?? (listado as any).tipo_lugar}</BadgeCategoria>
            <span>{personas.length} personas</span>
            {estado && <Pill tono={tonoEstadoListado(estado)} punto={false}>{ETIQUETA_ESTADO_LISTADO[estado as keyof typeof ETIQUETA_ESTADO_LISTADO] ?? estado}</Pill>}
            {menores > 0 && <Pill tono="critica" punto={false}>{menores} menor(es)</Pill>}
            {estadoLugar && <Pill tono={estadoLugar === 'verificado' ? 'ok' : 'aviso'} punto={false}>{ETIQUETA_ESTADO_LUGAR[estadoLugar] ?? estadoLugar}</Pill>}
          </p>
        </div>
        {docUrl && <a className="btn" href={docUrl} target="_blank" rel="noopener noreferrer"><Icono nombre="imagen" /> Ver documento</a>}
      </div>

      {/* Estado de la revisión + observaciones previas */}
      {estado === 'verificado' && (listado as any).verificado_en && (
        <p className="fila muted" style={{ gap: 6, fontSize: '.85rem' }}>
          <Icono nombre="ok" size={15} /> Verificado el {fechaHora((listado as any).verificado_en)}. Ya cruza con desaparecidos.
        </p>
      )}
      {estado === 'observado' && (
        <div className="tarjeta" style={{ borderColor: 'var(--critica, #dc2626)' }}>
          <strong className="fila" style={{ gap: 6 }}><Icono nombre="ojo" size={16} /> Con observaciones</strong>
          {(listado as any).nota_verificacion && <p className="muted" style={{ marginBottom: 0 }}>{(listado as any).nota_verificacion}</p>}
          <p className="muted" style={{ marginBottom: 0, fontSize: '.85rem' }}>Corrige lo señalado y vuelve a verificar. El cruce con desaparecidos sigue en pausa.</p>
        </div>
      )}

      {/* Panel de revisión: foto original al lado de la tabla para cotejar */}
      {puedeRevisar && enRevision && docUrl && (
        <div className="tarjeta">
          <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre="imagen" size={18} /> Documento original</h2>
          <p className="muted" style={{ fontSize: '.85rem' }}>Compara cada fila con la foto. Corrige lo que el OCR haya leído mal antes de verificar.</p>
          <a href={docUrl} target="_blank" rel="noopener noreferrer">
            <img src={docUrl} alt="Documento digitalizado" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--borde, #e5e7eb)' }} />
          </a>
        </div>
      )}

      <div className="tarjeta">
        <div className="tabla-scroll"><table>
          <thead><tr><th>Nombre</th><th>Cédula</th><th>Edad</th><th>Condición</th><th>Notas</th>{puedeEditar && <th>Revisión</th>}</tr></thead>
          <tbody>
            {personas.map((p) => {
              const conf = p.confianza != null ? Number(p.confianza) : null;
              const dudoso = conf != null && conf < 70;
              return (
              <tr key={p.id}>
                <td>
                  <span className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>{p.nombre_completo}
                    {p.edad != null && p.edad < 18 && <Pill tono="critica" punto={false}>Menor</Pill>}
                    {dudoso && <Pill tono="aviso" punto={false}>OCR dudoso</Pill>}
                  </span>
                  {(() => { const c = (p.cedula || '').replace(/\D/g, ''); const s = c ? dupPorCedula.get(c) : null; return s && s.size ? <div className="muted" style={{ fontSize: '.76rem' }}><Icono nombre="enlace" size={11} /> También aparece en: {[...s].join(', ')}</div> : null; })()}
                </td>
                <td className="muted">{p.cedula || '—'}</td>
                <td className="muted">{p.edad != null ? p.edad : '—'}</td>
                <td>{ETIQUETA_CONDICION[p.condicion] ?? p.condicion}</td>
                <td className="muted">{p.notas || '—'}</td>
                {puedeEditar && (
                  <td>
                    <details>
                      <summary className="btn btn-sm">Corregir</summary>
                      <form action={editarPersonaListado} className="grid" style={{ gap: 6, marginTop: 8, minWidth: 220 }}>
                        <input type="hidden" name="persona_id" value={p.id} />
                        <input type="hidden" name="listado_id" value={id} />
                        <input name="nombre_completo" defaultValue={p.nombre_completo} placeholder="Nombre completo" required />
                        <div className="fila" style={{ gap: 6 }}>
                          <input name="cedula" defaultValue={p.cedula ?? ''} placeholder="Cédula" inputMode="numeric" />
                          <input name="edad" defaultValue={p.edad ?? ''} placeholder="Edad" inputMode="numeric" style={{ width: 84 }} />
                        </div>
                        <select name="condicion" defaultValue={p.condicion}>
                          {CONDICIONES_PERSONA.map((c) => <option key={c} value={c}>{ETIQUETA_CONDICION[c]}</option>)}
                        </select>
                        <input name="notas" defaultValue={p.notas ?? ''} placeholder="Notas" />
                        <div className="fila" style={{ gap: 6, justifyContent: 'space-between' }}>
                          <button type="submit" className="btn btn-primario btn-sm"><Icono nombre="ok" size={14} /> Guardar</button>
                          <BotonConfirmar mensaje={'¿Eliminar a «' + p.nombre_completo + '» de este listado? Esta fila se borra por completo.'} className="btn btn-sm btn-peligro" formAction={eliminarPersonaListado}><Icono nombre="basura" size={14} /> Eliminar fila</BotonConfirmar>
                        </div>
                      </form>
                    </details>
                  </td>
                )}
              </tr>
            );})}
            {personas.length === 0 && <tr><td colSpan={puedeEditar ? 6 : 5} className="muted">Este listado no tiene personas.</td></tr>}
          </tbody>
        </table></div>
      </div>

      {/* Acciones de revisión: verificar (activa el cruce) u observar (devuelve con nota) */}
      {puedeVerificar && (
        <div className="tarjeta" style={{ borderColor: 'var(--aviso, #d97706)' }}>
          <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre="ok" size={18} /> Revisión</h2>
          <p className="muted" style={{ fontSize: '.9rem' }}>
            Cuando <strong>verifiques</strong>, se activa el cruce con desaparecidos para estas personas. Si algo no cuadra, corrígelo arriba o devuélvelo <strong>con observaciones</strong>.
          </p>
          <form action={verificarListado} className="grid" style={{ gap: 8, maxWidth: 520 }}>
            <input type="hidden" name="listado_id" value={id} />
            <label>
              <span className="muted" style={{ fontSize: '.8rem' }}>Nota de revisión (obligatoria si hay observaciones)</span>
              <input name="nota" placeholder="Ej.: 2 cédulas ilegibles; corregí un nombre." />
            </label>
            <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
              <BotonConfirmar name="estado" value="verificado" mensaje={'¿Verificar «' + (listado as any).lugar_nombre + '»? Se activará el cruce con desaparecidos para ' + personas.length + ' persona(s).'} className="btn btn-primario">
                <Icono nombre="ok" size={16} /> Verificar y activar cruce
              </BotonConfirmar>
              <BotonConfirmar name="estado" value="observado" mensaje={'¿Devolver «' + (listado as any).lugar_nombre + '» con observaciones? El cruce queda en pausa.'} className="btn">
                <Icono nombre="ojo" size={16} /> Marcar observaciones
              </BotonConfirmar>
            </div>
          </form>
        </div>
      )}
      {puedeRevisar && enRevision && bloqueoAuto && (
        <p className="muted" style={{ fontSize: '.85rem' }}><Icono nombre="llave" size={14} /> No puedes verificar un listado que tú mismo digitalizaste. Debe revisarlo otra persona del equipo.</p>
      )}

      <p className="muted" style={{ fontSize: '.82rem' }}>Digitalizado el {fechaHora((listado as any).creado_en)}.{(listado as any).notas ? ' · ' + (listado as any).notas : ''}</p>
    </AnimarEntrada>
  );
}
