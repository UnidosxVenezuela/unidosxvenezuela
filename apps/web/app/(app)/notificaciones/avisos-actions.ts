'use server';
// Envío de avisos por un ADMIN: a todos (verificados) o a los miembros de los
// grupos elegidos. Inserta en `notificaciones` con la service_role; cada fila
// dispara además el push (mismo webhook que la campana). Solo admin.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { esAdministrador } from '@/lib/auth';
import { redirigirOk } from '@/lib/flash';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }

export async function enviarAviso(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sesión no válida.');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  if (!esAdministrador(yo as any)) throw new Error('Solo un administrador puede enviar avisos.');

  const titulo = txt(formData.get('titulo'));
  const cuerpo = txt(formData.get('cuerpo'));
  const enlace = txt(formData.get('enlace')) || null;
  const destino = txt(formData.get('destino')) || 'todos';   // 'todos' | 'grupos'
  if (!titulo) throw new Error('El título del aviso es obligatorio.');

  const admin = createAdminClient();
  let destinatarios: string[] = [];
  if (destino === 'grupos') {
    const grupoIds = formData.getAll('grupos').map((g) => String(g)).filter(Boolean);
    if (grupoIds.length === 0) throw new Error('Elige al menos un grupo.');
    const { data } = await admin.from('miembros_grupo').select('perfil_id').in('grupo_id', grupoIds);
    destinatarios = Array.from(new Set((data ?? []).map((m: any) => m.perfil_id)));
  } else {
    const { data } = await admin.from('perfiles').select('id').eq('verificado', true);
    destinatarios = (data ?? []).map((p: any) => p.id);
  }
  if (destinatarios.length === 0) throw new Error('No hay destinatarios para ese envío.');

  const filas = destinatarios.map((id) => ({
    destinatario_id: id, tipo: 'aviso_admin', titulo, cuerpo: cuerpo || null, enlace,
  }));
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await admin.from('notificaciones').insert(filas.slice(i, i + 500));
    if (error) throw new Error('No se pudo enviar el aviso: ' + error.message);
  }
  revalidatePath('/notificaciones');
  redirigirOk('/notificaciones', 'Aviso enviado a ' + destinatarios.length + ' persona(s)');
}
