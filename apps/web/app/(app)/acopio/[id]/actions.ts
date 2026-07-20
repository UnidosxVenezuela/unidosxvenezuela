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

/** Registra una SALIDA / consumo. RPC atómica: bloquea la fila, descuenta (con
 *  clamp a lo disponible) y deja el asiento 'salida' en la misma transacción. */
export async function registrarSalida(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await ctx(puntoId);
  const cant = Math.max(0, num(formData.get('cantidad')));
  if (cant <= 0) throw new Error('Indica cuánto sale.');
  const { error } = await supabase.rpc('registrar_salida', {
    p_punto: puntoId, p_item: txt(formData.get('item_id')),
    p_cantidad: cant, p_motivo: opt(formData.get('motivo')),
  });
  if (error) throw new Error('No se pudo registrar la salida: ' + error.message);
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

// ── Solicitudes de traspaso (pedir stock a otro centro) ──
/** Crea una solicitud: pido `producto` al centro `origen`; lo recibe ESTE centro. */
export async function solicitarTraspaso(formData: FormData) {
  const puntoId = txt(formData.get('punto_id')); // destino (recibe) = este centro
  const { supabase, user } = await ctx(puntoId);
  const origen = txt(formData.get('origen'));
  const producto = txt(formData.get('producto'));
  const cantidad = Math.max(0, num(formData.get('cantidad')));
  if (!origen) throw new Error('Elige a qué centro se lo pides.');
  if (origen === puntoId) throw new Error('El origen y el destino deben ser distintos.');
  if (!producto) throw new Error('Indica el producto.');
  if (cantidad <= 0) throw new Error('Indica la cantidad.');
  const { error } = await supabase.from('solicitudes_traspaso').insert({
    origen_id: origen, destino_id: puntoId, producto, cantidad,
    nota: opt(formData.get('nota')), solicitante_id: user.id,
  });
  if (error) throw new Error('No se pudo enviar la solicitud: ' + error.message);
  rev(puntoId);
}

/** Aprueba una solicitud recibida (ejecuta el traspaso). Solo el líder del origen. */
export async function aprobarSolicitud(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await ctx(puntoId);
  const { error } = await supabase.rpc('aprobar_solicitud_traspaso', { p_solicitud: txt(formData.get('solicitud_id')) });
  if (error) throw new Error('No se pudo aprobar: ' + error.message);
  rev(puntoId);
}

/** Rechaza (origen) o cancela (solicitante) una solicitud pendiente. */
export async function resolverSolicitud(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await ctx(puntoId);
  const estado = txt(formData.get('estado')) === 'cancelada' ? 'cancelada' : 'rechazada';
  const { error } = await supabase.rpc('resolver_solicitud_traspaso', { p_solicitud: txt(formData.get('solicitud_id')), p_estado: estado });
  if (error) throw new Error('No se pudo actualizar: ' + error.message);
  rev(puntoId);
}

// ── Importar inventario desde CSV (solo gestores del centro) ──
function normH(h: string) { return h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function pick(rec: Record<string, string>, keys: string[]) { for (const k of keys) { const v = rec[k]; if (v != null && v.trim() !== '') return v.trim(); } return ''; }
function numRec(v: string) { const n = Number(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }

/** Divide el CSV en filas respetando comillas ("a,b" y "" escapado). */
function parseFilas(s: string, delim: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let q = false; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseCsv(text: string): Record<string, string>[] {
  const s = text.replace(/^﻿/, '');
  const nl = s.indexOf('\n'); const first = nl >= 0 ? s.slice(0, nl) : s;
  const c = (first.match(/,/g) ?? []).length, sc = (first.match(/;/g) ?? []).length, tab = (first.match(/\t/g) ?? []).length;
  const delim = sc > c && sc >= tab ? ';' : tab > c ? '\t' : ',';
  const rows = parseFilas(s, delim);
  if (rows.length < 2) return [];
  const header = (rows[0] ?? []).map(normH);
  return rows.slice(1).map((r) => { const rec: Record<string, string> = {}; header.forEach((h, i) => { rec[h] = (r[i] ?? '').trim(); }); return rec; });
}

export async function importarInventario(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase, user } = await ctx(puntoId);
  const file = formData.get('archivo');
  if (!(file instanceof File) || file.size === 0) throw new Error('Elige un archivo CSV.');
  if (file.size > 2_000_000) throw new Error('El archivo es demasiado grande (máx 2 MB).');
  const modo = txt(formData.get('modo')) === 'reemplazar' ? 'reemplazar' : 'sumar';
  const filas = parseCsv(await file.text());
  if (filas.length === 0) throw new Error('El CSV está vacío o le falta el encabezado (p. ej. Producto, Cantidad, Unidad…).');
  let n = 0;
  for (const rec of filas.slice(0, 2000)) {
    const producto = pick(rec, ['producto', 'nombre']);
    if (!producto) continue;
    const cantidad = Math.max(0, numRec(pick(rec, ['cantidad', 'cant', 'existencia', 'stock'])));
    const categoria = pick(rec, ['categoria']) || null;
    const unidad = pick(rec, ['unidad']) || null;
    const codigo = pick(rec, ['codigo']) || null;
    const minimo = Math.max(0, numRec(pick(rec, ['minimo', 'min'])));
    const { data: ex } = await supabase.from('inventario_acopio')
      .select('id, cantidad').eq('punto_id', puntoId).eq('producto', producto).maybeSingle();
    const prev = Number(ex?.cantidad ?? 0);
    const finalCant = modo === 'reemplazar' ? cantidad : prev + cantidad;
    let itemId = (ex?.id as string | undefined) ?? undefined;
    if (ex) {
      await supabase.from('inventario_acopio').update({
        cantidad: finalCant,
        ...(categoria ? { categoria } : {}), ...(unidad ? { unidad } : {}),
        ...(codigo ? { codigo } : {}), ...(minimo > 0 ? { minimo } : {}),
        actualizado_por: user.id, actualizado_en: new Date().toISOString(),
      }).eq('id', ex.id);
    } else {
      const { data: ins } = await supabase.from('inventario_acopio').insert({
        punto_id: puntoId, producto, categoria, unidad: unidad || 'unidades',
        codigo, cantidad: finalCant, minimo, actualizado_por: user.id,
      }).select('id').single();
      itemId = ins?.id;
    }
    const mag = modo === 'reemplazar' ? Math.abs(finalCant - prev) : cantidad;
    if (mag > 0 || !ex) {
      await supabase.from('movimientos_acopio').insert({
        punto_id: puntoId, item_id: itemId ?? null, producto,
        tipo: modo === 'reemplazar' ? 'ajuste' : 'entrada',
        cantidad: mag, unidad, nota: 'importación CSV', actor_id: user.id,
      });
    }
    n++;
  }
  rev(puntoId);
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

/** Ajusta la cantidad por un delta (+/-), sin bajar de 0. RPC atómica: bloquea la
 *  fila y AHORA SÍ deja un asiento 'ajuste' con el delta aplicado (ledger fiel). */
export async function ajustarCantidad(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await ctx(puntoId);
  const { error } = await supabase.rpc('ajustar_stock', {
    p_punto: puntoId, p_item: txt(formData.get('item_id')),
    p_delta: num(formData.get('delta')), p_nota: opt(formData.get('motivo')),
  });
  if (error) throw new Error('No se pudo ajustar: ' + error.message);
  rev(puntoId);
}

/** Fija la cantidad exacta (conteo físico). RPC atómica: bloquea la fila y deja un
 *  asiento 'ajuste' con la corrección aplicada (vieja → nueva). Solo gestores. */
export async function fijarCantidad(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await ctx(puntoId);
  const { error } = await supabase.rpc('fijar_stock', {
    p_punto: puntoId, p_item: txt(formData.get('item_id')),
    p_cantidad: Math.max(0, num(formData.get('cantidad'))), p_nota: opt(formData.get('motivo')),
  });
  if (error) throw new Error('No se pudo guardar: ' + error.message);
  rev(puntoId);
}

/** Elimina un producto. RPC atómica: si tenía stock, deja un asiento 'ajuste' de baja
 *  en la bitácora (sobrevive con item_id null) antes de borrar el item. Solo gestores. */
export async function eliminarProducto(formData: FormData) {
  const puntoId = txt(formData.get('punto_id'));
  const { supabase } = await ctx(puntoId);
  const { error } = await supabase.rpc('eliminar_producto_acopio', {
    p_punto: puntoId, p_item: txt(formData.get('item_id')), p_nota: null,
  });
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
