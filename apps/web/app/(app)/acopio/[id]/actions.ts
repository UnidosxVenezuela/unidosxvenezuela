'use server';
// Inventario, movimientos, traspasos y necesidades de un centro de acopio.
// La RLS (0065/0069) define quién puede qué:
//   · Gestores (admin, logística, creador, responsables): todo.
//   · Voluntarios del centro: SOLO sumar (entradas/donaciones) vía RPC.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }
function num(v: FormDataEntryValue | null) { const n = Number(txt(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; }

/** Solo exige sesión (la RLS/RPC decide el permiso fino). */
async function userCtx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

/** Exige poder GESTIONAR el centro (descontar, fijar, borrar, traspasar). */
async function ctx(puntoId: string) {
  const { supabase, user } = await userCtx();
  const { data: ok } = await supabase.rpc('puede_gestionar_acopio', { p_punto: puntoId });
  if (!ok) throw new Error('No tienes permiso para gestionar este centro.');
  return { supabase, user };
}
const rev = (puntoId: string) => revalidatePath('/acopio/' + puntoId);

/** Ingresa stock (entrada). Suma si el producto ya existe. Funciona para
 *  gestores y voluntarios (vía RPC sumar_stock, que auto-autoriza). */
export async function agregarProducto(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await userCtx();
  const producto = txt(formData.get('producto'));
  if (!producto) throw new Error('Indica el nombre del producto.');
  const { error } = await supabase.rpc('sumar_stock', {
    p_punto: puntoId, p_producto: producto,
    p_cantidad: Math.max(0, num(formData.get('cantidad'))),
    p_categoria: opt(formData.get('categoria')), p_unidad: opt(formData.get('unidad')),
    p_codigo: opt(formData.get('codigo')), p_tipo: 'entrada',
    p_donante: null, p_nota: null,
  });
  if (error) throw new Error('No se pudo ingresar: ' + error.message);
  // El mínimo solo lo fijan los gestores; best-effort (los voluntarios lo omiten).
  const minimo = Math.max(0, num(formData.get('minimo')));
  if (minimo > 0) {
    await supabase.from('inventario_acopio').update({ minimo })
      .eq('punto_id', puntoId).eq('producto', producto);
  }
  rev(puntoId);
}

/** Registra una donación (entrada marcada como donación, con donante). */
export async function registrarDonacion(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await userCtx();
  const producto = txt(formData.get('producto'));
  if (!producto) throw new Error('Indica el producto donado.');
  const { error } = await supabase.rpc('sumar_stock', {
    p_punto: puntoId, p_producto: producto,
    p_cantidad: Math.max(0, num(formData.get('cantidad'))),
    p_categoria: opt(formData.get('categoria')), p_unidad: opt(formData.get('unidad')),
    p_codigo: null, p_tipo: 'donacion',
    p_donante: opt(formData.get('donante')), p_nota: opt(formData.get('nota')),
  });
  if (error) throw new Error('No se pudo registrar la donación: ' + error.message);
  rev(puntoId);
}

/** Registra una SALIDA / consumo (descuenta y deja asiento). Solo gestores. */
export async function registrarSalida(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase, user } = await ctx(puntoId);
  const id = txt(formData.get('item_id'));
  const cant = Math.max(0, num(formData.get('cantidad')));
  if (cant <= 0) throw new Error('Indica cuánto sale.');
  const { data: it } = await supabase.from('inventario_acopio').select('producto, cantidad, unidad').eq('id', id).single();
  if (!it) throw new Error('Producto no encontrado.');
  const salida = Math.min(cant, Number(it.cantidad || 0));
  const nueva = Math.max(0, Number(it.cantidad || 0) - salida);
  const { error } = await supabase.from('inventario_acopio')
    .update({ cantidad: nueva, actualizado_por: user.id, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo registrar la salida: ' + error.message);
  await supabase.from('movimientos_acopio').insert({
    punto_id: puntoId, item_id: id, producto: it.producto, tipo: 'salida',
    cantidad: salida, unidad: it.unidad, nota: opt(formData.get('motivo')), actor_id: user.id,
  });
  rev(puntoId);
}

/** Traspasa stock de este centro a otro (RPC: descuenta origen, suma destino). */
export async function traspasarStock(formData: FormData) {
  const origen = txt(formData.get('punto_id'));
  const destino = txt(formData.get('destino'));
  const { supabase } = await ctx(origen);
  const producto = txt(formData.get('producto'));
  if (!destino) throw new Error('Elige el centro de destino.');
  const { error } = await supabase.rpc('traspasar_stock', {
    p_origen: origen, p_destino: destino, p_producto: producto,
    p_cantidad: Math.max(0, num(formData.get('cantidad'))), p_nota: opt(formData.get('nota')),
  });
  if (error) throw new Error('No se pudo traspasar: ' + error.message);
  rev(origen); rev(destino);
}

/** Fija el mínimo (alerta de bajo stock) de un producto. Solo gestores. */
export async function fijarMinimo(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase, user } = await ctx(puntoId);
  const { error } = await supabase.from('inventario_acopio')
    .update({ minimo: Math.max(0, num(formData.get('minimo'))), actualizado_por: user.id }).eq('id', txt(formData.get('item_id')));
  if (error) throw new Error('No se pudo guardar el mínimo: ' + error.message);
  rev(puntoId);
}

/** Ajusta la cantidad por un delta (+/-), sin bajar de 0. Corrección rápida
 *  (no deja asiento en la bitácora; para eso están Ingresar/Salida/Traspaso). */
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

/** Fija la cantidad exacta (conteo físico). Solo gestores. */
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
