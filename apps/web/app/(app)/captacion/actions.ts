'use server';
// Captación de Oportunidades (0129): crear/editar/mover/eliminar tarjetas de
// oportunidades. Lo gestionan el admin general y el rol 'captacion'. El archivo
// (foto/adjunto) va a un bucket privado con RLS. La autorización real la impone
// la RLS (puede_captacion); aquí se valida en la acción para dar buen error.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import { redirigirOk, redirigirError } from '@/lib/flash';
import { validarArchivo } from '@/lib/validaciones';
import type { Rol } from '@unidos/types';

const CATS = ['fundacion', 'organizacion', 'empresa', 'proyecto', 'alianza'];
const ESTADOS = ['investigacion', 'verificado', 'enviado'];

function txt(v: FormDataEntryValue | null | undefined) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null | undefined) { const s = txt(v); return s ? s : null; }
// Normaliza el enlace: si no trae esquema, se asume https (se muestra solo si es https).
function enlaceOpt(v: FormDataEntryValue | null | undefined) {
  let s = txt(v); if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s.slice(0, 500);
}

async function exigirCaptacion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin') && !roles.includes('captacion')) throw new Error('No tienes permiso para gestionar oportunidades.');
  return { supabase, user };
}

// Puente Captación → Donación-Ofrecimiento (0192): convierte esta entidad del CRM
// en un ofrecimiento conservando la procedencia, sin re-tipear. La RPC impone el
// permiso real y es idempotente (si ya existe, devuelve el mismo). Al crearse, el
// trigger de aviso (0144) notifica a Logística/Verificación.
export async function crearOfrecimientoDesdeCaptacion(formData: FormData) {
  const { supabase } = await exigirCaptacion();
  const id = txt(formData.get('id'));
  const { data, error } = await supabase.rpc('crear_ofrecimiento_desde_captacion', { p_oportunidad: id });
  if (error) {
    const m = (error.message || '').toLowerCase();
    if (error.code === 'PGRST202' || /crear_ofrecimiento_desde_captacion|schema cache|no existe la funci/.test(m)) {
      return redirigirError('/captacion/' + id, 'Aún no disponible (falta aplicar la migración 0192).');
    }
    return redirigirError('/captacion/' + id, 'No se pudo crear el ofrecimiento: ' + error.message);
  }
  const nuevoId = String(data ?? '');
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'ofrecimiento_desde_captacion', p_entidad: 'oportunidades_donacion', p_entidad_id: nuevoId, p_metadata: { captacion: id },
  });
  revalidatePath('/captacion/' + id); revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades/' + nuevoId, 'Ofrecimiento creado desde Captación');
}

// Sube el archivo opcional de una oportunidad (best-effort); devuelve la ruta o null.
async function subirArchivoOportunidad(supabase: any, id: string, archivo: FormDataEntryValue | null): Promise<string | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  const v = validarArchivo(archivo.name, archivo.size, 15);
  if (!v.ok) return null;
  const safe = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const ruta = `${id}/${Date.now()}-${safe}`;
  try {
    await subirArchivo(supabase, 'oportunidades', ruta, archivo, { publico: false, upsert: false });
    return ruta;
  } catch { return null; }
}

export async function crearOportunidad(formData: FormData) {
  const { supabase, user } = await exigirCaptacion();
  const categoria = txt(formData.get('categoria'));
  if (!CATS.includes(categoria)) throw new Error('Elige una categoría válida.');
  const titulo = txt(formData.get('titulo')).slice(0, 160);
  if (!titulo) throw new Error('Ponle un nombre a la oportunidad.');

  const { data: creado, error } = await supabase.from('oportunidades').insert({
    categoria,
    estado: 'investigacion',
    titulo,
    contacto: opt(formData.get('contacto')),
    enlace: enlaceOpt(formData.get('enlace')),
    ubicacion: opt(formData.get('ubicacion')),
    descripcion: opt(formData.get('descripcion')),
    creado_por: user.id,
  }).select('id').single();
  if (error) throw new Error('No se pudo crear la oportunidad: ' + error.message);
  const id = creado!.id as string;

  const ruta = await subirArchivoOportunidad(supabase, id, formData.get('archivo'));
  if (ruta) await supabase.from('oportunidades').update({ archivo_path: ruta }).eq('id', id);

  revalidatePath('/captacion');
  redirigirOk('/captacion', 'Oportunidad creada en Investigación.');
}

export async function editarOportunidad(formData: FormData) {
  const { supabase } = await exigirCaptacion();
  const id = txt(formData.get('id'));
  if (!id) throw new Error('Falta la oportunidad.');
  const categoria = txt(formData.get('categoria'));
  const titulo = txt(formData.get('titulo')).slice(0, 160);
  if (!CATS.includes(categoria)) throw new Error('Elige una categoría válida.');
  if (!titulo) throw new Error('El nombre no puede quedar vacío.');

  const patch: Record<string, any> = {
    categoria,
    titulo,
    contacto: opt(formData.get('contacto')),
    enlace: enlaceOpt(formData.get('enlace')),
    ubicacion: opt(formData.get('ubicacion')),
    descripcion: opt(formData.get('descripcion')),
    actualizado_en: new Date().toISOString(),
  };
  const ruta = await subirArchivoOportunidad(supabase, id, formData.get('archivo'));
  if (ruta) patch.archivo_path = ruta;

  const { error } = await supabase.from('oportunidades').update(patch).eq('id', id);
  if (error) throw new Error('No se pudo guardar: ' + error.message);
  revalidatePath('/captacion'); revalidatePath('/captacion/' + id);
  redirigirOk('/captacion/' + id, 'Oportunidad actualizada');
}

export async function cambiarEstadoOportunidad(formData: FormData) {
  const { supabase } = await exigirCaptacion();
  const id = txt(formData.get('id'));
  const estado = txt(formData.get('estado'));
  const volver = txt(formData.get('volver')) || '/captacion';
  if (!id || !ESTADOS.includes(estado)) throw new Error('Datos no válidos.');
  const { error } = await supabase.from('oportunidades').update({ estado, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo cambiar el estado: ' + error.message);
  revalidatePath('/captacion'); revalidatePath('/captacion/' + id);
  redirigirOk(volver, 'Estado actualizado a «' + estado + '».');
}

export async function eliminarOportunidad(formData: FormData) {
  const { supabase } = await exigirCaptacion();
  const id = txt(formData.get('id'));
  if (!id) throw new Error('Falta la oportunidad.');
  const { data: o } = await supabase.from('oportunidades').select('archivo_path').eq('id', id).maybeSingle();
  const path = (o as any)?.archivo_path as string | null;
  const { error } = await supabase.from('oportunidades').delete().eq('id', id);
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  if (path) { try { await borrarArchivo(supabase, 'oportunidades', [path]); } catch { /* archivo huérfano tolerable */ } }
  revalidatePath('/captacion');
  redirigirOk('/captacion', 'Oportunidad eliminada');
}
