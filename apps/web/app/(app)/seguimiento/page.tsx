import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_AREA_DESTINO, ETIQUETA_ESTADO_DERIVACION, ETIQUETA_TIPO_INSUMO } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import AnimarEntrada from '@/components/AnimarEntrada';
import Icono from '@/components/Icono';
import EstadoCaso from '@/components/EstadoCaso';
import BadgeCategoria from '@/components/BadgeCategoria';
import Pill from '@/components/Pill';

const TONO_DERIV: Record<string, string> = { sin_tomar: 'neutra', tomada: 'info', en_proceso: 'aviso', cerrada: 'ok' };

/**
 * Seguimiento cross-área (Requerimiento Paso 5): cualquier persona del equipo puede
 * consultar el ESTADO y el RECORRIDO de una solicitud, sea o no de su área, sin ver
 * datos sensibles (contacto ni evidencias). Los datos seguros vienen de la RPC
 * seguimiento_casos (0179); las derivaciones por área, de casos_derivaciones (0177).
 */
export default async function SeguimientoPage({ searchParams }: { searchParams: { q?: string } }) {
  const { perfil } = await requireUsuario();
  // Personal operativo (cualquier rol real, no solo voluntario/observador). La RPC
  // además exige identidad verificada, así que un pendiente ve la página pero sin datos.
  const acceso = esAdministrador(perfil) || rolesDe(perfil).some((r) => !['voluntario', 'observador'].includes(r));
  if (!acceso) redirect('/dashboard');

  const supabase = await createClient();
  const q = (searchParams.q ?? '').trim();
  const { data: casos } = await supabase.rpc('seguimiento_casos', { p_q: q || null });
  const lista = (casos ?? []) as any[];

  // Derivaciones (0177, lectura amplia) y nombres para completar el recorrido.
  const derivPorCaso: Record<string, any[]> = {};
  const nombres = new Map<string, string>();
  const ids = lista.map((c) => c.id);
  if (ids.length) {
    const { data: derivs } = await supabase.from('casos_derivaciones').select('*').in('caso_id', ids).order('derivado_en');
    for (const d of ((derivs ?? []) as any[])) (derivPorCaso[d.caso_id] ||= []).push(d);
    const pids = [...new Set(((derivs ?? []) as any[]).map((d) => d.tomado_por).filter(Boolean))];
    if (pids.length) {
      const { data: ps } = await supabase.from('perfiles').select('id, nombre_completo').in('id', pids);
      for (const p of ((ps ?? []) as any[])) nombres.set(p.id, p.nombre_completo);
    }
  }

  return (
    <AnimarEntrada>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="flecha" size={22} /> Seguimiento de solicitudes</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Consulta el estado y el recorrido de cualquier solicitud, sea o no de tu área. No se muestran contactos ni evidencias.</p>
        </div>
      </div>

      <form className="buscador" style={{ marginBottom: 14 }}>
        <input name="q" defaultValue={q} className="input" placeholder="Buscar por número (#00001) o texto del título…" inputMode="search" style={{ maxWidth: 380 }} />
        <button className="btn" type="submit"><Icono nombre="buscar" size={16} /> Buscar</button>
      </form>

      {lista.length === 0 ? (
        <div className="tarjeta"><p className="muted" style={{ margin: 0 }}>{q ? 'Ninguna solicitud coincide con la búsqueda.' : 'No hay solicitudes para mostrar.'}</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {lista.map((c) => {
            const derivs = derivPorCaso[c.id] ?? [];
            const ubic = [c.ubicacion_municipio, c.ubicacion_estado].filter(Boolean).join(', ');
            return (
              <div key={c.id} className="tarjeta">
                <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>#{String(c.numero).padStart(5, '0')}</strong>
                  <span style={{ fontWeight: 600 }}>{c.titulo}</span>
                  {c.categoria && <BadgeCategoria>{c.categoria}</BadgeCategoria>}
                </div>
                <div className="fila" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                  <EstadoCaso estado={c.estado} />
                  {c.validado
                    ? <Pill tono="ok" punto={false}>✔ Validado</Pill>
                    : <Pill tono="aviso" punto={false}>En verificación</Pill>}
                  {c.es_requerimiento && c.req_tipo && <Pill tono="info" punto={false}>{ETIQUETA_TIPO_INSUMO[c.req_tipo as keyof typeof ETIQUETA_TIPO_INSUMO] ?? c.req_tipo}</Pill>}
                  {ubic && <span className="muted" style={{ fontSize: '.82rem' }}><Icono nombre="ubicacion" size={13} /> {ubic}</span>}
                </div>
                {derivs.length > 0 && (
                  <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <span className="muted" style={{ fontSize: '.8rem' }}>Derivado a:</span>
                    {derivs.map((d) => (
                      <span key={d.id} className="insignia" style={{ fontSize: '.74rem', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        {ETIQUETA_AREA_DESTINO[d.area as keyof typeof ETIQUETA_AREA_DESTINO] ?? d.area}
                        <Pill tono={(TONO_DERIV[d.estado] ?? 'neutra') as any} punto={false}>
                          {ETIQUETA_ESTADO_DERIVACION[d.estado as keyof typeof ETIQUETA_ESTADO_DERIVACION] ?? d.estado}
                          {d.tomado_por && nombres.get(d.tomado_por) ? ' · ' + nombres.get(d.tomado_por) : ''}
                        </Pill>
                      </span>
                    ))}
                  </div>
                )}
                <div className="muted" style={{ fontSize: '.76rem', marginTop: 8 }}>Última actualización: {fechaHora(c.actualizado_en)}</div>
              </div>
            );
          })}
        </div>
      )}
    </AnimarEntrada>
  );
}
