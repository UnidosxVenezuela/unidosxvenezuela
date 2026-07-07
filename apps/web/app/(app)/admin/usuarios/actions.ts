'use server';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enviarEmail, emailActivo } from '@/lib/email';
import { redirigirOk, redirigirError } from '@/lib/flash';
import { normalizarWhatsapp, emailInternoWhatsapp, linkWaMe } from '@/lib/whatsapp';
import { ROLES_POR_AREA_ADMIN, GRUPOS_POR_AREA_ADMIN, PAISES, codigoPais, MIN_CLAVE } from '@/lib/constantes';
import type { Rol, AreaAdmin } from '@unidos/types';
import type { EstadoImport, FilaImport } from './tipos';

// Roles del área psicosocial con acceso a información confidencial. Solo el dueño
// (superadmin) o un coordinador psicosocial existente puede otorgarlos: la RLS/
// trigger proteger_campos_perfil lo exige, y aquí lo replicamos para no crear
// cuentas de Auth huérfanas cuando el otorgamiento vaya a fallar en la BD.
const ROLES_PSICOSOCIAL: Rol[] = ['coordinador_psicosocial', 'apoyo_psicosocial'];
function puedeOtorgarPsico(rolesActor: (string | undefined)[], superAdmin?: boolean | null): boolean {
  return !!superAdmin || rolesActor.includes('coordinador_psicosocial');
}

async function exigirCoordinacion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const rolesYo = [yo?.rol, ...((yo?.roles_extra as string[] | null) ?? [])];
  if (!rolesYo.includes('admin')) throw new Error('Solo administración puede gestionar usuarios.');
  return supabase;
}

// ── Administración por ÁREA (0103) ──
// Acceso al panel: admin GENERAL/superadmin (area=null, sin acotar) o admin de ÁREA
// (acotado a su área). El admin de área NO es es_admin() en la BD; por eso sus
// escrituras van por el cliente de servicio TRAS validar el alcance en código.
async function exigirPanelAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra, super_admin').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  const general = roles.includes('admin') || !!yo?.super_admin;
  const area: AreaAdmin | null = general ? null
    : roles.includes('admin_verificacion') ? 'verificacion'
    : roles.includes('admin_redes') ? 'redes'
    : roles.includes('admin_logistica') ? 'logistica' : null;
  if (!general && !area) throw new Error('Solo la administración puede gestionar usuarios.');
  return { supabase, userId: user.id, esSuper: !!yo?.super_admin, area };
}

// ¿El objetivo es una cuenta de "mayor rango"? (un admin de área no la toca).
function objetivoProtegido(rol?: string | null, rolesExtra?: unknown, superAdmin?: boolean | null): boolean {
  const roles = [rol, ...(((rolesExtra as string[] | null) ?? []))];
  return !!superAdmin || roles.includes('admin')
    || roles.includes('admin_verificacion') || roles.includes('admin_redes') || roles.includes('admin_logistica');
}

// Un admin de área solo actúa sobre usuarios de SU área (por área de registro, rol
// funcional del área o pertenencia/liderazgo de un grupo del área) y nunca sobre
// cuentas protegidas. Lanza si no procede. Devuelve el cliente de servicio para la
// escritura (el admin de área no pasa el trigger/RLS con su propia sesión).
async function exigirObjetivoDeArea(perfilId: string, area: AreaAdmin) {
  const admin = createAdminClient();
  const { data: p } = await admin.from('perfiles')
    .select('rol, roles_extra, super_admin, area_registro').eq('id', perfilId).single();
  if (!p) throw new Error('Usuario no encontrado.');
  if (objetivoProtegido(p.rol, p.roles_extra, p.super_admin)) {
    throw new Error('No puedes gestionar esta cuenta desde una administración de área.');
  }
  if ((p as { area_registro?: string | null }).area_registro === area) return admin;
  const roles = [p.rol, ...(((p.roles_extra as Rol[] | null) ?? []))];
  if (roles.some((r) => ROLES_POR_AREA_ADMIN[area].includes(r as Rol))) return admin;
  const claves = GRUPOS_POR_AREA_ADMIN[area];
  const { data: mem } = await admin.from('miembros_grupo').select('grupos(clave)').eq('perfil_id', perfilId);
  if (((mem ?? []) as { grupos?: { clave?: string } }[]).some((m) => claves.includes(m.grupos?.clave ?? ''))) return admin;
  const { data: lid } = await admin.from('grupos').select('clave').eq('lider_id', perfilId);
  if (((lid ?? []) as { clave?: string }[]).some((g) => claves.includes(g.clave ?? ''))) return admin;
  throw new Error('Esta persona no pertenece a tu área; no puedes gestionarla.');
}

// Registra la auditoría del actor. El admin de área no pasa el gate es_coordinacion()
// de registrar_auditoria, así que inserta la traza por el cliente de servicio.
async function auditarPerfil(supabase: any, area: AreaAdmin | null, userId: string, accion: string, perfilId: string, metadata: Record<string, unknown>) {
  if (area) {
    await createAdminClient().from('registro_auditoria')
      .insert({ actor_id: userId, accion, entidad: 'perfil', entidad_id: perfilId, metadata });
  } else {
    await supabase.rpc('registrar_auditoria', { p_accion: accion, p_entidad_id: perfilId, p_metadata: metadata });
  }
}

export async function cambiarVerificacion(formData: FormData) {
  const { supabase, userId, area } = await exigirPanelAdmin();
  const perfilId = String(formData.get('perfil_id'));
  const verificado = String(formData.get('verificado')) === 'true';
  // Admin de área: escribe por el cliente de servicio tras validar el alcance.
  const cliente = area ? await exigirObjetivoDeArea(perfilId, area) : supabase;
  const { error } = await cliente.from('perfiles').update({ verificado }).eq('id', perfilId);
  if (error) throw new Error('No se pudo actualizar la verificación: ' + error.message);
  await auditarPerfil(supabase, area, userId, 'cambio_verificacion', perfilId, { valor: verificado });

  // Al APROBAR, avisar por email al voluntario (si Resend está configurado).
  if (verificado) {
    try {
      const { data: u } = await createAdminClient().auth.admin.getUserById(perfilId);
      const email = u?.user?.email;
      if (email) {
        await enviarEmail({
          to: email,
          subject: 'Tu cuenta fue verificada — Apoyo por Venezuela',
          html: `<p>¡Hola! La coordinación verificó tu cuenta en <strong>Apoyo por Venezuela</strong>.</p>
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
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra, super_admin').eq('id', user.id).single();
  const rolesYo0 = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!yo || !rolesYo0.includes('admin')) throw new Error('Solo administración puede crear usuarios.');

  const nombre = String(formData.get('nombre_completo') ?? '').trim();
  const emailReal = String(formData.get('email') ?? '').trim().toLowerCase();
  const whatsapp = normalizarWhatsapp(formData.get('whatsapp') as string);
  const password = String(formData.get('password') ?? '');
  const rol = String(formData.get('rol') ?? 'voluntario') as Rol;
  const organizacion = String(formData.get('organizacion') ?? '').trim() || null;
  const grupoId = String(formData.get('grupo_id') ?? '').trim() || null;

  // Errores previsibles → toast rojo (no crashear a la página de error).
  const err = (m: string) => redirigirError('/admin/usuarios/nuevo', m);
  if (!nombre) return err('El nombre es obligatorio.');
  if (emailReal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailReal)) return err('El correo no es válido.');
  if (!emailReal && !whatsapp) return err('Indica un correo o un número de WhatsApp (con código de país, solo dígitos).');
  if (password.length < MIN_CLAVE) return err(`La contraseña temporal debe tener al menos ${MIN_CLAVE} caracteres.`);
  // Regla de superadmin: el admin-client saltea el trigger, así que se valida aquí.
  if (rol === 'admin' && !yo.super_admin) return err('Solo un superadministrador puede crear administradores.');
  // El rol de aliado no se asigna directo: va por doble aprobación.
  if (rol === 'lider_plataforma_aliada') return err('El rol de líder de plataforma aliada se otorga con doble aprobación: crea la cuenta con otro rol y luego proponla en "Aliados".');
  // Los roles psicosociales (confidenciales) solo los otorga el coordinador psicosocial o el dueño.
  if (ROLES_PSICOSOCIAL.includes(rol) && !puedeOtorgarPsico(rolesYo0, yo.super_admin)) {
    return err('Los roles del área psicosocial solo los asigna un coordinador psicosocial (o el dueño). Crea la cuenta con otro rol.');
  }

  // Evitar duplicados ANTES de crear la cuenta, para no dejar usuarios a medias.
  if (whatsapp) {
    const { data: dupW } = await supabase.from('perfiles').select('id').eq('whatsapp', whatsapp).maybeSingle();
    if (dupW) return err('Ya existe una cuenta con ese número de WhatsApp.');
  }

  // Sin correo real: se usa un correo interno derivado del número (login por WhatsApp).
  const email = emailReal || emailInternoWhatsapp(whatsapp!);

  // Crear el usuario (verificado) requiere service_role.
  const admin = createAdminClient();
  const { data: creado, error: e1 } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre_completo: nombre },
  });
  if (e1 || !creado?.user) {
    const dup = /already|registered|exist|duplicate/i.test(e1?.message ?? '');
    return err(dup ? 'Ya existe una cuenta con ese correo.' : 'No se pudo crear el usuario: ' + (e1?.message ?? 'desconocido'));
  }

  const { error: e2 } = await supabase.from('perfiles')
    .update({ nombre_completo: nombre, rol, verificado: true, organizacion, whatsapp })
    .eq('id', creado.user.id);
  if (e2) {
    // Revertir: borrar la cuenta recién creada para no dejar un usuario a medias (huérfano).
    await admin.auth.admin.deleteUser(creado.user.id).catch(() => {});
    const dupW = /idx_perfiles_whatsapp|whatsapp/i.test(e2.message);
    return err(dupW ? 'Ya existe una cuenta con ese número de WhatsApp.' : 'No se pudo completar el perfil: ' + e2.message);
  }

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
        subject: 'Tu cuenta en Apoyo por Venezuela',
        html: `<p>¡Hola, ${nombre}! La coordinación creó tu cuenta en <strong>Apoyo por Venezuela</strong>.</p>
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

type FilaParse = {
  nombre: string; whatsapp: string | null; email: string | null; pais: string | null;
  ciudad: string | null; disponibilidad: string | null; horas_semana: string | null;
  habilidades: string[]; experiencia: string | null; contacto_emergencia: string | null;
};
const VACIO_EXTRA = { ciudad: null, disponibilidad: null, horas_semana: null, habilidades: [] as string[], experiencia: null, contacto_emergencia: null };

/** Formato por COLUMNAS separadas por «|», para importar con la ficha completa:
 *  nombre | whatsapp | correo | país | ciudad | disponibilidad | horas/semana | habilidades | experiencia | contacto_emergencia
 *  Los campos que falten quedan vacíos; «habilidades» admite varias separadas por comas. */
function parsearColumnas(raw: string): FilaParse | null {
  const c = raw.split('|').map((x) => x.trim());
  const val = (i: number) => (c[i] && c[i].length ? c[i] : null);
  const nombre = val(0);
  const whatsapp = c[1] ? normalizarWhatsapp(c[1]) : null;
  const email = c[2] ? c[2].toLowerCase() : null;
  if (!nombre && !whatsapp && !email) return null;
  const paisTok = val(3);
  const habilidades = c[7] ? c[7].split(',').map((h) => h.trim()).filter(Boolean).slice(0, 30) : [];
  return {
    nombre: nombre || (whatsapp ? '+' + whatsapp : (email ?? 'Sin nombre')),
    whatsapp, email, pais: paisTok ? codigoPais(paisTok) : null,
    ciudad: val(4), disponibilidad: val(5), horas_semana: val(6),
    habilidades, experiencia: val(8), contacto_emergencia: val(9),
  };
}

/** Extrae los datos de una línea. Si trae «|», usa el formato por columnas (ficha
 *  completa); si no, el formato libre (número/correo/nombre/país). */
function parsearLineaImport(raw: string): FilaParse | null {
  if (String(raw ?? '').includes('|')) return parsearColumnas(raw);
  let s = String(raw ?? '').replace(/[‒-―]/g, '-').trim(); // guiones largos → '-'
  if (!s) return null;
  const em = s.match(/[^\s<>(),]+@[^\s<>(),]+\.[^\s<>(),]+/);
  const email = em ? em[0].toLowerCase() : null;
  if (em) s = s.replace(em[0], ' ');
  const ph = s.match(/\+?\d[\d\s().-]{5,}\d/);
  const whatsapp = ph ? normalizarWhatsapp(ph[0]) : null;
  if (ph) s = s.replace(ph[0], ' ');
  if (!whatsapp && !email) return null; // línea sin datos útiles (p. ej. "Horario Tarde")
  // País por línea: un campo (separado por guiones) que sea un país conocido —
  // código ISO 'VE' o nombre 'Venezuela'/'Perú'. Se extrae para no mezclarlo con el nombre.
  let pais: string | null = null;
  const segs = s.split('-');
  for (let i = 0; i < segs.length; i++) {
    const c = codigoPais(segs[i]);
    if (c) { pais = c; segs.splice(i, 1); s = segs.join('-'); break; }
  }
  let nombre = s
    .replace(/\(([^)]*)\)/g, ' ')                                   // "(Lider de equipo)"
    .replace(/^\s*\d+\s*[-.)]\s*/, ' ')                             // "1- ", "3) "
    .replace(/\b(l[ií]der(?:\s+de\s+equipo)?|horario)\b\s*:?/gi, ' ')
    .replace(/[-:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!nombre) nombre = whatsapp ? '+' + whatsapp : (email ?? 'Sin nombre');
  return { nombre, whatsapp, email, pais, ...VACIO_EXTRA };
}

export async function importarUsuarios(_prev: EstadoImport, formData: FormData): Promise<EstadoImport> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra, super_admin').eq('id', user.id).single();
  const rolesYo = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!rolesYo.includes('admin')) {
    return { ok: false, mensaje: 'Solo administración puede importar usuarios.', filas: [] };
  }

  const rol = String(formData.get('rol') ?? 'voluntario') as Rol;
  if (rol === 'admin' || rol === 'lider_plataforma_aliada') {
    return { ok: false, mensaje: 'Ese rol no se puede asignar por importación (usa el flujo correspondiente).', filas: [] };
  }
  if (ROLES_PSICOSOCIAL.includes(rol) && !puedeOtorgarPsico(rolesYo, yo?.super_admin)) {
    return { ok: false, mensaje: 'Los roles del área psicosocial no se asignan por importación; los otorga el coordinador psicosocial.', filas: [] };
  }
  const grupoId = String(formData.get('grupo_id') ?? '').trim() || null;
  const organizacion = String(formData.get('organizacion') ?? '').trim() || null;
  // País POR DEFECTO (opcional): solo se usa en las líneas que no traen su propio
  // país. Cada línea puede indicar el suyo (código o nombre), así una lista admite
  // orígenes distintos.
  const paisRaw = String(formData.get('pais') ?? '').trim();
  const paisDefecto = PAISES.some((p) => p.codigo === paisRaw) ? paisRaw : null;
  const lineas = String(formData.get('lista') ?? '').split('\n').slice(0, 200);

  const parsed = lineas.map(parsearLineaImport).filter(Boolean) as FilaParse[];
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
      .update({
        nombre_completo: p.nombre, rol, verificado: true, organizacion,
        whatsapp: p.whatsapp, pais: p.pais ?? paisDefecto,
        // Ficha del voluntario (0115): solo se envían si vinieron por columnas.
        ciudad: p.ciudad, disponibilidad: p.disponibilidad, horas_semana: p.horas_semana,
        experiencia: p.experiencia, contacto_emergencia: p.contacto_emergencia,
        ...(p.habilidades.length ? { habilidades: p.habilidades } : {}),
      })
      .eq('id', creado.user.id);
    if (e2) {
      // Revertir la cuenta a medias (p. ej. WhatsApp repetido) para no dejar huérfanos.
      await admin.auth.admin.deleteUser(creado.user.id).catch(() => {});
      const dupW = /idx_perfiles_whatsapp|whatsapp/i.test(e2.message);
      filas.push({ nombre: p.nombre, whatsapp: p.whatsapp, email: p.email, estado: dupW ? 'duplicado' : 'error', detalle: dupW ? 'Ya hay una cuenta con ese WhatsApp' : e2.message });
      continue;
    }
    if (grupoId) {
      await supabase.from('miembros_grupo').insert({ grupo_id: grupoId, perfil_id: creado.user.id });
    }
    if (p.email) {
      try {
        await enviarEmail({
          to: p.email,
          subject: 'Tu cuenta en Apoyo por Venezuela',
          html: `<p>¡Hola, ${p.nombre}! Te sumamos a <strong>Apoyo por Venezuela</strong>.</p>
                 <p>Ingresa con tu correo y esta contraseña temporal: <strong>${password}</strong> (cámbiala al entrar).</p>
                 <p><a href="https://unidosxvnezuela.com/login">Entrar a la plataforma</a></p>`,
        });
      } catch (e) { console.error('No se pudo enviar el email de bienvenida', e); }
    }
    const waLink = p.whatsapp
      ? linkWaMe(p.whatsapp, `Hola ${p.nombre} 👋 Te sumamos a Apoyo por Venezuela. Entra en https://unidosxvnezuela.com con tu WhatsApp +${p.whatsapp} y esta clave temporal: ${password} (cámbiala al entrar). 💛`)
      : undefined;
    filas.push({ nombre: p.nombre, whatsapp: p.whatsapp, email: p.email, estado: 'creado', password, waLink, pais: p.pais ?? paisDefecto });
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
  const { supabase, userId, area } = await exigirPanelAdmin();
  const perfilId = String(formData.get('perfil_id'));
  const rol = String(formData.get('rol')) as Rol;
  const grupoId = String(formData.get('grupo_id') ?? '').trim();

  // Admin de área: solo los roles funcionales de SU área (o voluntario), sobre un
  // usuario de su área; el liderazgo/coordinación de grupos queda para el admin general.
  if (area) {
    const permitidos: Rol[] = [...ROLES_POR_AREA_ADMIN[area], 'voluntario'];
    if (!permitidos.includes(rol)) {
      throw new Error('Un administrador de área solo puede asignar los roles funcionales de su área.');
    }
    const admin = await exigirObjetivoDeArea(perfilId, area);
    const { error: eArea } = await admin.from('perfiles').update({ rol }).eq('id', perfilId);
    if (eArea) throw new Error('No se pudo cambiar el rol: ' + eArea.message);
    await auditarPerfil(supabase, area, userId, 'cambio_rol', perfilId, { valor: rol });
    revalidatePath('/admin/usuarios'); revalidatePath('/grupos');
    redirigirOk('/admin/usuarios', 'Rol actualizado');
    return;
  }

  // Líder de grupo y coordinador van SIEMPRE a cargo de un grupo concreto.
  const requiereGrupo = rol === 'lider_grupo' || rol === 'coordinador';
  if (requiereGrupo && !grupoId) {
    throw new Error('Elige el grupo que ' + (rol === 'coordinador' ? 'coordinará' : 'dirigirá') + ' esta persona.');
  }

  const { error } = await supabase.from('perfiles')
    .update({ rol }).eq('id', perfilId);
  if (error) throw new Error('No se pudo cambiar el rol: ' + error.message);

  // Una persona PUEDE liderar/coordinar VARIOS grupos: al asignar un grupo se SUMA,
  // sin quitarle los que ya tenía. Solo se respeta «un líder por grupo» reemplazando
  // al líder ANTERIOR del grupo destino.
  // (El área psicosocial se gestiona con sus propios roles y no pasa por aquí.)
  if (requiereGrupo && grupoId) {
    if (rol === 'lider_grupo') {
      // Si el grupo destino ya tenía OTRO líder, bajarlo a miembro (será reemplazado).
      await supabase.from('miembros_grupo').update({ rol_en_grupo: 'miembro' })
        .eq('grupo_id', grupoId).eq('rol_en_grupo', 'lider').neq('perfil_id', perfilId);
      // Asignar a esta persona como líder del grupo destino (sin tocar otros grupos suyos).
      await supabase.from('miembros_grupo')
        .upsert({ grupo_id: grupoId, perfil_id: perfilId, rol_en_grupo: 'lider' }, { onConflict: 'grupo_id,perfil_id' });
      const { error: eg } = await supabase.from('grupos').update({ lider_id: perfilId }).eq('id', grupoId);
      if (eg) throw new Error('Rol cambiado, pero no se pudo asignar el grupo: ' + eg.message);
    } else {
      // Coordinador: se SUMA la coordinación del grupo destino (puede coordinar varios).
      await supabase.from('miembros_grupo')
        .upsert({ grupo_id: grupoId, perfil_id: perfilId, rol_en_grupo: 'coordinador' }, { onConflict: 'grupo_id,perfil_id' });
    }
  }

  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_rol', p_entidad_id: perfilId, p_metadata: { valor: rol, grupo: grupoId || null },
  });
  revalidatePath('/admin/usuarios'); revalidatePath('/grupos');
  redirigirOk('/admin/usuarios', grupoId ? 'Rol y grupo actualizados' : 'Rol actualizado');
}

// Roles adicionales (un usuario puede tener más de un rol). La RLS y el trigger
// proteger_campos_perfil validan: solo coordinación cambia roles_extra y conceder
// 'admin' como extra exige superadmin.
export async function guardarRolesExtra(formData: FormData) {
  const { supabase, userId, area } = await exigirPanelAdmin();
  const perfilId = String(formData.get('perfil_id'));
  const roles = Array.from(new Set(formData.getAll('roles').map(String)))
    .filter((r) => r !== 'lider_plataforma_aliada') as Rol[];

  // Admin de área: solo puede tocar los roles funcionales de SU área; los roles de
  // otras áreas del usuario se CONSERVAN (no se pisan). Objetivo de su área y no protegido.
  if (area) {
    const permitidos = ROLES_POR_AREA_ADMIN[area];
    if (roles.some((r) => !permitidos.includes(r))) {
      throw new Error('Un administrador de área solo puede asignar los roles funcionales de su área.');
    }
    const admin = await exigirObjetivoDeArea(perfilId, area);
    const { data: obj } = await admin.from('perfiles').select('roles_extra').eq('id', perfilId).single();
    const previos = ((obj?.roles_extra as Rol[] | null) ?? []);
    const conservados = previos.filter((r) => !permitidos.includes(r));
    const merged = Array.from(new Set([...conservados, ...roles.filter((r) => permitidos.includes(r))]));
    const { error: eArea } = await admin.from('perfiles').update({ roles_extra: merged }).eq('id', perfilId);
    if (eArea) throw new Error('No se pudieron guardar los roles: ' + eArea.message);
    await auditarPerfil(supabase, area, userId, 'cambio_roles_extra', perfilId, { roles: merged });
    revalidatePath('/admin/usuarios');
    redirigirOk('/admin/usuarios', 'Roles adicionales actualizados');
    return;
  }

  const { error } = await supabase.from('perfiles')
    .update({ roles_extra: roles }).eq('id', perfilId);
  if (error) throw new Error('No se pudieron guardar los roles: ' + error.message);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_roles_extra', p_entidad_id: perfilId, p_metadata: { roles },
  });
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Roles adicionales actualizados');
}

/** Contraseña temporal legible (12+ caracteres). */
function generarTemporal(): string {
  return randomBytes(9).toString('base64url'); // ~12 chars [A-Za-z0-9_-]
}

// Un ADMIN restablece la contraseña de un usuario NO administrador. La temporal
// se envía SOLO al correo de la persona (el admin no la ve). Audita el cambio.
export async function restablecerContrasena(formData: FormData) {
  const { supabase, userId, esSuper, area } = await exigirPanelAdmin();
  const perfilId = String(formData.get('perfil_id'));
  if (perfilId === userId) throw new Error('Para tu propia cuenta usa "Cambiar contraseña" en tu perfil.');
  if (!emailActivo()) throw new Error('El correo (RESEND) no está configurado; no se puede enviar la contraseña temporal.');

  const { data: objetivo } = await supabase.from('perfiles')
    .select('rol, roles_extra, super_admin, nombre_completo').eq('id', perfilId).single();
  if (!objetivo) throw new Error('Usuario no encontrado.');
  if (area) {
    // Admin de área: solo cuentas de SU área y no protegidas.
    await exigirObjetivoDeArea(perfilId, area);
  } else {
    const rolesObjetivo = [objetivo.rol, ...(((objetivo.roles_extra as Rol[] | null) ?? []))];
    // Un superadmin (dueño) sí puede gestionar a un administrador común; pero nadie
    // toca a un superadmin por aquí (el tier dueño se gestiona aparte).
    if (objetivo.super_admin) {
      throw new Error('No puedes restablecer la contraseña de un superadministrador.');
    }
    if (rolesObjetivo.includes('admin') && !esSuper) {
      throw new Error('Solo un superadministrador puede restablecer la contraseña de un administrador.');
    }
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
    subject: 'Tu contraseña fue restablecida — Apoyo por Venezuela',
    html: `<p>Hola${objetivo.nombre_completo ? ', ' + objetivo.nombre_completo : ''}. Un administrador restableció tu contraseña en <strong>Apoyo por Venezuela</strong>.</p>
           <p>Tu nueva contraseña temporal es:</p>
           <p style="font-size:1.25rem;font-weight:700;letter-spacing:.5px">${temporal}</p>
           <p>Ingresa con ella y <strong>cámbiala apenas entres</strong>, desde <em>Mi perfil</em>.</p>
           <p><a href="https://unidosxvenezuela.com/login">Entrar a la plataforma</a></p>`,
  });

  await auditarPerfil(supabase, area, userId, 'reset_contrasena', perfilId, {});
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Contraseña restablecida; se envió la temporal al correo de ' + (objetivo.nombre_completo || 'la persona'));
}

// Un ADMIN elimina una cuenta (no admin). Se borra de Auth y su perfil en
// cascada; sus registros (casos, tareas, contenido, comentarios) se CONSERVAN
// con el autor en null. Requiere la migración 0048. No se puede deshacer.
export async function eliminarUsuario(formData: FormData) {
  const { supabase, userId, esSuper, area } = await exigirPanelAdmin();
  const perfilId = String(formData.get('perfil_id'));
  if (perfilId === userId) throw new Error('No puedes eliminar tu propia cuenta.');

  const { data: objetivo } = await supabase.from('perfiles')
    .select('rol, roles_extra, super_admin, nombre_completo').eq('id', perfilId).single();
  if (!objetivo) throw new Error('Usuario no encontrado.');
  if (area) {
    // Admin de área: solo cuentas de SU área y no protegidas.
    await exigirObjetivoDeArea(perfilId, area);
  } else {
    const rolesObjetivo = [objetivo.rol, ...(((objetivo.roles_extra as Rol[] | null) ?? []))];
    // Un superadmin (dueño) sí puede eliminar a un administrador común; pero nadie
    // elimina a un superadmin por aquí (protege el tier dueño de un borrado accidental).
    if (objetivo.super_admin) {
      throw new Error('No puedes eliminar a un superadministrador.');
    }
    if (rolesObjetivo.includes('admin') && !esSuper) {
      throw new Error('Solo un superadministrador puede eliminar a un administrador.');
    }
  }

  // Auditar antes de borrar (el actor sigue existiendo).
  await auditarPerfil(supabase, area, userId, 'eliminar_usuario', perfilId, { nombre: objetivo.nombre_completo });

  const { error } = await createAdminClient().auth.admin.deleteUser(perfilId);
  if (error) throw new Error('No se pudo eliminar el usuario: ' + error.message);

  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Usuario eliminado');
}

// Sumar a una persona a un grupo desde Administración (coordinación o admin de área).
export async function agregarAGrupo(formData: FormData) {
  const { supabase, area } = await exigirPanelAdmin();
  const perfilId = String(formData.get('perfil_id'));
  const grupoId = String(formData.get('grupo_id'));
  if (!grupoId) return redirigirError('/admin/usuarios', 'Elige un grupo.');

  // Admin de área: el grupo debe ser de SU área; el objetivo, de su área y no protegido.
  if (area) {
    const admin = createAdminClient();
    const { data: g } = await admin.from('grupos').select('clave').eq('id', grupoId).single();
    if (!g || !GRUPOS_POR_AREA_ADMIN[area].includes((g as { clave?: string }).clave ?? '')) {
      return redirigirError('/admin/usuarios', 'Ese grupo no pertenece a tu área.');
    }
    try { await exigirObjetivoDeArea(perfilId, area); }
    catch (e) { return redirigirError('/admin/usuarios', (e as Error).message); }
    const { error } = await admin.from('miembros_grupo').insert({ grupo_id: grupoId, perfil_id: perfilId });
    if (error) {
      if ((error as { code?: string }).code === '23505') return redirigirError('/admin/usuarios', 'La persona ya está en ese grupo.');
      return redirigirError('/admin/usuarios', 'No se pudo agregar al grupo: ' + error.message);
    }
    revalidatePath('/admin/usuarios');
    return redirigirOk('/admin/usuarios', 'Agregado al grupo');
  }

  const { error } = await supabase.from('miembros_grupo').insert({ grupo_id: grupoId, perfil_id: perfilId });
  if (error) {
    if ((error as { code?: string }).code === '23505') return redirigirError('/admin/usuarios', 'La persona ya está en ese grupo.');
    return redirigirError('/admin/usuarios', 'No se pudo agregar al grupo: ' + error.message);
  }
  revalidatePath('/admin/usuarios');
  redirigirOk('/admin/usuarios', 'Agregado al grupo');
}
