'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk } from '@/lib/flash';
import { siguienteEtapa } from '@/lib/constantes';
import type { EtapaContenido, DestinoContenido } from '@unidos/types';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }

async function sesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: perfil } = await supabase.from('perfiles').select('rol, verificado').eq('id', user.id).single();
  return { supabase, user, rol: (perfil?.rol ?? '') as string, verificado: !!perfil?.verificado };
}

const volverDe = (fd: FormData, id: string) => opt(fd.get('volver')) || ('/contenido?pieza=' + id);

/** Envía un caso CONFIRMADO Y ACTIVO al pipeline (etapa Redacción). Solo coordinación/verificador. */
export async function enviarARedaccion(formData: FormData) {
  const { supabase, user, rol, verificado } = await sesion();
  if (!verificado || !['admin', 'coordinador', 'verificador'].includes(rol)) throw new Error('No tienes permisos para enviar a Redacción.');
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
  const { error } = await supabase.from('piezas_contenido').update({
    etapa: sig, asignado_a: null, actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo avanzar: ' + error.message);
  revalidatePath('/contenido');
  redirigirOk(volverDe(formData, id), 'La pieza avanzó de etapa');
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
