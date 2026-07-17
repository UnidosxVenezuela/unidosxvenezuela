import Link from 'next/link';
import { requirePanelAdmin, esSuperadmin, esAdministrador } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { esEmailInternoWhatsapp } from '@/lib/whatsapp';
import { ROLES, ROLES_ASIGNABLES, GRUPOS_INACTIVOS, ETIQUETA_ROL, ETIQUETA_AREA_ADMIN, ROLES_POR_AREA_ADMIN, GRUPOS_POR_AREA_ADMIN, ETIQUETA_GRUPO_REGISTRO, AREAS_REGISTRO, etiquetaPais, zonaPais } from '@/lib/constantes';
import type { Perfil } from '@unidos/types';
import { cambiarVerificacion, proponerAliado, aprobarAliado, restablecerContrasena, eliminarUsuario } from './actions';
import GestionUsuarioModal from './GestionUsuarioModal';
import Icono from '@/components/Icono';
import BotonActualizar from '@/components/BotonActualizar';
import BotonConfirmar from '@/components/BotonConfirmar';
import Avatar from '@/components/Avatar';
import Pill from '@/components/Pill';
import PresenciaTag from '@/components/PresenciaTag';
import Bandera from '@/components/Bandera';
import MenuFila from '@/components/MenuFila';

export default async function AdminUsuariosPage({ searchParams }: { searchParams: { q?: string; frol?: string; fest?: string } }) {
  const { user, perfil: yo, area } = await requirePanelAdmin();
  const esSuper = esSuperadmin(yo);
  const esAdmin = esAdministrador(yo);
  const supabase = await createClient();
  const { data } = await supabase.from('perfiles')
    .select('id, nombre_completo, telefono, whatsapp, rol, roles_extra, verificado, super_admin, organizacion, motivo, area_registro, grupo_interes, pais, ciudad, disponibilidad, horas_semana, experiencia, contacto_emergencia, estado_presencia, ultima_conexion, avatar_url, habilidades, creado_en')
    .order('creado_en', { ascending: false });
  let perfiles = (data ?? []) as Perfil[];
  // Identidad verificada (2ª verificación aprobada) por persona, para el sello.
  const { data: idsVerif } = await supabase.from('verificaciones_identidad').select('perfil_id').eq('estado', 'aprobada');
  const identidadOK = new Set<string>((idsVerif ?? []).map((v: any) => v.perfil_id));
  // Buscador y filtros (sobre la lista completa ya cargada).
  const q = (searchParams.q ?? '').trim().toLowerCase();
  if (q) perfiles = perfiles.filter((p) =>
    (p.nombre_completo ?? '').toLowerCase().includes(q)
    || (p.organizacion ?? '').toLowerCase().includes(q)
    || (p.whatsapp ?? '').includes(q.replace(/\D/g, '') || q)
    || (p.telefono ?? '').includes(q));
  if (searchParams.frol) perfiles = perfiles.filter((p) => p.rol === searchParams.frol || (p.roles_extra ?? []).includes(searchParams.frol as any));
  if (searchParams.fest === 'verificado') perfiles = perfiles.filter((p) => p.verificado);
  if (searchParams.fest === 'pendiente') perfiles = perfiles.filter((p) => !p.verificado);

  // Nombres por id (de la lista completa, sin filtrar) para mostrar quién lidera qué.
  const nombrePorId = new Map<string, string>((data ?? []).map((p: any) => [p.id, p.nombre_completo ?? '']));

  // Grupos (para "agregar a grupo") y a qué grupos pertenece cada quien.
  const { data: gruposData } = await supabase.from('grupos').select('id, nombre, clave, lider_id').order('nombre');
  const grupos = ((gruposData ?? []) as { id: string; nombre: string; clave: string | null; lider_id: string | null }[])
    .filter((g) => !GRUPOS_INACTIVOS.includes(g.clave ?? ''));  // ocultar grupos desactivados (0138)
  // Admin de área: los selectores de grupo se acotan a los grupos de SU área.
  const gruposArea = area ? grupos.filter((g) => !!g.clave && GRUPOS_POR_AREA_ADMIN[area].includes(g.clave)) : grupos;
  // Para el selector de líder/coordinador: todos los grupos MENOS el psicosocial
  // (que se gestiona con sus propios roles específicos). Se incluye el líder actual
  // de cada grupo para avisar si va a ser reemplazado.
  const gruposParaLider = gruposArea
    .filter((g) => g.clave !== 'apoyo_psicosocial')
    .map((g) => ({ id: g.id, nombre: g.nombre, liderId: g.lider_id, liderNombre: g.lider_id ? (nombrePorId.get(g.lider_id) || 'otra persona') : null }));
  // Qué grupo lidera cada persona (por grupos.lider_id, salvo el psicosocial).
  const lideraPorPerfil = new Map<string, { id: string; nombre: string }>();
  grupos.forEach((g) => { if (g.lider_id && g.clave !== 'apoyo_psicosocial') lideraPorPerfil.set(g.lider_id, { id: g.id, nombre: g.nombre }); });

  const { data: membresias } = await supabase.from('miembros_grupo').select('perfil_id, grupo_id, rol_en_grupo, grupos(nombre, clave)');
  const gruposPorPerfil = new Map<string, string[]>();
  const clavesPorPerfil = new Map<string, string[]>();   // claves de sistema por persona (para acotar por área)
  // Qué grupo coordina cada persona (miembros_grupo con rol_en_grupo = 'coordinador').
  const coordinaPorPerfil = new Map<string, { id: string; nombre: string }>();
  (membresias ?? []).forEach((m: any) => {
    if (m.rol_en_grupo === 'coordinador' && m.grupos?.nombre) coordinaPorPerfil.set(m.perfil_id, { id: m.grupo_id, nombre: m.grupos.nombre });
    if (m.grupos?.clave) {
      const cs = clavesPorPerfil.get(m.perfil_id) ?? [];
      cs.push(m.grupos.clave);
      clavesPorPerfil.set(m.perfil_id, cs);
    }
    if (!m.grupos?.nombre) return;
    const arr = gruposPorPerfil.get(m.perfil_id) ?? [];
    arr.push(m.grupos.nombre);
    gruposPorPerfil.set(m.perfil_id, arr);
  });

  // Admin de área: la lista se ACOTA a los usuarios de SU área (por área de registro,
  // rol funcional del área, o pertenencia/liderazgo de un grupo del área) y nunca a
  // cuentas protegidas (admin general, admin de área o superadmin). El admin general
  // ve a todos.
  if (area) {
    const rolesArea = ROLES_POR_AREA_ADMIN[area] as string[];
    const clavesArea = GRUPOS_POR_AREA_ADMIN[area];
    const ledPorPerfil = new Map<string, string[]>();
    grupos.forEach((g) => { if (g.lider_id && g.clave) { const a = ledPorPerfil.get(g.lider_id) ?? []; a.push(g.clave); ledPorPerfil.set(g.lider_id, a); } });
    const protegido = (p: Perfil) => p.super_admin
      || [p.rol, ...(p.roles_extra ?? [])].some((r) => ['admin', 'admin_verificacion', 'admin_redes', 'admin_logistica', 'admin_digitalizacion'].includes(r as string));
    const enMiArea = (p: Perfil) => {
      if (protegido(p)) return false;
      if ((p as { area_registro?: string | null }).area_registro === area) return true;
      if ([p.rol, ...(p.roles_extra ?? [])].some((r) => rolesArea.includes(r as string))) return true;
      if ((clavesPorPerfil.get(p.id) ?? []).some((c) => clavesArea.includes(c))) return true;
      if ((ledPorPerfil.get(p.id) ?? []).some((c) => clavesArea.includes(c))) return true;
      return false;
    };
    perfiles = perfiles.filter(enMiArea);
  }
  const pendientes = perfiles.filter((p) => !p.verificado);

  // Correo de registro (solo servidor, admin): el correo vive en auth.users, no en
  // perfiles, así que se lee con la service key (createAdminClient) — nunca llega al
  // cliente. Solo se muestra el correo REAL de la persona; el correo interno derivado
  // del WhatsApp (login por número) se oculta. Degrada limpio si la service key no
  // está configurada (no se muestran correos, pero la página no se rompe).
  const correoPorId = new Map<string, string>();
  try {
    const admin = createAdminClient();
    for (let page = 1; page <= 20; page++) {
      const { data: lista, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      const usuarios = lista?.users ?? [];
      if (error || usuarios.length === 0) break;
      for (const u of usuarios) {
        if (u.email && !esEmailInternoWhatsapp(u.email)) correoPorId.set(u.id, u.email);
      }
      if (usuarios.length < 1000) break;
    }
  } catch { /* sin service key → sin correos; la página sigue funcionando */ }

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

  // En el selector de rol no aparece "aliado": ese rol va por doble aprobación. El
  // admin de área solo ofrece los roles funcionales de SU área (o voluntario).
  const rolesSelect = area
    ? ([...ROLES_POR_AREA_ADMIN[area], 'voluntario'] as string[])
    : (ROLES_ASIGNABLES as string[]);

  // Roles adicionales asignables a una persona (sin aliado, sin su rol principal,
  // sin admin salvo superadmin). El admin de área: solo los roles de su área.
  const rolesExtraDe = (p: Perfil) => area
    ? (ROLES_POR_AREA_ADMIN[area] as string[]).filter((r) => r !== p.rol)
    : (ROLES_ASIGNABLES as string[]).filter((r) => r !== p.rol && (r !== 'admin' || esSuper));

  // Toda la gestión de una persona (rol + grupo a cargo + roles adicionales +
  // agregar a grupo) va en UNA ventana flotante, para evitar errores y ordenar la UI.
  const gestionUsuario = (p: Perfil, etiquetaBoton = 'Gestionar rol') => {
    // Solo el superadmin puede cambiar el rol de un administrador.
    if (p.rol === 'admin' && !esSuper) return <span className="insignia">{ETIQUETA_ROL[p.rol]} 🔒</span>;
    // El rol de aliado no se edita acá (se otorga/quita por su flujo).
    if (p.rol === 'lider_plataforma_aliada') return <span className="insignia">{ETIQUETA_ROL[p.rol]}</span>;
    return (
      <GestionUsuarioModal
        perfilId={p.id} nombre={p.nombre_completo ?? ''} rolActual={p.rol}
        rolesPrincipales={rolesSelect} rolesExtra={p.roles_extra ?? []} rolesExtraAsignables={rolesExtraDe(p)}
        grupos={gruposParaLider} gruposTodos={gruposArea.map((g) => ({ id: g.id, nombre: g.nombre }))}
        lideraActual={lideraPorPerfil.get(p.id) ?? null} coordinaActual={coordinaPorPerfil.get(p.id) ?? null}
        className="btn btn-primario" etiquetaBoton={etiquetaBoton} />
    );
  };

  // Restablecer contraseña / eliminar cuenta: un admin común puede con usuarios NO
  // administradores; un SUPERADMIN (dueño) además con administradores comunes.
  // Nunca sobre un superadmin (tier dueño) ni sobre la propia cuenta.
  const puedeGestionarCuenta = (p: Perfil) => {
    if (p.id === user!.id || p.super_admin) return false;
    // Admin de área: los usuarios que ve ya están acotados a su área y no son
    // cuentas protegidas (admin/admin de área/superadmin), así que puede gestionarlos.
    if (area) return true;
    if (!esAdmin) return false;
    const objetivoEsAdmin = p.rol === 'admin' || (p.roles_extra ?? []).includes('admin');
    return esSuper || !objetivoEsAdmin;
  };

  return (
    <div>
      <div className="pagina-cab">
        <div>
          <h1>{area ? 'Administración · ' + ETIQUETA_AREA_ADMIN[area] : 'Administración de usuarios'}</h1>
          <p className="muted sub">
            {area
              ? `Gestionas los usuarios y solicitudes de tu área (${ETIQUETA_AREA_ADMIN[area]}). ${perfiles.length} en tu área.`
              : `Aprueba solicitudes de registro y asigna roles. ${perfiles.length} usuarios en total.`}
          </p>
        </div>
        <div className="fila">
          <BotonActualizar />
          {!area && (
            <>
              <Link className="btn btn-primario" href="/admin/usuarios/nuevo"><Icono nombre="mas" /> Crear usuario</Link>
              <Link className="btn" href="/admin/usuarios/importar"><Icono nombre="grupos" size={16} /> Importar por lote</Link>
              <Link className="btn" href="/admin/areas">Áreas</Link>
            </>
          )}
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
                  {[p.organizacion, p.telefono, correoPorId.get(p.id)].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                </div>
                {(() => {
                  const postula = p.grupo_interes
                    ? (ETIQUETA_GRUPO_REGISTRO[p.grupo_interes] ?? p.grupo_interes)
                    : (AREAS_REGISTRO.find((a) => a.valor === p.area_registro)?.etiqueta ?? null);
                  return postula ? (
                    <div style={{ marginTop: 4 }}>
                      <Pill tono="neutra" punto={false}>Postula a: {postula}</Pill>
                    </div>
                  ) : null;
                })()}
                {p.motivo && (
                  <div style={{ fontSize: '.9rem', marginTop: 4 }}>
                    <span className="muted">Motivo:</span> {p.motivo}
                  </div>
                )}
                </div>
              </div>
              <div className="fila">
                {gestionUsuario(p)}
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
      <form method="get" className="toolbar" style={{ marginBottom: 10 }}>
        <input name="q" className="input crece" placeholder="Buscar por nombre, WhatsApp, teléfono u organización…" defaultValue={searchParams.q ?? ''} style={{ minHeight: 42 }} />
        <div className="campo-filtro"><label>Rol</label>
          <select name="frol" className="input" defaultValue={searchParams.frol ?? ''} style={{ width: 'auto' }}>
            <option value="">Todos</option>
            {ROLES.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
          </select>
        </div>
        <div className="campo-filtro"><label>Estado</label>
          <select name="fest" className="input" defaultValue={searchParams.fest ?? ''} style={{ width: 'auto' }}>
            <option value="">Todos</option>
            <option value="verificado">Verificados</option>
            <option value="pendiente">Sin verificar</option>
          </select>
        </div>
        <button className="btn" type="submit"><Icono nombre="buscar" size={16} /> Buscar</button>
        {(searchParams.q || searchParams.frol || searchParams.fest) && <Link className="btn" href="/admin/usuarios">Limpiar</Link>}
      </form>
      {perfiles.length === 0 ? (
        <div className="tarjeta"><span className="muted">No hay usuarios que coincidan con la búsqueda.</span></div>
      ) : (
        <div className="rejilla-usuarios">
          {perfiles.map((p) => (
            <article className="tarjeta usuario-card" key={p.id}>
              <div className="usuario-top">
              {/* Identidad: avatar + nombre/presencia + país · ciudad · organización */}
              <div className="usuario-id">
                <Avatar nombre={p.nombre_completo} url={p.avatar_url} size={44} />
                <div className="usuario-id-txt">
                  <div className="usuario-nombre-fila">
                    <span className="usuario-nombre">{p.nombre_completo || '—'}</span>
                    <PresenciaTag estado={p.estado_presencia} ultima={p.ultima_conexion} />
                  </div>
                  <div className="usuario-sub">
                    {p.pais && (
                      <span className="fila" title={zonaPais(p.pais) ? 'Zona horaria aprox.: ' + zonaPais(p.pais) : undefined}>
                        <Bandera codigo={p.pais} size={16} titulo={etiquetaPais(p.pais)} />{etiquetaPais(p.pais)}
                      </span>
                    )}
                    {p.ciudad && <span>· {p.ciudad}</span>}
                    {p.organizacion && <span>· {p.organizacion}</span>}
                  </div>
                </div>
              </div>

              {/* Estado, rol y grupos en chips */}
              <div className="usuario-chips">
                <Pill tono={p.verificado ? 'ok' : 'aviso'}>{p.verificado ? 'Verificado' : 'Sin verificar'}</Pill>
                {identidadOK.has(p.id) && <Pill tono="ok" icono="llave">Identidad</Pill>}
                <Pill tono="neutra" punto={false}>{ETIQUETA_ROL[p.rol] ?? p.rol}</Pill>
                {(p.roles_extra ?? []).map((r) => <Pill key={r} tono="info" punto={false}>{ETIQUETA_ROL[r] ?? r}</Pill>)}
                {(gruposPorPerfil.get(p.id) ?? []).map((g) => <Pill key={g} tono="neutra" punto={false}>{g}</Pill>)}
              </div>

              {/* Acciones: gestión de rol y verificación a la vista; lo sensible en «⋮» */}
              <div className="usuario-acc">
                {gestionUsuario(p)}
                <form action={cambiarVerificacion}>
                  <input type="hidden" name="perfil_id" value={p.id} />
                  <input type="hidden" name="verificado" value={(!p.verificado).toString()} />
                  <button className="btn" style={{ minHeight: 38 }}>
                    <Icono nombre={p.verificado ? 'cerrar' : 'ok'} size={15} /> {p.verificado ? 'Quitar verif.' : 'Verificar'}
                  </button>
                </form>
                {puedeGestionarCuenta(p) && (
                  <MenuFila etiqueta="Más acciones">
                    <form action={restablecerContrasena}>
                      <input type="hidden" name="perfil_id" value={p.id} />
                      <BotonConfirmar
                        mensaje={'¿Restablecer la contraseña de ' + (p.nombre_completo || 'esta persona') + '? Se le enviará una contraseña temporal a su correo.'}
                        className="">
                        <Icono nombre="llave" size={14} /> Restablecer contraseña
                      </BotonConfirmar>
                    </form>
                    <form action={eliminarUsuario}>
                      <input type="hidden" name="perfil_id" value={p.id} />
                      <BotonConfirmar
                        mensaje={'¿ELIMINAR a ' + (p.nombre_completo || 'esta persona') + '? Se borra su cuenta definitivamente; sus registros se conservan sin autor. No se puede deshacer.'}
                        className="peligro">
                        <Icono nombre="basura" size={14} /> Eliminar usuario
                      </BotonConfirmar>
                    </form>
                  </MenuFila>
                )}
              </div>
              </div>

              {/* Ficha del voluntario: contacto y datos extra, plegado para no alargar */}
              {(correoPorId.get(p.id) || p.telefono || p.whatsapp || p.disponibilidad || p.horas_semana || p.experiencia || p.contacto_emergencia || (p.habilidades ?? []).length > 0) && (
                <details className="usuario-ficha">
                  <summary>Ficha del voluntario</summary>
                  <div className="usuario-ficha-cont">
                    {correoPorId.get(p.id) && (
                      <div>
                        <Icono nombre="avisos" size={12} /> Correo:{' '}
                        <a href={'mailto:' + correoPorId.get(p.id)}>{correoPorId.get(p.id)}</a>
                      </div>
                    )}
                    {(p.telefono || p.whatsapp) && (
                      <div>
                        <Icono nombre="avisos" size={12} />
                        {p.telefono}{p.telefono && p.whatsapp ? ' · ' : ''}{p.whatsapp ? 'WhatsApp +' + p.whatsapp : ''}
                      </div>
                    )}
                    {(p.disponibilidad || p.horas_semana) && <div><Icono nombre="reloj" size={12} /> {[p.disponibilidad, p.horas_semana].filter(Boolean).join(' · ')}</div>}
                    {p.experiencia && <div><Icono nombre="pizarra" size={12} /> {p.experiencia}</div>}
                    {p.contacto_emergencia && <div><Icono nombre="avisos" size={12} /> Emergencia: {p.contacto_emergencia}</div>}
                    {(p.habilidades ?? []).length > 0 && (
                      <div>{(p.habilidades ?? []).slice(0, 12).map((h) => <span key={h} className="hab-ro">{h}</span>)}</div>
                    )}
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
