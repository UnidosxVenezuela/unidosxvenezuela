'use server';
// Guarda un listado digitalizado: crea el listado, sube el documento escaneado
// (bucket privado 'digitalizacion') y registra las personas YA CONFIRMADAS por
// el usuario (línea por línea en el asistente). El OCR corre en el navegador.
// La RLS (0080) impone la frontera por tipo de lugar y la 2ª verificación.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { subirArchivo } from '@/lib/storage';
import { redirigirOk } from '@/lib/flash';
import { validarArchivo } from '@/lib/validaciones';
import type { Rol } from '@unidos/types';

const TIPOS = ['hospital', 'albergue', 'acopio', 'otro'];
const COND = ['herido', 'refugiado', 'fallecido', 'sano', 'desconocida', 'otro'];

function txt(v: FormDataEntryValue | null | undefined) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null | undefined) { const s = txt(v); return s ? s : null; }
function numOpt(v: string) { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; }

async function exigirDigitalizar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra, verificado').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  const esAdmin = roles.includes('admin');
  // El Admin de Verificaciones digitaliza en su área (con su 2ª verificación aprobada).
  const esDig = roles.includes('digitalizador') || roles.includes('admin_verificacion');
  if (!yo?.verificado || (!esAdmin && !esDig)) throw new Error('No tienes permiso para digitalizar.');
  // El digitalizador necesita la 2ª verificación (identidad) aprobada; admin exento.
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') throw new Error('Necesitas tu segunda verificación aprobada para digitalizar.');
  }
  return { supabase, user };
}

export async function guardarListado(formData: FormData) {
  const tipoLugar = txt(formData.get('tipo_lugar')) || 'otro';
  if (!TIPOS.includes(tipoLugar)) throw new Error('Tipo de lugar no válido.');
  const { supabase, user } = await exigirDigitalizar();

  const lugarNombre = txt(formData.get('lugar_nombre'));
  if (!lugarNombre) throw new Error('Indica el nombre del lugar.');

  // Personas confirmadas (JSON desde el asistente).
  let filas: any[] = [];
  try { filas = JSON.parse(String(formData.get('personas') ?? '[]')); } catch { filas = []; }
  const personas = (Array.isArray(filas) ? filas : [])
    .map((f) => ({
      nombre_completo: txt(f?.nombre).slice(0, 160),
      cedula: (txt(f?.cedula).replace(/\D/g, '') || null),
      edad: (() => { const n = parseInt(txt(f?.edad), 10); return Number.isFinite(n) && n >= 0 && n <= 130 ? n : null; })(),
      condicion: COND.includes(f?.condicion) ? f.condicion : 'otro',
      notas: opt(f?.notas),
      confianza: (() => { const n = Number(f?.confianza); return Number.isFinite(n) ? Math.round(n) : null; })(),
    }))
    .filter((p) => p.nombre_completo.length > 1)
    .slice(0, 300);
  if (personas.length === 0) throw new Error('No hay personas confirmadas para guardar.');

  const lat = numOpt(txt(formData.get('lat')));
  const lng = numOpt(txt(formData.get('lng')));
  const punto = tipoLugar === 'acopio' ? opt(formData.get('punto_acopio_id')) : null;

  // 1) Resolver el LUGAR (punto del mapa): lo crea si no existe (pendiente de
  //    llenado) o lo asocia (pendiente de verificar). Devuelve el id del lugar.
  let lugarId: string | null = null;
  const { data: lid } = await supabase.rpc('resolver_lugar', {
    p_tipo: tipoLugar, p_nombre: lugarNombre, p_lat: lat, p_lng: lng, p_punto_acopio_id: punto,
  });
  if (typeof lid === 'string') lugarId = lid;

  // 2) Crear el listado (anclado a su lugar).
  const { data: creado, error: eL } = await supabase.from('listados_digitalizados').insert({
    tipo_lugar: tipoLugar,
    lugar_nombre: lugarNombre,
    lugar_id: lugarId,
    punto_acopio_id: punto,
    lat, lng,
    notas: opt(formData.get('notas')),
    creado_por: user.id,
  }).select('id').single();
  if (eL) throw new Error('No se pudo crear el listado: ' + eL.message);
  const listadoId = creado!.id as string;

  // 3) Subir el documento escaneado (respaldo; no bloquea el guardado).
  const doc = formData.get('documento');
  if (doc instanceof File && doc.size > 0) {
    const v = validarArchivo(doc.name, doc.size, 15);
    if (v.ok) {
      const safe = doc.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const ruta = `${listadoId}/${Date.now()}-${safe}`;
      try {
        await subirArchivo(supabase, 'digitalizacion', ruta, doc, { publico: false, upsert: false });
        await supabase.from('listados_digitalizados').update({ documento_path: ruta }).eq('id', listadoId);
      } catch { /* respaldo opcional */ }
    }
  }

  // 4) Insertar las personas confirmadas.
  const { error: eP } = await supabase.from('personas_listado').insert(
    personas.map((p) => ({ ...p, listado_id: listadoId, creado_por: user.id })),
  );
  if (eP) throw new Error('Se creó el listado pero fallaron las personas: ' + eP.message);

  revalidatePath('/digitalizacion');
  redirigirOk('/digitalizacion', `Guardado: ${personas.length} personas en ${lugarNombre}`);
}

// ── Moderación de lugares (solo admin) ──
const TIPOS_LUGAR_MOD = ['hospital', 'albergue', 'acopio', 'otro'];

async function exigirAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin')) throw new Error('Solo un administrador puede moderar lugares.');
  return { supabase, user };
}

// Admin completa/corrige los datos de un lugar (nombre, tipo, ubicación, dirección).
export async function actualizarLugar(formData: FormData) {
  const { supabase } = await exigirAdmin();
  const id = txt(formData.get('id'));
  const tipo = txt(formData.get('tipo'));
  const nombre = txt(formData.get('nombre'));
  if (!id || !nombre) throw new Error('Faltan datos del lugar.');
  const { error } = await supabase.from('lugares').update({
    tipo: TIPOS_LUGAR_MOD.includes(tipo) ? tipo : 'otro',
    nombre,
    direccion: opt(formData.get('direccion')),
    lat: numOpt(txt(formData.get('lat'))),
    lng: numOpt(txt(formData.get('lng'))),
    notas: opt(formData.get('notas')),
    actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo guardar el lugar: ' + error.message);
  revalidatePath('/digitalizacion/lugares'); revalidatePath('/mapa');
  redirigirOk('/digitalizacion/lugares', 'Lugar actualizado');
}

// Admin da por verificado un lugar (datos correctos y la data corresponde).
export async function verificarLugar(formData: FormData) {
  const { supabase, user } = await exigirAdmin();
  const id = txt(formData.get('id'));
  const { error } = await supabase.from('lugares').update({
    estado: 'verificado', verificado_por: user.id, verificado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo verificar el lugar: ' + error.message);
  revalidatePath('/digitalizacion/lugares'); revalidatePath('/mapa');
  redirigirOk('/digitalizacion/lugares', 'Lugar verificado');
}
