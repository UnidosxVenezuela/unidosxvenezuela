'use server';
// Aliados y su CAPACIDAD (0224).
//
// Toda la escritura pasa por RPC SECURITY DEFINER: `proveedores` tiene `prov_gestion`
// (0050) como `for all` con `puede_logistica()`, así que Alianzas NO puede escribir la
// tabla directamente — y ampliar esa policy para que quepa otra área es justo lo que la
// doctrina de 0156/0213 prohíbe. `proveedor_capacidades` va más lejos: no tiene ninguna
// policy de escritura, solo la de SELECT. La puerta es siempre la RPC.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk, redirigirError } from '@/lib/flash';

const RUTA = '/alianzas/proveedores';

function txt(v: FormDataEntryValue | null | undefined) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null | undefined) { const s = txt(v); return s ? s : null; }
function fecha(v: FormDataEntryValue | null | undefined) {
  const s = txt(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
/** Acepta «50», «50,5» y «50.5»: en Venezuela la coma es el separador decimal. */
function numero(v: FormDataEntryValue | null | undefined): number | null {
  const s = txt(v).replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function exigirDepartamento() {
  const { user, perfil } = await requireUsuario();
  if (!user) redirect('/login');
  // Los HELPERS, nunca `rolesDe().includes(...)`: `puedeLogistica` incluye al mando del
  // grupo (0214), que la RLS sí reconoce y una lista de roles a mano dejaría fuera.
  if (!puedeAlianzas(perfil) && !puedeLogistica(perfil)) redirect('/dashboard');
  const supabase = await createClient();
  return { supabase, perfil };
}

/** ¿El error viene de que 0224 aún no está aplicada? (molde 0192/0199/0217) */
function faltaMigracion(error: { code?: string; message?: string } | null): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return error?.code === 'PGRST202' || error?.code === '42P01' ||
    /guardar_proveedor|guardar_capacidad_proveedor|eliminar_capacidad_proveedor|crear_proveedor_desde_oportunidad|proveedor_capacidades|capacidades_de_proveedor|schema cache|no existe la funci/.test(m);
}

const SIN_MIGRACION =
  'Falta aplicar la migración 0224 (capacidad de proveedores) en esta base de datos.';

// ── El aliado ──────────────────────────────────────────────────────────────────
export async function guardarProveedorAliado(formData: FormData) {
  const { supabase } = await exigirDepartamento();
  const id = opt(formData.get('id'));
  const volver = id ? RUTA + '/' + id : RUTA;

  const nombre = txt(formData.get('nombre'));
  if (!id && !nombre) return redirigirError(volver, 'El nombre del aliado es obligatorio.');

  const { data, error } = await supabase.rpc('guardar_proveedor', {
    p_id: id,
    p_nombre: nombre || null,
    p_tipo: opt(formData.get('tipo')),
    p_contacto: opt(formData.get('contacto')),
    p_notas: opt(formData.get('notas')),
    p_oportunidad: opt(formData.get('oportunidad_id')),
    p_activo: txt(formData.get('activo')) !== 'false',
  });
  if (error) return redirigirError(volver, faltaMigracion(error) ? SIN_MIGRACION : error.message);

  revalidatePath(RUTA);
  revalidatePath('/insumos/proveedores');
  return redirigirOk(RUTA + '/' + (id ?? data), id ? 'Aliado actualizado' : 'Aliado registrado');
}

/** El puente con el CRM: la entidad que Alianzas CONCRETÓ pasa a ser proveedor. */
export async function concretarAliadoDesdeCrm(formData: FormData) {
  const { supabase } = await exigirDepartamento();
  const oportunidad = txt(formData.get('oportunidad_id'));
  if (!oportunidad) return redirigirError(RUTA, 'Elige la entidad del CRM que se concretó.');

  const { data, error } = await supabase.rpc('crear_proveedor_desde_oportunidad', {
    p_oportunidad: oportunidad,
  });
  if (error) return redirigirError(RUTA, faltaMigracion(error) ? SIN_MIGRACION : error.message);

  revalidatePath(RUTA);
  revalidatePath('/insumos/proveedores');
  return redirigirOk(RUTA + '/' + data,
    'Aliado concretado. Ahora declara con qué puede colaborar para que Logística sepa con qué cuenta.');
}

export async function cambiarActivoProveedor(formData: FormData) {
  const { supabase } = await exigirDepartamento();
  const id = txt(formData.get('id'));
  const activo = txt(formData.get('activo')) === 'true';

  const { error } = await supabase.rpc('guardar_proveedor', {
    p_id: id,
    p_nombre: opt(formData.get('nombre')),
    p_tipo: opt(formData.get('tipo')),
    p_contacto: opt(formData.get('contacto')),
    p_notas: opt(formData.get('notas')),
    p_oportunidad: opt(formData.get('oportunidad_id')),
    p_activo: activo,
  });
  if (error) return redirigirError(RUTA + '/' + id, faltaMigracion(error) ? SIN_MIGRACION : error.message);

  revalidatePath(RUTA);
  revalidatePath(RUTA + '/' + id);
  revalidatePath('/insumos/proveedores');
  return redirigirOk(RUTA + '/' + id, activo
    ? 'Aliado reactivado: Logística vuelve a contar con su capacidad.'
    : 'Aliado dado de baja: su capacidad deja de contarse (la historia se conserva).');
}

// ── La capacidad ───────────────────────────────────────────────────────────────
export async function guardarCapacidad(formData: FormData) {
  const { supabase } = await exigirDepartamento();
  const proveedor = txt(formData.get('proveedor_id'));
  const volver = RUTA + '/' + proveedor;

  const descripcion = txt(formData.get('descripcion'));
  const cantidad = numero(formData.get('cantidad'));
  if (!descripcion) return redirigirError(volver, 'Describe QUÉ puede cubrir (por ejemplo: «comidas calientes»).');
  if (cantidad === null || cantidad <= 0) {
    return redirigirError(volver, 'Indica CUÁNTO puede cubrir (una cantidad mayor que cero).');
  }

  const desde = fecha(formData.get('vigencia_desde'));
  const hasta = fecha(formData.get('vigencia_hasta'));
  if (desde && hasta && hasta < desde) {
    return redirigirError(volver, 'La fecha de fin no puede ser anterior a la de inicio.');
  }

  const { error } = await supabase.rpc('guardar_capacidad_proveedor', {
    p_id: opt(formData.get('id')),
    p_proveedor: proveedor || null,
    p_tipo: txt(formData.get('tipo')) || 'otro',
    p_descripcion: descripcion,
    p_cantidad: cantidad,
    p_unidad: opt(formData.get('unidad')),
    p_periodicidad: txt(formData.get('periodicidad')) || 'unica',
    p_vigencia_desde: desde,
    p_vigencia_hasta: hasta,
    p_notas: opt(formData.get('notas')),
    p_activa: txt(formData.get('activa')) !== 'false',
  });
  if (error) return redirigirError(volver, faltaMigracion(error) ? SIN_MIGRACION : error.message);

  revalidatePath(volver);
  revalidatePath(RUTA);
  revalidatePath('/insumos/proveedores');
  return redirigirOk(volver, opt(formData.get('id')) ? 'Capacidad actualizada' : 'Capacidad declarada');
}

export async function retirarCapacidad(formData: FormData) {
  const { supabase } = await exigirDepartamento();
  const proveedor = txt(formData.get('proveedor_id'));
  const volver = RUTA + '/' + proveedor;

  const { data, error } = await supabase.rpc('eliminar_capacidad_proveedor', {
    p_capacidad: txt(formData.get('id')),
  });
  if (error) return redirigirError(volver, faltaMigracion(error) ? SIN_MIGRACION : error.message);

  revalidatePath(volver);
  revalidatePath(RUTA);
  revalidatePath('/insumos/proveedores');
  // La RPC no borra si ya se consumió algo contra la capacidad: la retira, para no perder
  // de qué compromiso salió lo entregado.
  return redirigirOk(volver, data === 'retirada'
    ? 'Capacidad retirada. Se conserva porque ya hubo entregas ligadas a ella.'
    : 'Capacidad eliminada.');
}
