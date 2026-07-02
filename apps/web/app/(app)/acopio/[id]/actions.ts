'use server';
// Inventario y necesidades de un centro de acopio. La RLS (0065) solo deja
// gestionar a admin, logística, el creador del centro y sus responsables.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }
function num(v: FormDataEntryValue | null) { const n = Number(txt(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; }

async function ctx(puntoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: ok } = await supabase.rpc('puede_gestionar_acopio', { p_punto: puntoId });
  if (!ok) throw new Error('No tienes permiso para gestionar este centro.');
  return { supabase, user };
}
const rev = (puntoId: string) => revalidatePath('/acopio/' + puntoId);

/** Añade un producto; si ya existe (mismo nombre), suma la cantidad. */
export async function agregarProducto(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase, user } = await ctx(puntoId);
  const producto = txt(formData.get('producto'));
  if (!producto) throw new Error('Indica el nombre del producto.');
  const cantidad = Math.max(0, num(formData.get('cantidad')));
  const { data: existente } = await supabase.from('inventario_acopio')
    .select('id, cantidad').eq('punto_id', puntoId).eq('producto', producto).maybeSingle();
  if (existente) {
    const { error } = await supabase.from('inventario_acopio').update({
      cantidad: Number(existente.cantidad) + cantidad,
      categoria: opt(formData.get('categoria')), unidad: opt(formData.get('unidad')),
      codigo: opt(formData.get('codigo')), actualizado_por: user.id, actualizado_en: new Date().toISOString(),
    }).eq('id', existente.id);
    if (error) throw new Error('No se pudo actualizar: ' + error.message);
  } else {
    const { error } = await supabase.from('inventario_acopio').insert({
      punto_id: puntoId, producto, categoria: opt(formData.get('categoria')),
      unidad: opt(formData.get('unidad')), cantidad, codigo: opt(formData.get('codigo')), actualizado_por: user.id,
    });
    if (error) throw new Error('No se pudo agregar: ' + error.message);
  }
  rev(puntoId);
}

/** Ajusta la cantidad de una fila por un delta (+/-), sin bajar de 0. */
export async function ajustarCantidad(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase, user } = await ctx(puntoId);
  const id = txt(formData.get('item_id'));
  const { data: it } = await supabase.from('inventario_acopio').select('cantidad').eq('id', id).single();
  const nueva = Math.max(0, Number(it?.cantidad ?? 0) + num(formData.get('delta')));
  const { error } = await supabase.from('inventario_acopio')
    .update({ cantidad: nueva, actualizado_por: user.id, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo ajustar: ' + error.message);
  rev(puntoId);
}

/** Fija la cantidad exacta (conteo físico). */
export async function fijarCantidad(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase, user } = await ctx(puntoId);
  const { error } = await supabase.from('inventario_acopio')
    .update({ cantidad: Math.max(0, num(formData.get('cantidad'))), actualizado_por: user.id, actualizado_en: new Date().toISOString() })
    .eq('id', txt(formData.get('item_id')));
  if (error) throw new Error('No se pudo guardar: ' + error.message);
  rev(puntoId);
}

export async function eliminarProducto(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await ctx(puntoId);
  const { error } = await supabase.from('inventario_acopio').delete().eq('id', txt(formData.get('item_id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  rev(puntoId);
}

export async function agregarNecesidad(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase, user } = await ctx(puntoId);
  const producto = txt(formData.get('producto'));
  if (!producto) throw new Error('Indica qué se necesita.');
  const u = txt(formData.get('urgencia'));
  const urgencia = ['alta', 'media', 'baja'].includes(u) ? u : 'media';
  const { error } = await supabase.from('necesidades_acopio').insert({
    punto_id: puntoId, producto, categoria: opt(formData.get('categoria')),
    urgencia, nota: opt(formData.get('nota')), creado_por: user.id,
  });
  if (error) throw new Error('No se pudo registrar: ' + error.message);
  // Refleja la urgencia alta en el centro (para el mapa); best-effort.
  if (urgencia === 'alta') await supabase.from('puntos_acopio').update({ urgencia: 'alta' }).eq('id', puntoId);
  rev(puntoId);
}

export async function resolverNecesidad(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await ctx(puntoId);
  const { error } = await supabase.from('necesidades_acopio').update({ resuelta: true }).eq('id', txt(formData.get('nec_id')));
  if (error) throw new Error('No se pudo marcar: ' + error.message);
  rev(puntoId);
}
