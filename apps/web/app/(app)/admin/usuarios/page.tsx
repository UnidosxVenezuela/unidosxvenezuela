import Link from 'next/link';
import { requireCoordinacion, esSuperadmin, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ROLES, ETIQUETA_ROL } from '@/lib/constantes';
import type { Perfil } from '@unidos/types';
import { cambiarVerificacion, cambiarRol, proponerAliado, aprobarAliado, guardarRolesExtra, restablecerContrasena } from './actions';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';
import BotonConfirmar from '@/components/BotonConfirmar';
import Avatar from '@/components/Avatar';
import Pill from '@/components/Pill';

export default async function AdminUsuariosPage() {
  const { user, perfil: yo } = await requireCoordinacion();
  const esSuper = esSuperadmin(yo);
  const esAdmin = esAdministrador(yo);
  const supabase = await createClient();
  const { data } = await supabase.from('perfiles')
    .select('id, nombre_completo, telefono, whatsapp, rol, roles_extra, verificado, super_admin, organizacion, motivo, avatar_url, habilidades, creado_en')
    .order('creado_en', { ascending: false });
  const perfiles = (data ?? []) as Perfil[];
  const pendientes = perfiles.filter((p) => !p.verificado);

  // Flujo de aliados (doble aprobación) — solo administradores.
  let solicitudes: any[] = [];
  if (esAdmin) {
    const { data: sol } = await supabase.from('solicitudes_aliado')
      .select('id, perfil_id, creado_en, perfiles(nombre_completo), aprobaciones_aliado(admin_id)')
      .eq('estado', 'pendiente').order('creado_en');
    solicitudes = sol ?? [];
  }
  const idsConSolicitud = new Set(solicitudes.map((s) => s.perfil_id));
  const candidatosAliado = perfiles.filter(
    (p) => !['admin', 'lider_plataforma_aliada'].includes(p.rol) && p.id !== user!.id && !idsConSolicitud.has(p.id),
  );

  // En el selector de rol no aparece "aliado": ese rol va por doble aprobación.
  const rolesSelect = ROLES.filter((r) => r !== 'lider_plataforma_aliada');

  const selectorRol = (p: Perfil) => {
    // Solo el superadmin puede cambiar el rol de un administrador.
    if (p.rol === 'admin' && !esSuper) {
      return <span className="insignia">{ETIQUETA_ROL[p.rol]} 🔒</span>;
    }
    // El rol de aliado no se edita acá (se otorga/quita por su flujo).
    if (p.rol === 'lider_plataforma_aliada') {
      return <span className="insignia">{ETIQUETA_ROL[p.rol]}</span>;
    }
    return (
      <form action={cambiarRol} className="fila">
        <input type="hidden" name="perfil_id" value={p.id} />
        <select name="rol" className="input" defaultValue={p.rol} style={{ minHeight: 34, width: 'auto' }}>
          {rolesSelect.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
        </select>
        <BotonConfirmar mensaje={'¿Cambiar el rol de ' + (p.nombre_completo || 'esta persona') + '?'} className="btn" style={{ minHeight: 34, padding: '4px 10px' }}>Guardar</BotonConfirmar>
      </form>
    );
  };

  // Roles adicionales: un usuario puede tener más de un rol (verificador + redactor, etc.).
  const editorRolesExtra = (p: Perfil) => {
    const asignables = ROLES.filter((r) => r !== 'lider_plataforma_aliada' && r !== p.rol && (r !== 'admin' || esSuper));
    const extra = p.roles_extra ?? [];
    return (
      <details className="roles-extra">
        <summary>Roles adicionales{extra.length ? ` · ${extra.length}` : ''}</summary>
        <form action={guardarRolesExtra} style={{ marginTop: 8 }}>
          <input type="hidden" name="perfil_id" value={p.id} />
          <div style={{ display: 'grid', gap: 4 }}>
            {asignables.map((r) => (
              <label key={r} className="fila" style={{ gap: 6, fontWeight: 500 }}>
                <input type="checkbox" name="roles" value={r} defaultChecked={extra.includes(r)} style={{ width: 'auto', minHeight: 0 }} />
                {ETIQUETA_ROL[r]}
              </label>
            ))}
          </div>
          <button className="btn" style={{ minHeight: 32, padding: '4px 10px', marginTop: 8 }}>Guardar roles</button>
        </form>
      </details>
    );
  };

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1>Administración de usuarios</h1>
          <p className="muted sub">Aprueba solicitudes de registro y asigna roles. {perfiles.length} usuarios en total.</p>
        </div>
        <div className="fila">
          <BotonActualizar />
          <Link className="btn btn-primario" href="/admin/usuarios/nuevo"><Icono nombre="mas" /> Crear usuario</Link>
          <Link className="btn" href="/admin/usuarios/importar"><Icono nombre="grupos" size={16} /> Importar por lote</Link>
          <Link className="btn" href="/admin/areas">Áreas</Link>
        </div>
      </div>

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
              <div className="fila" style={{ gap: 10, alignItems: 'flex-start' }}>
                <Avatar nombre={p.nombre_completo} url={p.avatar_url} size={34} />
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

      {/* Líderes de plataforma aliada — doble aprobación (solo admins) */}
      {esAdmin && (
        <>
          <h2 style={{ marginBottom: 0 }}>
            Líderes de plataforma aliada{' '}
            <span className="muted" style={{ fontSize: '.9rem', fontWeight: 400 }}>· doble aprobación</span>
          </h2>
          <p className="muted">
            El acceso a la base de endpoints aliados se otorga con <strong>2 administradores</strong> (o 1 si eres superadmin).
          </p>

          <form action={proponerAliado} className="tarjeta fila">
            <select name="perfil_id" className="input" required defaultValue="" style={{ maxWidth: 360 }}>
              <option value="" disabled>Elige a quién proponer…</option>
              {candidatosAliado.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo || p.id}</option>)}
            </select>
            <button className="btn btn-primario" type="submit">Proponer como aliado</button>
          </form>

          {solicitudes.length === 0 ? (
            <div className="tarjeta"><span className="muted">No hay propuestas pendientes.</span></div>
          ) : (
            solicitudes.map((s) => {
              const aprob = (s.aprobaciones_aliado ?? []) as { admin_id: string }[];
              const yaAprobe = aprob.some((a) => a.admin_id === user!.id);
              return (
                <div className="tarjeta" key={s.id}>
                  <div className="fila" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <strong>{s.perfiles?.nombre_completo || '—'}</strong>
                      <div className="muted" style={{ fontSize: '.85rem' }}>
                        {aprob.length}/2 aprobaciones{esSuper ? ' · como superadmin, tu aprobación basta' : ''}
                      </div>
                    </div>
                    {yaAprobe ? (
                      <span className="insignia ok">Ya aprobaste</span>
                    ) : (
                      <form action={aprobarAliado}>
                        <input type="hidden" name="solicitud_id" value={s.id} />
                        <button className="btn btn-acento" style={{ minHeight: 34, padding: '4px 14px' }}>
                          <Icono nombre="ok" size={16} /> Aprobar
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* Listado general */}
      <h2>Todos los usuarios</h2>
      <div className="tarjeta">
        <div className="tabla-scroll"><table>
          <thead>
            <tr><th>Nombre</th><th>Organización</th><th>Estado</th><th>Rol</th></tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="fila" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <Avatar nombre={p.nombre_completo} url={p.avatar_url} />
                    <span>
                      {p.nombre_completo || '—'}
                      {p.telefono && <div className="muted" style={{ fontSize: '.85rem' }}>{p.telefono}</div>}
                      {p.whatsapp && <div className="muted" style={{ fontSize: '.85rem' }}>WhatsApp +{p.whatsapp}</div>}
                      {(p.habilidades ?? []).length > 0 && (
                        <div className="fila" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {(p.habilidades ?? []).slice(0, 6).map((h) => <span key={h} className="hab-ro">{h}</span>)}
                        </div>
                      )}
                    </span>
                  </span>
                </td>
                <td>{p.organizacion || '—'}</td>
                <td>
                  <form action={cambiarVerificacion} className="fila">
                    <input type="hidden" name="perfil_id" value={p.id} />
                    <input type="hidden" name="verificado" value={(!p.verificado).toString()} />
                    <Pill tono={p.verificado ? 'ok' : 'aviso'}>{p.verificado ? 'Verificado' : 'Sin verificar'}</Pill>
                    <button className="btn" style={{ minHeight: 34, padding: '4px 10px' }}>
                      {p.verificado ? 'Quitar' : 'Verificar'}
                    </button>
                  </form>
                  {esAdmin && p.id !== user!.id && !(p.rol === 'admin' || (p.roles_extra ?? []).includes('admin') || p.super_admin) && (
                    <form action={restablecerContrasena} style={{ marginTop: 6 }}>
                      <input type="hidden" name="perfil_id" value={p.id} />
                      <BotonConfirmar
                        mensaje={'¿Restablecer la contraseña de ' + (p.nombre_completo || 'esta persona') + '? Se le enviará una contraseña temporal a su correo.'}
                        className="btn" style={{ minHeight: 32, padding: '4px 10px' }}>
                        <Icono nombre="llave" size={14} /> Restablecer contraseña
                      </BotonConfirmar>
                    </form>
                  )}
                </td>
                <td>
                  {selectorRol(p)}
                  {(p.roles_extra ?? []).length > 0 && (
                    <div className="fila" style={{ gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {(p.roles_extra ?? []).map((r) => <Pill key={r} tono="info" punto={false}>{ETIQUETA_ROL[r]}</Pill>)}
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}>{editorRolesExtra(p)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
