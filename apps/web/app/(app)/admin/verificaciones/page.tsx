import { fechaHora } from '@/lib/fechas';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { urlFirmada } from '@/lib/storage';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import Avatar from '@/components/Avatar';
import BotonActualizar from '@/components/BotonActualizar';
import BotonConfirmar from '@/components/BotonConfirmar';
import { aprobarVerificacion, rechazarVerificacion } from './actions';

const TONO: Record<string, 'ok' | 'aviso' | 'critica'> = { aprobada: 'ok', pendiente: 'aviso', rechazada: 'critica' };
const ETIQ: Record<string, string> = { aprobada: 'Aprobada', pendiente: 'Pendiente', rechazada: 'Rechazada' };

export default async function AdminVerificacionesPage() {
  await requireCoordinacion(); // COORDINACION = solo admin
  const supabase = await createClient();

  const { data: filasRaw } = await supabase.from('verificaciones_identidad')
    .select('id, perfil_id, estado, selfie_path, documento_path, creado_en, revisado_en, nota_revision')
    .order('creado_en', { ascending: false }).limit(200);
  const filas = (filasRaw ?? []) as any[];

  const ids = Array.from(new Set(filas.map((f) => f.perfil_id)));
  const { data: perfilesRaw } = ids.length
    ? await supabase.from('perfiles').select('id, nombre_completo, avatar_url, whatsapp').in('id', ids)
    : { data: [] as any[] };
  const perfiles = new Map<string, any>((perfilesRaw ?? []).map((p: any) => [p.id, p]));

  // Solo se firman las imágenes de las PENDIENTES (las revisadas no muestran
  // fotos), y con expiración corta: son cédulas + selfies.
  const pendientes = await Promise.all(filas.filter((f) => f.estado === 'pendiente').map(async (f) => ({
    ...f,
    persona: perfiles.get(f.perfil_id),
    selfieUrl: await urlFirmada(supabase, 'identidad', f.selfie_path, 180),
    docUrl: await urlFirmada(supabase, 'identidad', f.documento_path, 180),
  })));
  const revisadas = filas.filter((f) => f.estado !== 'pendiente').map((f) => ({ ...f, persona: perfiles.get(f.perfil_id) }));

  const Fotos = ({ f }: { f: any }) => (
    <div className="fila" style={{ gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
      {[{ u: f.selfieUrl, t: 'Rostro + documento' }, { u: f.docUrl, t: 'Documento' }].map((img, i) => (
        <div key={i} style={{ flex: '1 1 180px', maxWidth: 260 }}>
          <div className="muted" style={{ fontSize: '.78rem', marginBottom: 2 }}>{img.t}</div>
          {img.u
            ? <a href={img.u} target="_blank" rel="noopener noreferrer"><img src={img.u} alt={img.t} style={{ width: '100%', borderRadius: 8, display: 'block' }} /></a>
            : <span className="muted">—</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="llave" size={24} /> Verificaciones de identidad</h1>
          <p className="muted sub">Revisa las segundas verificaciones: compara el rostro con el documento y aprueba o rechaza.</p>
        </div>
        <BotonActualizar />
      </div>

      <h2>Pendientes <span className="insignia aviso">{pendientes.length}</span></h2>
      {pendientes.length === 0 ? (
        <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>No hay verificaciones pendientes. 🎉</p></div>
      ) : pendientes.map((f) => (
        <div key={f.id} className="tarjeta">
          <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="celda-persona">
              <Avatar nombre={f.persona?.nombre_completo} url={f.persona?.avatar_url} size={30} />
              <strong>{f.persona?.nombre_completo || '—'}</strong>
              {f.persona?.whatsapp && <span className="muted" style={{ fontSize: '.85rem' }}>· {f.persona.whatsapp}</span>}
            </span>
            <span className="muted" style={{ fontSize: '.82rem' }}>{fechaHora(f.creado_en)}</span>
          </div>
          <Fotos f={f} />
          <div className="fila" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <form action={aprobarVerificacion}>
              <input type="hidden" name="id" value={f.id} />
              <BotonConfirmar mensaje={'¿Aprobar la verificación de ' + (f.persona?.nombre_completo || 'esta persona') + '?'} className="btn btn-primario">
                <Icono nombre="ok" size={16} /> Aprobar
              </BotonConfirmar>
            </form>
            <form action={rechazarVerificacion} className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
              <input type="hidden" name="id" value={f.id} />
              <input name="nota" className="input" placeholder="Motivo (opcional)" style={{ width: 200, minHeight: 36 }} />
              <BotonConfirmar mensaje="¿Rechazar esta verificación?" className="btn btn-peligro">
                <Icono nombre="cerrar" size={16} /> Rechazar
              </BotonConfirmar>
            </form>
          </div>
        </div>
      ))}

      {revisadas.length > 0 && (
        <>
          <h2 style={{ marginTop: 20 }}>Revisadas recientemente</h2>
          <div className="tarjeta">
            <div className="tabla-scroll"><table>
              <thead><tr><th>Persona</th><th>Estado</th><th>Revisada</th><th>Nota</th></tr></thead>
              <tbody>
                {revisadas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="celda-persona">
                        <Avatar nombre={f.persona?.nombre_completo} url={f.persona?.avatar_url} size={24} />
                        {f.persona?.nombre_completo || '—'}
                      </span>
                    </td>
                    <td><Pill tono={TONO[f.estado] ?? 'neutra'} punto={false}>{ETIQ[f.estado] ?? f.estado}</Pill></td>
                    <td className="muted" style={{ fontSize: '.82rem' }}>{f.revisado_en ? fechaHora(f.revisado_en) : '—'}</td>
                    <td className="muted">{f.nota_revision || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </>
      )}
    </div>
  );
}
