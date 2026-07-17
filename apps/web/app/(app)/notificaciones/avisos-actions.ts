'use server';
// Envío de avisos por un ADMIN: a todos (verificados) o a los miembros de los
// grupos elegidos. Inserta en `notificaciones` con la service_role; cada fila
// dispara además el push (mismo webhook que la campana). Solo admin.
//
// Imagen opcional (0170): un aviso puede llevar una imagen (raster). Se sube al
// bucket público `avisos` y su URL viaja en `imagen_url`, que luego el push y
// Telegram muestran. Son anuncios de difusión, no datos sensibles de casos.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { esAdministrador } from '@/lib/auth';
import { redirigirOk } from '@/lib/flash';
import { clasificarMime, extDe } from '@/lib/subida-tipos';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }

// El archivo viaja por la Server Action (tope ~4.5 MB de Vercel). Cap conservador.
const MAX_IMAGEN_AVISO = 4 * 1024 * 1024;

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

  // ── Imagen opcional ── (se sube antes del abanico; misma URL para todas las filas).
  let imagenUrl: string | null = null;
  const imagen = formData.get('imagen');
  if (imagen instanceof File && imagen.size > 0) {
    if (clasificarMime(imagen.type) !== 'imagen') {
      throw new Error('La imagen debe ser PNG, JPG, WebP o GIF.');
    }
    if (imagen.size > MAX_IMAGEN_AVISO) {
      throw new Error('La imagen supera los 4 MB. Elige una más liviana.');
    }
    const ext = extDe(imagen.type, imagen.name);
    const ruta = user.id + '/' + Date.now() + '.' + ext;
    const buffer = Buffer.from(await imagen.arrayBuffer());
    const { error: eSub } = await admin.storage.from('avisos').upload(ruta, buffer, {
      contentType: imagen.type || 'image/jpeg', upsert: false,
    });
    if (eSub) throw new Error('No se pudo subir la imagen: ' + eSub.message);
    imagenUrl = admin.storage.from('avisos').getPublicUrl(ruta).data.publicUrl;
  }

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

  const filas = destinatarios.map((id) => {
    // Sin imagen: se omite la columna para no depender de 0170 (los avisos de solo
    // texto siguen funcionando aunque aún no se haya aplicado la migración).
    const fila: Record<string, unknown> = {
      destinatario_id: id, tipo: 'aviso_admin', titulo, cuerpo: cuerpo || null, enlace,
    };
    if (imagenUrl) fila.imagen_url = imagenUrl;
    return fila;
  });
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await admin.from('notificaciones').insert(filas.slice(i, i + 500));
    if (error) throw new Error('No se pudo enviar el aviso: ' + error.message);
  }
  revalidatePath('/notificaciones');
  redirigirOk('/notificaciones', 'Aviso enviado a ' + destinatarios.length + ' persona(s)');
}
