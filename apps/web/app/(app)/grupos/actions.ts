'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirigirOk, redirigirError } from '@/lib/flash';
import { esEnlaceWhatsappValido, esEnlaceHttpsValido } from '@/lib/constantes';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import { crearCuentaConRol } from '@/lib/altaUsuario';
import type { Rol } from '@unidos/types';

function whatsappOpcional(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (!esEnlaceWhatsappValido(s)) throw new Error('El enlace de WhatsApp debe ser https (wa.me, chat.whatsapp.com o api.whatsapp.com).');
  return s;
}

export async function crearGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('grupos').insert({
    nombre: String(formData.get('nombre') ?? ''),
    area: String(formData.get('area') ?? ''),
    descripcion: (String(formData.get('descripcion') ?? '') || null),
    whatsapp: whatsappOpcional(formData.get('whatsapp')),
    abierto: false, // los grupos son solo de sus miembros
  }).select('id').single();

  if (error) throw new Error('No se pudo crear el grupo: ' + error.message);
  revalidatePath('/grupos');
  redirigirOk('/grupos/' + data!.id, 'Grupo creado');
}

export async function guardarWhatsappGrupo(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('grupos')
    .update({ whatsapp: whatsappOpcional(formData.get('whatsapp')) }).eq('id', grupoId);
  if (error) throw new Error('No se pudo guardar el WhatsApp: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'WhatsApp guardado');
}

export async function programarReunion(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const enlace = String(formData.get('enlace') ?? '').trim();
  if (!esEnlaceHttpsValido(enlace)) throw new Error('El enlace de la videollamada debe ser https.');
  const duracion = Number(formData.get('duracion_min')) || 60;
  const { error } = await supabase.from('reuniones').insert({
    grupo_id: grupoId,
    titulo: String(formData.get('titulo') ?? '').trim() || 'Reunión',
    enlace,
    inicio: String(formData.get('inicio') ?? ''),
    duracion_min: duracion,
    creado_por: user.id,
  });
  if (error) throw new Error('No se pudo programar la reunión: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Reunión programada');
}

export async function fijarMensaje(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const contenido = String(formData.get('contenido') ?? '').trim();
  if (!contenido) throw new Error('El mensaje no puede estar vacío.');
  if (contenido.length > 2000) throw new Error('El mensaje es demasiado largo (máx. 2000).');

  // Adjunto opcional: se sube con la sesión del usuario (RLS de Storage en 0053).
  let adjPath: string | null = null, adjTipo: string | null = null, adjNombre: string | null = null;
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera 10 MB.');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const { path } = await subirArchivo(supabase, 'grupos', `${grupoId}/${Date.now()}-${safe}`, file, { publico: false, upsert: false });
    adjPath = path;
    adjTipo = file.type.startsWith('image/') ? 'imagen' : 'archivo';
    adjNombre = file.name;
  }

  // La RLS exige ser líder del grupo / coordinación; si no, devuelve error.
  const { error } = await supabase.from('mensajes_fijados').insert({
    grupo_id: grupoId, autor_id: user.id, contenido,
    adjunto_path: adjPath, adjunto_tipo: adjTipo, adjunto_nombre: adjNombre,
  });
  if (error) {
    if (adjPath) await borrarArchivo(supabase, 'grupos', [adjPath]);
    throw new Error('No se pudo fijar el mensaje: ' + error.message);
  }
  revalidatePath('/grupos/' + grupoId);
}

export async function desfijarMensaje(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const mensajeId = String(formData.get('mensaje_id'));
  const { data: row } = await supabase.from('mensajes_fijados')
    .select('adjunto_path').eq('id', mensajeId).single();
  const { error } = await supabase.from('mensajes_fijados').delete().eq('id', mensajeId);
  if (error) throw new Error('No se pudo quitar el mensaje: ' + error.message);
  if (row?.adjunto_path) await borrarArchivo(supabase, 'grupos', [row.adjunto_path]);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Anuncio quitado');
}

export async function agregarMiembro(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('miembros_grupo').insert({
    grupo_id: grupoId,
    perfil_id: String(formData.get('perfil_id')),
  });
  if (error) throw new Error('No se pudo agregar el miembro: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Miembro agregado');
}

export async function quitarMiembro(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('miembros_grupo').delete()
    .eq('grupo_id', grupoId)
    .eq('perfil_id', String(formData.get('perfil_id')));
  if (error) throw new Error('No se pudo quitar el miembro: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Miembro quitado');
}

export async function unirmeGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  // La RLS solo permite auto-unirse a grupos abiertos (y no vetados).
  const { error } = await supabase.from('miembros_grupo')
    .insert({ grupo_id: grupoId, perfil_id: user.id });
  if (error) throw new Error('No se pudo unir al grupo: ' + error.message);
  revalidatePath('/grupos');
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Te uniste al grupo');
}

export async function cambiarVisibilidadGrupo(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const abierto = String(formData.get('abierto')) === 'true';
  const { error } = await supabase.from('grupos').update({ abierto }).eq('id', grupoId);
  if (error) throw new Error('No se pudo cambiar la visibilidad: ' + error.message);
  revalidatePath('/grupos');
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, abierto ? 'Grupo ahora abierto' : 'Grupo ahora privado');
}

export async function banearMiembro(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const perfilId = String(formData.get('perfil_id'));
  // La RLS exige líder del grupo o coordinación.
  const { error } = await supabase.from('miembros_baneados')
    .insert({ grupo_id: grupoId, perfil_id: perfilId, baneado_por: user.id });
  if (error) throw new Error('No se pudo vetar: ' + error.message);
  await supabase.from('miembros_grupo').delete().eq('grupo_id', grupoId).eq('perfil_id', perfilId);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Persona vetada del grupo');
}

export async function desbanearMiembro(formData: FormData) {
  const supabase = await createClient();
  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('miembros_baneados').delete()
    .eq('grupo_id', grupoId).eq('perfil_id', String(formData.get('perfil_id')));
  if (error) throw new Error('No se pudo quitar el veto: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Veto levantado');
}

export async function asignarLider(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const perfilId = String(formData.get('perfil_id'));
  // Un administrador o coordinador no puede ponerse a sí mismo como líder de un grupo.
  if (perfilId === user.id) {
    const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
    const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
    if (roles.includes('admin') || roles.includes('coordinador')) {
      throw new Error('Un administrador o coordinador no puede asignarse a sí mismo como líder de un grupo.');
    }
  }
  // Un grupo tiene UN solo líder: si ya había otro, se baja a miembro antes de
  // asignar el nuevo (mantiene consistente miembros_grupo y respeta el índice único).
  await supabase.from('miembros_grupo').update({ rol_en_grupo: 'miembro' })
    .eq('grupo_id', grupoId).eq('rol_en_grupo', 'lider').neq('perfil_id', perfilId);
  // Asegura pertenencia y marca rol de líder
  await supabase.from('miembros_grupo')
    .upsert({ grupo_id: grupoId, perfil_id: perfilId, rol_en_grupo: 'lider' }, { onConflict: 'grupo_id,perfil_id' });
  const { error } = await supabase.from('grupos')
    .update({ lider_id: perfilId }).eq('id', grupoId);
  if (error) throw new Error('No se pudo asignar el líder: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Líder actualizado');
}

// Quitar al líder de un grupo (dejarlo sin líder). SOLO administración.
export async function quitarLider(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin')) throw new Error('Solo un administrador puede quitar al líder de un grupo.');
  const grupoId = String(formData.get('grupo_id'));
  const { data: g } = await supabase.from('grupos').select('lider_id').eq('id', grupoId).single();
  if (g?.lider_id) {
    await supabase.from('miembros_grupo').update({ rol_en_grupo: 'miembro' })
      .eq('grupo_id', grupoId).eq('perfil_id', g.lider_id);
  }
  const { error } = await supabase.from('grupos').update({ lider_id: null }).eq('id', grupoId);
  if (error) throw new Error('No se pudo quitar el líder: ' + error.message);
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Grupo sin líder');
}

// Asigna roles ADICIONALES de la cadena de contenido a un miembro (o a uno
// mismo). La autorización real la hace la función asignar_roles_contenido:
// coordinación a cualquiera; un líder solo a voluntarios o a sí mismo, y solo
// roles de la cadena de contenido. Facilita sumar gente al flujo de trabajo.
export async function asignarRolesContenido(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = String(formData.get('grupo_id'));
  const perfilId = String(formData.get('perfil_id'));
  const roles = Array.from(new Set(formData.getAll('roles').map(String)));
  const { error } = await supabase.rpc('asignar_roles_contenido', { p_perfil: perfilId, p_roles: roles });
  if (error) throw new Error('No se pudieron asignar los roles: ' + error.message);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'cambio_roles_extra', p_entidad_id: perfilId, p_metadata: { roles, via: 'grupo' },
  });
  revalidatePath('/grupos/' + grupoId);
  redirigirOk('/grupos/' + grupoId, 'Roles de contenido actualizados');
}

// Eliminar un grupo: SOLO administradores (la RLS 0049 también lo exige). Borra
// el grupo y su contenido en cascada; las tareas se conservan sin grupo.
export async function eliminarGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin')) throw new Error('Solo un administrador puede eliminar grupos.');

  const grupoId = String(formData.get('grupo_id'));
  const { error } = await supabase.from('grupos').delete().eq('id', grupoId);
  if (error) throw new Error('No se pudo eliminar el grupo: ' + error.message);
  revalidatePath('/grupos');
  redirigirOk('/grupos', 'Grupo eliminado');
}

// ── Alta de usuarios delegada (líder directo · coordinador con confirmación) ──
function txtG(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function optG(v: FormDataEntryValue | null) { const s = txtG(v); return s ? s : null; }

// Datos de relación del actor con un grupo (para decidir directo vs. solicitud).
async function relacionConGrupo(supabase: any, userId: string, grupoId: string) {
  const [{ data: yo }, { data: g }, { data: coord }] = await Promise.all([
    supabase.from('perfiles').select('rol, roles_extra').eq('id', userId).single(),
    supabase.from('grupos').select('id, nombre, clave, lider_id').eq('id', grupoId).single(),
    supabase.rpc('es_coordinador_de_grupo', { p_grupo: grupoId }),
  ]);
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  const esAdmin = roles.includes('admin');
  const esLider = g?.lider_id === userId;
  const esCoord = coord === true;
  return { esAdmin, esLider, esCoord, grupo: g };
}

// Un líder/admin crea la cuenta DIRECTO; un coordinador crea una SOLICITUD que el
// líder confirma. El rol otorgado es el del grupo (grupo de sistema).
export async function altaUsuarioEnGrupo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const grupoId = txtG(formData.get('grupo_id'));
  const volver = '/grupos/' + grupoId;
  const nombre = txtG(formData.get('nombre_completo'));
  if (!nombre) redirigirError(volver, 'El nombre es obligatorio.');

  const { esAdmin, esLider, esCoord, grupo } = await relacionConGrupo(supabase, user.id, grupoId);
  if (!grupo) redirigirError('/grupos', 'Grupo no encontrado.');
  // Solo grupos de sistema (con rol funcional) admiten alta con rol.
  const { data: rolGrupo } = await supabase.rpc('rol_de_grupo', { p_clave: grupo!.clave });
  if (!rolGrupo) redirigirError(volver, 'Este grupo no otorga un rol asignable; agrega personas con «Agregar miembro».');
  if (!(esAdmin || esLider || esCoord)) redirigirError(volver, 'No tienes permiso para dar de alta en este grupo.');

  const datos = {
    nombre,
    whatsapp: optG(formData.get('whatsapp')),
    email: optG(formData.get('email')),
    organizacion: optG(formData.get('organizacion')),
    grupoId,
  };

  // Líder o admin → creación directa.
  if (esAdmin || esLider) {
    const r = await crearCuentaConRol(datos);
    if (!r.ok) redirigirError(volver, r.error);
    await supabase.rpc('registrar_auditoria', {
      p_accion: 'alta_delegada', p_entidad_id: r.userId, p_metadata: { grupo: grupoId, rol: rolGrupo },
    });
    revalidatePath(volver);
    redirigirOk(volver, 'Cuenta creada y verificada. Contraseña temporal: ' + r.password + ' — compártela; la persona la cambia al entrar.');
  }

  // Coordinador → solicitud pendiente de confirmación por el líder.
  const { error } = await supabase.from('solicitudes_alta_usuario').insert({
    grupo_id: grupoId,
    rol: rolGrupo,                 // el trigger lo re-fija al del grupo
    nombre_completo: nombre,
    whatsapp: datos.whatsapp,
    email: datos.email,
    organizacion: datos.organizacion,
    motivo: optG(formData.get('motivo')),
    solicitado_por: user.id,
    estado: 'pendiente',
  });
  if (error) redirigirError(volver, 'No se pudo enviar la solicitud: ' + error.message);
  revalidatePath(volver);
  redirigirOk(volver, 'Solicitud enviada al líder del grupo para confirmación.');
}

// El líder (o admin) aprueba una solicitud: se crea la cuenta y se notifica.
export async function aprobarSolicitudAlta(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const solId = txtG(formData.get('solicitud_id'));
  const { data: sol } = await supabase.from('solicitudes_alta_usuario')
    .select('id, grupo_id, nombre_completo, whatsapp, email, organizacion, estado, solicitado_por').eq('id', solId).single();
  if (!sol) redirigirError('/grupos', 'Solicitud no encontrada.');
  const volver = '/grupos/' + sol!.grupo_id;
  const { esAdmin, esLider } = await relacionConGrupo(supabase, user.id, sol!.grupo_id);
  if (!(esAdmin || esLider)) redirigirError(volver, 'Solo el líder del grupo puede confirmar.');
  if (sol!.estado !== 'pendiente') redirigirError(volver, 'Esta solicitud ya fue resuelta.');

  const r = await crearCuentaConRol({
    nombre: sol!.nombre_completo, whatsapp: sol!.whatsapp, email: sol!.email,
    organizacion: sol!.organizacion, grupoId: sol!.grupo_id,
  });
  if (!r.ok) redirigirError(volver, r.error);

  const admin = createAdminClient();
  await admin.from('solicitudes_alta_usuario').update({
    estado: 'aprobada', resuelto_por: user.id, resuelto_en: new Date().toISOString(), perfil_creado: r.userId,
  }).eq('id', solId);
  // Avisar al coordinador que propuso.
  if (sol!.solicitado_por) {
    await admin.from('notificaciones').insert({
      destinatario_id: sol!.solicitado_por, tipo: 'solicitud_alta',
      titulo: 'Alta aprobada', cuerpo: 'Se creó la cuenta de ' + sol!.nombre_completo + '.', enlace: volver,
    });
  }
  revalidatePath(volver);
  redirigirOk(volver, 'Cuenta creada y verificada. Contraseña temporal: ' + r.password + ' — compártela con la persona.');
}

// El líder (o admin) rechaza una solicitud.
export async function rechazarSolicitudAlta(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const solId = txtG(formData.get('solicitud_id'));
  const { data: sol } = await supabase.from('solicitudes_alta_usuario')
    .select('id, grupo_id, nombre_completo, estado, solicitado_por').eq('id', solId).single();
  if (!sol) redirigirError('/grupos', 'Solicitud no encontrada.');
  const volver = '/grupos/' + sol!.grupo_id;
  const { esAdmin, esLider } = await relacionConGrupo(supabase, user.id, sol!.grupo_id);
  if (!(esAdmin || esLider)) redirigirError(volver, 'Solo el líder del grupo puede rechazar.');
  if (sol!.estado !== 'pendiente') redirigirError(volver, 'Esta solicitud ya fue resuelta.');

  const { error } = await supabase.from('solicitudes_alta_usuario').update({
    estado: 'rechazada', motivo_rechazo: optG(formData.get('motivo_rechazo')),
    resuelto_por: user.id, resuelto_en: new Date().toISOString(),
  }).eq('id', solId);
  if (error) redirigirError(volver, 'No se pudo rechazar: ' + error.message);
  const admin = createAdminClient();
  if (sol!.solicitado_por) {
    await admin.from('notificaciones').insert({
      destinatario_id: sol!.solicitado_por, tipo: 'solicitud_alta',
      titulo: 'Alta no aprobada', cuerpo: 'La solicitud de alta de ' + sol!.nombre_completo + ' no fue aprobada.', enlace: volver,
    });
  }
  revalidatePath(volver);
  redirigirOk(volver, 'Solicitud rechazada.');
}
