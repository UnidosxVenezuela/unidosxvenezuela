'use server';
// Escritura en los hilos de trabajo (migración 0231).
// Todo pasa por RPC SECURITY DEFINER: las tablas solo publican policy de SELECT, así que
// no hay forma de escribir por otra vía aunque alguien lo intente desde el cliente.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AMBITOS_HILO, esAmbitoHilo } from '@/lib/hilos';
import { STICKERS } from '@/lib/stickers';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

/** Revalida la página del ancla y la bandeja. */
function revalidar(ambito: string, anclaId: string) {
  if (esAmbitoHilo(ambito)) revalidatePath(AMBITOS_HILO[ambito].ruta(anclaId));
  revalidatePath('/conversaciones');
}

export async function escribirEnHilo(formData: FormData) {
  const ambito = txt(formData.get('ambito'));
  const ancla = txt(formData.get('ancla'));
  const cuerpo = txt(formData.get('cuerpo'));
  // El sticker viaja como `value` del botón que se pulsó: por eso el envío normal (el
  // botón «Enviar») no lo trae y este campo queda vacío.
  const sticker = txt(formData.get('sticker'));
  const etiqueta = sticker ? (STICKERS.find((s) => s.id === sticker)?.etiqueta ?? null) : null;
  if (!esAmbitoHilo(ambito)) throw new Error('Ámbito de conversación no válido.');
  if (!cuerpo && !sticker) return;           // enviar vacío no es un error, es no hacer nada

  // Menciones: llegan como lista de ids separados por coma desde el redactor.
  const menciones = txt(formData.get('menciones')).split(',').map((s) => s.trim()).filter(Boolean);

  const { supabase } = await ctx();
  const { error } = await supabase.rpc('escribir_en_hilo', {
    p_ambito: ambito,
    // El ámbito general no cuelga de nada: la RPC pone su centinela (0235).
    p_ancla: ambito === 'general' ? null : ancla,
    // Con sticker, el cuerpo guarda su etiqueta para que el registro y los avisos se
    // lean igual sin el dibujo.
    p_cuerpo: sticker ? etiqueta : cuerpo,
    p_menciones: menciones.length > 0 ? menciones : null,
    p_sticker: sticker || null,
  });
  if (error) throw new Error('No se pudo enviar el mensaje: ' + error.message);
  revalidar(ambito, ancla);
}

export async function editarMensajeHilo(formData: FormData) {
  const mensaje = txt(formData.get('mensaje'));
  const cuerpo = txt(formData.get('cuerpo'));
  const ambito = txt(formData.get('ambito'));
  const ancla = txt(formData.get('ancla'));
  if (!mensaje) throw new Error('Falta el mensaje.');
  if (!cuerpo) throw new Error('El mensaje no puede quedar vacío. Si querías retirarlo, edítalo y explica por qué.');

  const { supabase } = await ctx();
  const { error } = await supabase.rpc('editar_mensaje_hilo', { p_mensaje: mensaje, p_cuerpo: cuerpo });
  if (error) throw new Error('No se pudo editar: ' + error.message);
  revalidar(ambito, ancla);
}

/** Marca el hilo como leído hasta ahora. Silencioso a propósito: si no hay acceso, no hace nada. */
export async function marcarHiloLeido(hiloId: string) {
  if (!hiloId) return;
  const { supabase } = await ctx();
  await supabase.rpc('marcar_hilo_leido', { p_hilo: hiloId });
  revalidatePath('/conversaciones');
}
