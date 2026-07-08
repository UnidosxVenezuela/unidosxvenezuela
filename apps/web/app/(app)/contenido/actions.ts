'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';
import { rolesDe } from '@/lib/auth';
import { siguienteEtapa } from '@/lib/constantes';
import { subirArchivo } from '@/lib/storage';
import { r2Configurado, firmarPut } from '@/lib/r2';
import { clasificarMime, limiteBytes, extDe, urlPublicaR2, nombreSeguro } from '@/lib/subida-tipos';
import { randomUUID } from 'node:crypto';
import type { EtapaContenido, DestinoContenido } from '@unidos/types';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }

// Sube el archivo final de la pieza con la sesión del usuario (RLS de Storage en
// 0053) y guarda la URL pública en piezas_contenido.
export async function subirArchivoPieza(formData: FormData): Promise<{ url?: string; nombre?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };
  const piezaId = String(formData.get('pieza_id'));
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'No se recibió el archivo.' };
  if (file.size > 25 * 1024 * 1024) return { error: 'El archivo no debe superar 25 MB.' };
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  try {
    const { publicUrl } = await subirArchivo(supabase, 'contenido', `${piezaId}/pieza_${Date.now()}.${ext}`, file, { publico: true });
    const { error } = await supabase.from('piezas_contenido').update({ adjunto_url: publicUrl, adjunto_nombre: file.name }).eq('id', piezaId);
    if (error) return { error: 'No se pudo guardar: ' + error.message };
    revalidatePath('/contenido');
    return { url: publicUrl ?? undefined, nombre: file.name };
  } catch (e) {
    return { error: 'No se pudo subir: ' + ((e as Error)?.message ?? 'error') };
  }
}
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }

async function sesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('perfiles').select('rol, roles_extra, verificado').eq('id', user.id).single();
  return { supabase, user, rol: (perfil?.rol ?? '') as string, roles: rolesDe(perfil as any), verificado: !!perfil?.verificado };
}

const volverDe = (fd: FormData, id: string) => opt(fd.get('volver')) || ('/contenido?pieza=' + id);

/** Envía un caso CONFIRMADO Y ACTIVO al pipeline (etapa Redacción). Solo coordinación/verificador. */
export async function enviarARedaccion(formData: FormData) {
  const { supabase, user, roles, verificado } = await sesion();
  if (!verificado || !roles.some((r) => ['admin', 'coordinador', 'verificador'].includes(r))) throw new Error('No tienes permisos para enviar a Redacción.');
  const casoId = txt(formData.get('caso_id'));
  const { data: caso } = await supabase.from('casos').select('titulo, estado').eq('id', casoId).single();
  if (!caso) throw new Error('Caso no encontrado.');
  if (caso.estado !== 'confirmado') throw new Error('Solo se envían casos confirmados y activos.');
  // Evitar duplicados: si el caso ya tiene una pieza, abrirla en vez de crear otra.
  const { data: ya } = await supabase.from('piezas_contenido').select('id').eq('caso_id', casoId).limit(1).maybeSingle();
  if (ya) { revalidatePath('/contenido'); redirigirOk('/contenido?pieza=' + ya.id, 'Este caso ya estaba en producción'); }
  const { data, error } = await supabase.from('piezas_contenido')
    .insert({ caso_id: casoId, titulo: caso.titulo, etapa: 'redaccion', creado_por: user.id })
    .select('id').single();
  if (error) throw new Error('No se pudo enviar a Redacción: ' + error.message);
  revalidatePath('/contenido'); revalidatePath('/casos');
  redirigirOk('/contenido?pieza=' + data!.id, 'Enviado a Redacción');
}

/** Crear una pieza nueva directamente (los grupos de contenido suben contenido).
 *  La RLS (0064) solo deja crear a quien participa del pipeline. */
export async function crearPieza(formData: FormData) {
  const { supabase, user } = await sesion();
  const titulo = txt(formData.get('titulo'));
  if (!titulo) throw new Error('Ponle un título a la pieza.');
  const { data, error } = await supabase.from('piezas_contenido').insert({
    titulo, etapa: 'redaccion', creado_por: user.id,
    contenido: opt(formData.get('contenido')), descripcion: opt(formData.get('descripcion')),
  }).select('id').single();
  if (error) throw new Error('No se pudo crear la pieza: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk('/contenido?pieza=' + data!.id, 'Pieza creada');
}

/** Redacción: contenido + descripción + destino (Diseño o Video). */
export async function guardarRedaccion(formData: FormData) {
  const { supabase } = await sesion();
  const id = txt(formData.get('pieza_id'));
  const d = txt(formData.get('destino'));
  const destino: DestinoContenido | null = d === 'video' ? 'video' : d === 'diseno' ? 'diseno' : null;
  const { error } = await supabase.from('piezas_contenido').update({
    contenido: opt(formData.get('contenido')),
    descripcion: opt(formData.get('descripcion')),
    destino,
    actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo guardar: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk(volverDe(formData, id), 'Redacción guardada');
}

/** Enlace del entregable final (pieza gráfica / video) en Diseño o Video. */
export async function guardarEnlacePieza(formData: FormData) {
  const { supabase } = await sesion();
  const id = txt(formData.get('pieza_id'));
  let url = txt(formData.get('enlace_pieza'));
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (url && !/^https:\/\/\S+$/i.test(url)) throw new Error('Enlace no válido (debe ser https).');
  const { error } = await supabase.from('piezas_contenido').update({
    enlace_pieza: url || null, actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo guardar el enlace: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk(volverDe(formData, id), 'Enlace guardado');
}

/** Asignar la pieza a una persona del equipo de la etapa. */
export async function asignarPieza(formData: FormData) {
  const { supabase } = await sesion();
  const id = txt(formData.get('pieza_id'));
  const { error } = await supabase.from('piezas_contenido').update({
    asignado_a: opt(formData.get('asignado_a')), actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo asignar: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk(volverDe(formData, id), 'Asignación guardada');
}

/** Avanza la pieza a la siguiente etapa (resetea la asignación para el equipo siguiente). */
export async function avanzarEtapa(formData: FormData) {
  const { supabase } = await sesion();
  const id = txt(formData.get('pieza_id'));
  const { data: pieza } = await supabase.from('piezas_contenido').select('etapa, destino').eq('id', id).single();
  if (!pieza) throw new Error('Pieza no encontrada.');
  if (pieza.etapa === 'redaccion' && !pieza.destino) throw new Error('Elige el destino (Diseño o Video) antes de avanzar.');
  const sig = siguienteEtapa(pieza.etapa as EtapaContenido, (pieza.destino ?? null) as DestinoContenido | null);
  if (!sig) throw new Error('La pieza ya está publicada.');
  const patch: Record<string, unknown> = { etapa: sig, asignado_a: null, actualizado_en: new Date().toISOString() };
  if (sig === 'publicado') patch.publicado_en = new Date().toISOString();
  const { error } = await supabase.from('piezas_contenido').update(patch).eq('id', id);
  if (error) throw new Error('No se pudo avanzar: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk(volverDe(formData, id), sig === 'publicado' ? '¡Publicado! ✅' : 'La pieza avanzó de etapa');
}

/** Eliminar una pieza (coordinación). */
export async function eliminarPieza(formData: FormData) {
  const { supabase } = await sesion();
  const id = txt(formData.get('pieza_id'));
  const { error } = await supabase.from('piezas_contenido').delete().eq('id', id);
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk('/contenido', 'Pieza eliminada');
}

/** Adjuntar uno o varios archivos a una pieza (entregables del equipo). */
export async function subirAdjuntoPieza(formData: FormData) {
  const { supabase, user } = await sesion();
  const piezaId = txt(formData.get('pieza_id'));
  const archivos = formData.getAll('archivos').filter((f): f is File => f instanceof File && f.size > 0);
  if (archivos.length === 0) throw new Error('Selecciona al menos un archivo.');
  const { data: pieza } = await supabase.from('piezas_contenido').select('etapa').eq('id', piezaId).single();
  for (let i = 0; i < archivos.length && i < 10; i++) {
    const file = archivos[i]!;
    if (file.size > 25 * 1024 * 1024) continue; // omite > 25 MB
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    try {
      const { publicUrl } = await subirArchivo(supabase, 'contenido', `${piezaId}/adj_${Date.now()}_${i}.${ext}`, file, { publico: true });
      await supabase.from('piezas_adjuntos').insert({
        pieza_id: piezaId, url: publicUrl, nombre: file.name, mime: file.type || null,
        etapa: (pieza?.etapa as string) ?? null, creado_por: user.id,
      });
    } catch { /* un adjunto fallido no bloquea el resto */ }
  }
  revalidatePath('/contenido');
  redirigirOk(volverDe(formData, piezaId), 'Archivo(s) adjuntado(s)');
}

/** Quitar un adjunto (el autor o la coordinación). */
export async function eliminarAdjuntoPieza(formData: FormData) {
  const { supabase } = await sesion();
  const piezaId = txt(formData.get('pieza_id'));
  const { error } = await supabase.from('piezas_adjuntos').delete().eq('id', txt(formData.get('adjunto_id')));
  if (error) throw new Error('No se pudo eliminar el adjunto: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk(volverDe(formData, piezaId), 'Adjunto eliminado');
}

// ── Subida directa navegador → Cloudflare R2 (bucket público `contenido`) ──
// Evita el tope de las Server Actions/Vercel (~4.5 MB): el archivo NO pasa por el
// servidor. Flujo en dos pasos: (1) firmarSubidaContenido devuelve una URL PUT
// firmada; el navegador sube directo a R2; (2) registrar* guarda la referencia en
// la BD (con RLS). Si R2 no está configurado, la UI usa el flujo por Supabase.

type DestinoSubida = 'final' | 'adjunto';

/** Paso 1: valida acceso/tipo/tamaño y devuelve una URL PUT firmada para R2. */
export async function firmarSubidaContenido(input: {
  piezaId: string; nombre: string; mime: string; size: number; destino: DestinoSubida;
}): Promise<{ url: string; key: string; publicUrl: string } | { error: string }> {
  if (!r2Configurado()) return { error: 'La subida directa no está configurada.' };
  const { supabase } = await sesion();
  const piezaId = String(input.piezaId || '');
  if (!piezaId) return { error: 'Falta la pieza.' };
  // Acceso: solo quien puede LEER la pieza (RLS 0064) puede subirle archivos.
  const { data: pieza } = await supabase.from('piezas_contenido').select('id').eq('id', piezaId).maybeSingle();
  if (!pieza) return { error: 'No tienes acceso a esta pieza.' };
  const tipo = clasificarMime(input.mime);
  if (!tipo) return { error: 'Tipo de archivo no permitido.' };
  if (!(Number(input.size) > 0) || Number(input.size) > limiteBytes(tipo)) {
    return { error: 'El archivo excede el tamaño permitido.' };
  }
  const carpeta = input.destino === 'final' ? 'final' : 'adjuntos';
  const key = `piezas/${piezaId}/${carpeta}/${randomUUID()}.${extDe(input.mime, input.nombre || '')}`;
  try {
    const url = await firmarPut(key); // expira en 1 h (margen para videos grandes)
    return { url, key, publicUrl: urlPublicaR2(key) };
  } catch (e) {
    return { error: 'No se pudo preparar la subida: ' + ((e as Error)?.message ?? 'error') };
  }
}

/** Paso 2 (entregable final): guarda la URL pública en la pieza tras subir a R2. */
export async function registrarArchivoPiezaR2(
  input: { piezaId: string; key: string; nombre: string },
): Promise<{ url?: string; nombre?: string; error?: string }> {
  const { supabase } = await sesion();
  const piezaId = String(input.piezaId || '');
  const key = String(input.key || '');
  if (!piezaId || !key.startsWith(`piezas/${piezaId}/`)) return { error: 'Datos de archivo no válidos.' };
  const url = urlPublicaR2(key);
  const nombre = nombreSeguro(input.nombre || 'archivo');
  const { error } = await supabase.from('piezas_contenido').update({ adjunto_url: url, adjunto_nombre: nombre }).eq('id', piezaId);
  if (error) return { error: 'No se pudo guardar: ' + error.message };
  revalidatePath('/contenido');
  return { url, nombre };
}

/** Paso 2 (adjunto): inserta el adjunto en piezas_adjuntos tras subir a R2. */
export async function registrarAdjuntoR2(
  input: { piezaId: string; key: string; nombre: string; mime: string },
): Promise<{ error?: string }> {
  const { supabase, user } = await sesion();
  const piezaId = String(input.piezaId || '');
  const key = String(input.key || '');
  if (!piezaId || !key.startsWith(`piezas/${piezaId}/`)) return { error: 'Datos de archivo no válidos.' };
  const { data: pieza } = await supabase.from('piezas_contenido').select('etapa').eq('id', piezaId).maybeSingle();
  const { error } = await supabase.from('piezas_adjuntos').insert({
    pieza_id: piezaId, url: urlPublicaR2(key), nombre: nombreSeguro(input.nombre || 'archivo'),
    mime: input.mime || null, etapa: (pieza?.etapa as string) ?? null, creado_por: user.id,
  });
  if (error) return { error: 'No se pudo registrar el adjunto: ' + error.message };
  revalidatePath('/contenido');
  return {};
}
