import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_ROL } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import Icono from '@/components/Icono';
import Avatar from '@/components/Avatar';
import BotonActualizar from '@/components/BotonActualizar';
import { resolverSolicitud } from '../../acceso/actions';

export default async function AdminSolicitudesPage() {
  await requireCoordinacion();
  const supabase = await createClient();
  const { data } = await supabase.from('solicitudes_acceso')
    .select('id, tipo, rol, mensaje, creado_en, grupos(nombre), perfiles!solicitudes_acceso_perfil_id_fkey(nombre_completo, avatar_url)')
    .eq('estado', 'pendiente').order('creado_en');
  const solicitudes = (data ?? []) as any[];

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1>Solicitudes de acceso</h1>
          <p className="muted sub">Aprueba o rechaza las solicitudes de ingreso a grupos y secciones. {solicitudes.length} pendientes.</p>
        </div>
        <BotonActualizar />
      </div>

      {solicitudes.length === 0 ? (
        <div className="tarjeta"><span className="muted">No hay solicitudes pendientes. 🎉</span></div>
      ) : solicitudes.map((s) => (
        <div key={s.id} className="tarjeta">
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <div className="fila" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Avatar nombre={s.perfiles?.nombre_completo} url={s.perfiles?.avatar_url} size={34} />
              <div>
                <strong>{s.perfiles?.nombre_completo || '—'}</strong>
                <div className="muted" style={{ fontSize: '.9rem' }}>
                  Quiere {s.tipo === 'grupo'
                    ? <>unirse al grupo <strong style={{ color: 'var(--texto)' }}>{s.grupos?.nombre || '—'}</strong></>
                    : <>acceder a <strong style={{ color: 'var(--texto)' }}>{ETIQUETA_ROL[s.rol as Rol] ?? s.rol}</strong></>}
                </div>
                {s.mensaje && <div style={{ fontSize: '.9rem', marginTop: 4 }}>{s.mensaje}</div>}
              </div>
            </div>
            <div className="fila">
              <form action={resolverSolicitud}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="aprobar" value="true" />
                <input type="hidden" name="volver" value="/admin/solicitudes" />
                <button className="btn btn-acento" style={{ minHeight: 34, padding: '4px 14px' }}><Icono nombre="ok" size={16} /> Aprobar</button>
              </form>
              <form action={resolverSolicitud}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="aprobar" value="false" />
                <input type="hidden" name="volver" value="/admin/solicitudes" />
                <button className="btn" style={{ minHeight: 34, padding: '4px 14px' }}>Rechazar</button>
              </form>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
