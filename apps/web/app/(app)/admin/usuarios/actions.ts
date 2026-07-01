'use server';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarEmail, emailActivo } from '@/lib/email';
import { redirigirOk } from '@/lib/flash';
import { normalizarWhatsapp, emailInternoWhatsapp, linkWaMe } from '@/lib/whatsapp';
import type { Rol } from '@unidos/types';
import type { EstadoImport, FilaImport } from './tipos';

async function exigirCoordinacion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol').eq('id', user.id).single();
  if (!yo || !['admin', 'coordinador'].includes(yo.rol)) {
    throw new Error('No tienes permisos de coordinación.');
  }
  return supabase;
}

export async function cambiarVerificacion(formData: FormData) {
  const supabase = await exigirCoordinacion();
  const perfilId = String(formData.get('perfil_id'));
  const verificado = String(formData.get('verificado')) === 'true';
  const { error } = await supabase.from('perfiles')
    .update({ verificado }).eq('id', perfilId);
  if (error) throw new Error('No se pudo actualizar la verificación: ' + error.message);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_verificacion', p_entidad_id: perfilId, p_metadata: { valor: verificado },
  });

  // Al APROBAR, avisar por email al voluntario (si Resend está configurado).
  if (verificado) {
    try {
      const { data: u } = await createAdminClient().auth.admin.getUserById(perfilId);
      const email = u?.user?.email;
      if (email) {
        await enviarEmail({
          to: email,
          subject: 'Tu cuenta fue verificada — UnidosXVenezuela',
          html: `<p>¡Hola! La coordinación verificó tu cuenta en <strong>UnidosXVenezuela</strong>.</p>
                 <p>Ya tienes acceso operativo completo. Gracias por sumarte a la respuesta. 💛💙❤️</p>
                 <p><a href="https://unidosxvenezuela-web.vercel.app/dashboard">Entrar a la plataforma</a></p>`,
        });
      }
    } catch (e) {
      console.error('No se pudo enviar el email de verificación', e);
    }
  }
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', verificado ? 'Usuario verificado' : 'Verificación quitada');
}

export async function crearUsuario(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, super_admin').eq('id', user.id).single();
  if (!yo || !['admin', 'coordinador'].includes(yo.rol)) throw new Error('No tienes permisos de coordinación.');

  const nombre = String(formData.get('nombre_completo') ?? '').trim();
  const emailReal = String(formData.get('email') ?? '').trim().toLowerCase();
  const whatsapp = normalizarWhatsapp(formData.get('whatsapp') as string);
  const password = String(formData.get('password') ?? '');
  const rol = String(formData.get('rol') ?? 'voluntario') as Rol;
  const organizacion = String(formData.get('organizacion') ?? '').trim() || null;
  const grupoId = String(formData.get('grupo_id') ?? '').trim() || null;

  if (!nombre) throw new Error('El nombre es obligatorio.');
  if (emailReal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailReal)) throw new Error('Correo inválido.');
  if (!emailReal && !whatsapp) throw new Error('Indica un correo o un número de WhatsApp (con código de país, solo dígitos).');
  if (password.length < 8) throw new Error('La contraseña temporal debe tener al menos 8 caracteres.');
  // Regla de superadmin: el admin-client saltea el trigger, así que se valida aquí.
  if (rol === 'admin' && !yo.super_admin) {
    throw new Error('Solo un superadministrador puede crear administradores.');
  }
  // El rol de aliado no se asigna directo: va por doble aprobación.
  if (rol === 'lider_plataforma_aliada') {
    throw new Error('El rol de líder de plataforma aliada se otorga con doble aprobación: crea la cuenta con otro rol y luego proponla en "Aliados".');
  }

  // Sin correo real: se usa un correo interno derivado del número (login por WhatsApp).
  const email = emailReal || emailInternoWhatsapp(whatsapp!);

  // Crear el usuario (verificado) requiere service_role.
  const admin = createAdminClient();
  const { data: creado, error: e1 } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre_completo: nombre },
  });
  if (e1 || !creado?.user) throw new Error('No se pudo crear el usuario: ' + (e1?.message ?? 'desconocido'));

  const { error: e2 } = await supabase.from('perfiles')
    .update({ nombre_completo: nombre, rol, verificado: true, organizacion, whatsapp })
    .eq('id', creado.user.id);
  if (e2) throw new Error('Usuario creado, pero no se pudo completar el perfil: ' + e2.message);

  // Sumar al grupo elegido (si se eligió). No rompe la creación si falla.
  if (grupoId) {
    const { error: eg } = await supabase.from('miembros_grupo').insert({ grupo_id: grupoId, perfil_id: creado.user.id });
    if (eg) console.error('Usuario creado, pero no se pudo sumar al grupo', eg);
  }

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'crear_usuario', p_entidad_id: creado.user.id, p_metadata: { email: emailReal || null, whatsapp, rol, grupo: grupoId },
  });

  // Correo de bienvenida SOLO si dio un correo real (a los de WhatsApp se les
  // comparte la contraseña por WhatsApp; el correo interno no recibe nada).
  if (emailReal) {
    try {
      await enviarEmail({
        to: emailReal,
        subject: 'Tu cuenta en UnidosXVenezuela',
        html: `<p>¡Hola, ${nombre}! La coordinación creó tu cuenta en <strong>UnidosXVenezuela</strong>.</p>
               <p>Ingresa con tu correo y la contraseña temporal que te compartieron, y cámbiala al entrar.</p>
               <p><a href="https://unidosxvnezuela.com/login">Entrar a la plataforma</a></p>`,
      });
    } catch (e) {
      console.error('No se pudo enviar el email de bienvenida', e);
    }
  }

  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', whatsapp && !emailReal
    ? 'Usuario creado. Comparte la contraseña temporal por WhatsApp; entra con su número.'
    : 'Usuario creado');
}

// ── Importar usuarios por lote (pegar la lista) ──
// Coordinación pega una persona por línea (número y/o correo + nombre); crea las
// cuentas verificadas de una vez y, si se eligió, las suma a un grupo. Devuelve
// el resultado por fila (con la contraseña temporal y un enlace wa.me listo).

/** Extrae {nombre, whatsapp, email} de una línea suelta y flexible. */
function parsearLineaImport(raw: string): { nombre: string; whatsapp: string | null; email: string | null } | null {
  let s = String(raw ?? '').replace(/[‒-―]/g, '-').trim(); // guiones largos → '-'
  if (!s) return null;
  const em = s.match(/[^\s<>(),]+@[^\s<>(),]+\.[^\s<>(),]+/);
  const email = em ? em[0].toLowerCase() : null;
  if (em) s = s.replace(em[0], ' ');
  const ph = s.match(/\+?\d[\d\s().-]{5,}\d/);
  const whatsapp = ph ? normalizarWhatsapp(ph[0]) : null;
  if (ph) s = s.replace(ph[0], ' ');
  if (!whatsapp && !email) return null; // línea sin datos útiles (p. ej. "Horario Tarde")
  let nombre = s
    .replace(/\(([^)]*)\)/g, ' ')                                   // "(Lider de equipo)"
    .replace(/^\s*\d+\s*[-.)]\s*/, ' ')                             // "1- ", "3) "
    .replace(/\b(l[ií]der(?:\s+de\s+equipo)?|horario)\b\s*:?/gi, ' ')
    .replace(/[-:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!nombre) nombre = whatsapp ? '+' + whatsapp : (email ?? 'Sin nombre');
  return { nombre, whatsapp, email };
}

export async function importarUsuarios(_prev: EstadoImport, formData: FormData): Promise<EstadoImport> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const rolesYo = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!rolesYo.includes('admin') && !rolesYo.includes('coordinador')) {
    return { ok: false, mensaje: 'No tienes permisos de coordinación.', filas: [] };
  }

  const rol = String(formData.get('rol') ?? 'voluntario') as Rol;
  if (rol === 'admin' || rol === 'lider_plataforma_aliada') {
    return { ok: false, mensaje: 'Ese rol no se puede asignar por importación (usa el flujo correspondiente).', filas: [] };
  }
  const grupoId = String(formData.get('grupo_id') ?? '').trim() || null;
  const organizacion = String(formData.get('organizacion') ?? '').trim() || null;
  const lineas = String(formData.get('lista') ?? '').split('\n').slice(0, 200);

  const parsed = lineas.map(parsearLineaImport).filter(Boolean) as { nombre: string; whatsapp: string | null; email: string | null }[];
  if (parsed.length === 0) {
    return { ok: false, mensaje: 'No se reconoció ningún contacto. Pega una persona por línea, con su número (con código de país) o su correo.', filas: [] };
  }

  const admin = createAdminClient();
  const filas: FilaImport[] = [];
  const vistos = new Set<string>();

  for (const p of parsed) {
    const clave = (p.whatsapp ?? p.email ?? '').toLowerCase();
    if (clave && vistos.has(clave)) {
      filas.push({ nombre: p.nombre, whatsapp: p.whatsapp, email: p.email, estado: 'duplicado', detalle: 'Repetido en la lista' });
      continue;
    }
    vistos.add(clave);

    const email = p.email || (p.whatsapp ? emailInternoWhatsapp(p.whatsapp) : null);
    if (!email) {
      filas.push({ nombre: p.nombre, whatsapp: null, email: null, estado: 'omitido', detalle: 'Sin número ni correo' });
      continue;
    }
    const password = generarTemporal();
    const { data: creado, error: e1 } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nombre_completo: p.nombre },
    });
    if (e1 || !creado?.user) {
      const dup = /already|registered|exists|duplicate/i.test(e1?.message ?? '');
      filas.push({ nombre: p.nombre, whatsapp: p.whatsapp, email: p.email, estado: dup ? 'duplicado' : 'error', detalle: e1?.message });
      continue;
    }
    const { error: e2 } = await supabase.from('perfiles')
      .update({ nombre_completo: p.nombre, rol, verificado: true, organizacion, whatsapp: p.whatsapp })
      .eq('id', creado.user.id);
    if (e2) {
      filas.push({ nombre: p.nombre, whatsapp: p.whatsapp, email: p.email, estado: 'error', detalle: e2.message });
      continue;
    }
    if (grupoId) {
      await supabase.from('miembros_grupo').insert({ grupo_id: grupoId, perfil_id: creado.user.id });
    }
    if (p.email) {
      try {
        await enviarEmail({
          to: p.email,
          subject: 'Tu cuenta en UnidosXVenezuela',
          html: `<p>¡Hola, ${p.nombre}! Te sumamos a <strong>UnidosXVenezuela</strong>.</p>
                 <p>Ingresa con tu correo y esta contraseña temporal: <strong>${password}</strong> (cámbiala al entrar).</p>
                 <p><a href="https://unidosxvnezuela.com/login">Entrar a la plataforma</a></p>`,
        });
      } catch (e) { console.error('No se pudo enviar el email de bienvenida', e); }
    }
    const waLink = p.whatsapp
      ? linkWaMe(p.whatsapp, `Hola ${p.nombre} 👋 Te sumamos a UnidosXVenezuela. Entra en https://unidosxvnezuela.com con tu WhatsApp +${p.whatsapp} y esta clave temporal: ${password} (cámbiala al entrar). 💛`)
      : undefined;
    filas.push({ nombre: p.nombre, whatsapp: p.whatsapp, email: p.email, estado: 'creado', password, waLink });
  }

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'crear_usuario', p_entidad_id: user.id,
    p_metadata: { importados: filas.filter((f) => f.estado === 'creado').length, rol, grupo: grupoId },
  });
  revalidatePath('/admin/usuarios');
  const creados = filas.filter((f) => f.estado === 'creado').length;
  return { ok: true, mensaje: `${creados} de ${filas.length} contactos creados.`, filas };
}

export async function proponerAliado(formData: FormData) {
  const supabase = await exigirCoordinacion();
  const perfilId = String(formData.get('perfil_id'));
  // El RPC exige rol admin y registra al proponente como 1ª aprobación.
  const { error } = await supabase.rpc('proponer_aliado', { p_perfil: perfilId });
  if (error) throw new Error('No se pudo proponer: ' + error.message);
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Propuesta registrada');
}

export async function aprobarAliado(formData: FormData) {
  const supabase = await exigirCoordinacion();
  const solicitudId = String(formData.get('solicitud_id'));
  const { error } = await supabase.rpc('aprobar_aliado', { p_solicitud: solicitudId });
  if (error) throw new Error('No se pudo aprobar: ' + error.message);
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Aprobación registrada');
}

export async function cambiarRol(formData: FormData) {
  const supabase = await exigirCoordinacion();
  const perfilId = String(formData.get('perfil_id'));
  const rol = String(formData.get('rol')) as Rol;
  const { error } = await supabase.from('perfiles')
    .update({ rol }).eq('id', perfilId);
  if (error) throw new Error('No se pudo cambiar el rol: ' + error.message);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_rol', p_entidad_id: perfilId, p_metadata: { valor: rol },
  });
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Rol actualizado');
}

// Roles adicionales (un usuario puede tener más de un rol). La RLS y el trigger
// proteger_campos_perfil validan: solo coordinación cambia roles_extra y conceder
// 'admin' como extra exige superadmin.
export async function guardarRolesExtra(formData: FormData) {
  const supabase = await exigirCoordinacion();
  const perfilId = String(formData.get('perfil_id'));
  const roles = Array.from(new Set(formData.getAll('roles').map(String)))
    .filter((r) => r !== 'lider_plataforma_aliada') as Rol[];
  const { error } = await supabase.from('perfiles')
    .update({ roles_extra: roles }).eq('id', perfilId);
  if (error) throw new Error('No se pudieron guardar los roles: ' + error.message);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_roles_extra', p_entidad_id: perfilId, p_metadata: { roles },
  });
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Roles adicionales actualizados');
}

// Exige que el actor sea ADMIN (rol principal o adicional).
async function exigirAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin')) throw new Error('Solo un administrador puede hacer esto.');
  return { supabase, userId: user.id };
}

/** Contraseña temporal legible (12+ caracteres). */
function generarTemporal(): string {
  return randomBytes(9).toString('base64url'); // ~12 chars [A-Za-z0-9_-]
}

// Un ADMIN restablece la contraseña de un usuario NO administrador. La temporal
// se envía SOLO al correo de la persona (el admin no la ve). Audita el cambio.
export async function restablecerContrasena(formData: FormData) {
  const { supabase, userId } = await exigirAdmin();
  const perfilId = String(formData.get('perfil_id'));
  if (perfilId === userId) throw new Error('Para tu propia cuenta usa "Cambiar contraseña" en tu perfil.');
  if (!emailActivo()) throw new Error('El correo (RESEND) no está configurado; no se puede enviar la contraseña temporal.');

  const { data: objetivo } = await supabase.from('perfiles')
    .select('rol, roles_extra, super_admin, nombre_completo').eq('id', perfilId).single();
  if (!objetivo) throw new Error('Usuario no encontrado.');
  const rolesObjetivo = [objetivo.rol, ...(((objetivo.roles_extra as Rol[] | null) ?? []))];
  if (rolesObjetivo.includes('admin') || objetivo.super_admin) {
    throw new Error('No puedes restablecer la contraseña de otro administrador.');
  }

  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(perfilId);
  const email = u?.user?.email;
  if (!email) throw new Error('Esa persona no tiene correo registrado.');

  const temporal = generarTemporal();
  const { error } = await admin.auth.admin.updateUserById(perfilId, { password: temporal });
  if (error) throw new Error('No se pudo restablecer la contraseña: ' + error.message);

  await enviarEmail({
    to: email,
    subject: 'Tu contraseña fue restablecida — UnidosXVenezuela',
    html: `<p>Hola${objetivo.nombre_completo ? ', ' + objetivo.nombre_completo : ''}. Un administrador restableció tu contraseña en <strong>UnidosXVenezuela</strong>.</p>
           <p>Tu nueva contraseña temporal es:</p>
           <p style="font-size:1.25rem;font-weight:700;letter-spacing:.5px">${temporal}</p>
           <p>Ingresa con ella y <strong>cámbiala apenas entres</strong>, desde <em>Mi perfil</em>.</p>
           <p><a href="https://unidosxvenezuela.com/login">Entrar a la plataforma</a></p>`,
  });

  await supabase.rpc('registrar_auditoria', { p_accion: 'reset_contrasena', p_entidad_id: perfilId, p_metadata: {} });
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Contraseña restablecida; se envió la temporal al correo de ' + (objetivo.nombre_completo || 'la persona'));
}
