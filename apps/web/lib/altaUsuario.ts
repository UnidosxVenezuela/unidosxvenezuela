import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizarWhatsapp, emailInternoWhatsapp, linkWaMe } from '@/lib/whatsapp';

/** Contraseña temporal legible para compartir por WhatsApp/correo. */
export function passwordTemporal(): string {
  return randomBytes(9).toString('base64url');
}

export type DatosAlta = {
  nombre: string;
  whatsapp?: string | null;
  email?: string | null;
  organizacion?: string | null;
  grupoId: string;
};

/**
 * Crea una cuenta VERIFICADA y la suma al grupo (que le otorga el rol funcional por
 * el trigger de sincronización). Todo con la API de administración (service_role):
 * por eso `proteger_campos_perfil` no la bloquea (retorna cuando auth.uid() es null).
 * La AUTORIZACIÓN del actor debe verificarse ANTES de llamar a esta función.
 * Si algo falla tras crear la cuenta, la revierte (no deja usuarios huérfanos).
 */
export async function crearCuentaConRol(d: DatosAlta):
  Promise<{ ok: true; userId: string; password: string; waLink: string | null } | { ok: false; error: string }> {
  const nombre = (d.nombre ?? '').trim();
  const emailReal = (d.email ?? '').trim().toLowerCase();
  const whatsapp = d.whatsapp ? normalizarWhatsapp(d.whatsapp) : null;
  if (!nombre) return { ok: false, error: 'El nombre es obligatorio.' };
  if (emailReal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailReal)) return { ok: false, error: 'El correo no es válido.' };
  if (!emailReal && !whatsapp) return { ok: false, error: 'Indica un correo o un WhatsApp (con código de país, solo dígitos).' };

  const admin = createAdminClient();
  // Anti-duplicado por WhatsApp ANTES de crear (el service_role ve todos los perfiles).
  if (whatsapp) {
    const { data: dupW } = await admin.from('perfiles').select('id').eq('whatsapp', whatsapp).maybeSingle();
    if (dupW) return { ok: false, error: 'Ya existe una cuenta con ese número de WhatsApp.' };
  }
  const email = emailReal || emailInternoWhatsapp(whatsapp!);
  const password = passwordTemporal();

  const { data: creado, error: e1 } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nombre_completo: nombre },
  });
  if (e1 || !creado?.user) {
    const dup = /already|registered|exist|duplicate/i.test(e1?.message ?? '');
    return { ok: false, error: dup ? 'Ya existe una cuenta con ese correo.' : ('No se pudo crear la cuenta: ' + (e1?.message ?? 'desconocido')) };
  }
  const uid = creado.user.id;

  const { error: e2 } = await admin.from('perfiles')
    .update({ nombre_completo: nombre, verificado: true, organizacion: d.organizacion?.trim() || null, whatsapp })
    .eq('id', uid);
  if (e2) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    const dupW = /whatsapp/i.test(e2.message);
    return { ok: false, error: dupW ? 'Ya existe una cuenta con ese número de WhatsApp.' : ('No se pudo completar el perfil: ' + e2.message) };
  }

  // Sumar al grupo → el trigger de sync le concede el rol funcional del grupo.
  const { error: eg } = await admin.from('miembros_grupo').insert({ grupo_id: d.grupoId, perfil_id: uid });
  if (eg && !/duplicate|23505/i.test(eg.message)) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    return { ok: false, error: 'No se pudo asignar al grupo: ' + eg.message };
  }

  return { ok: true, userId: uid, password, waLink: whatsapp ? linkWaMe(whatsapp) : null };
}
