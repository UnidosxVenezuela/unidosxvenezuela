import Link from 'next/link';
import { requireCoordinacion, esSuperadmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ROLES, ETIQUETA_ROL } from '@/lib/constantes';
import type { Perfil } from '@unidos/types';
import { cambiarVerificacion, cambiarRol } from './actions';
import Icono from '@/components/Icono';

export default async function AdminUsuariosPage() {
  const { perfil: yo } = await requireCoordinacion();
  const esSuper = esSuperadmin(yo);
  const supabase = await createClient();
  const { data } = await supabase.from('perfiles')
    .select('id, nombre_completo, telefono, rol, verificado, super_admin, organizacion, motivo, creado_en')
    .order('creado_en', { ascending: false });
  const perfiles = (data ?? []) as Perfil[];
  const pendientes = perfiles.filter((p) => !p.verificado);

  const selectorRol = (p: Perfil) => {
    // Solo el superadmin puede cambiar el rol de un administrador.
    if (p.rol === 'admin' && !esSuper) {
      return <span className="insignia">{ETIQUETA_ROL[p.rol]} 🔒</span>;
    }
    return (
      <form action={cambiarRol} className="fila">
        <input type="hidden" name="perfil_id" value={p.id} />
        <select name="rol" className="input" defaultValue={p.rol} style={{ minHeight: 34, width: 'auto' }}>
          {ROLES.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
        </select>
        <button className="btn" style={{ minHeight: 34, padding: '4px 10px' }}>Guardar</button>
      </form>
    );
  };

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h1>Administración de usuarios</h1>
        <div className="fila">
          <Link className="btn btn-primario" href="/admin/usuarios/nuevo">+ Crear usuario</Link>
          <Link className="btn" href="/admin/areas">Áreas</Link>
        </div>
      </div>
      <p className="muted">Aprueba solicitudes de registro y asigna roles. {perfiles.length} usuarios en total.</p>

      {/* Solicitudes de registro pendientes */}
      <h2>
        Solicitudes de registro{' '}
        <span className={'insignia ' + (pendientes.length ? 'aviso' : 'ok')}>{pendientes.length}</span>
      </h2>

      {pendientes.length === 0 ? (
        <div className="tarjeta"><span className="muted">No hay solicitudes pendientes. 🎉</span></div>
      ) : (
        pendientes.map((p) => (
          <div className="tarjeta" key={p.id}>
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{p.nombre_completo || '—'}</strong>
                <div className="muted" style={{ fontSize: '.9rem' }}>
                  {[p.organizacion, p.telefono].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                </div>
                {p.motivo && (
                  <div style={{ fontSize: '.9rem', marginTop: 4 }}>
                    <span className="muted">Motivo:</span> {p.motivo}
                  </div>
                )}
              </div>
              <div className="fila">
                {selectorRol(p)}
                <form action={cambiarVerificacion}>
                  <input type="hidden" name="perfil_id" value={p.id} />
                  <input type="hidden" name="verificado" value="true" />
                  <button className="btn btn-acento" style={{ minHeight: 34, padding: '4px 14px' }}><Icono nombre="ok" size={16} /> Aprobar</button>
                </form>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Listado general */}
      <h2>Todos los usuarios</h2>
      <div className="tarjeta">
        <table>
          <thead>
            <tr><th>Nombre</th><th>Organización</th><th>Estado</th><th>Rol</th></tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.nombre_completo || '—'}
                  {p.telefono && <div className="muted" style={{ fontSize: '.85rem' }}>{p.telefono}</div>}
                </td>
                <td>{p.organizacion || '—'}</td>
                <td>
                  <form action={cambiarVerificacion} className="fila">
                    <input type="hidden" name="perfil_id" value={p.id} />
                    <input type="hidden" name="verificado" value={(!p.verificado).toString()} />
                    <span className={'insignia ' + (p.verificado ? 'ok' : 'aviso')}>
                      {p.verificado ? 'Verificado' : 'Sin verificar'}
                    </span>
                    <button className="btn" style={{ minHeight: 34, padding: '4px 10px' }}>
                      {p.verificado ? 'Quitar' : 'Verificar'}
                    </button>
                  </form>
                </td>
                <td>{selectorRol(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
