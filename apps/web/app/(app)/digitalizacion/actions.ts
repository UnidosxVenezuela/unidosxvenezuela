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
const TIPOS_BUSQUEDA = ['hospital', 'albergue', 'otro'];
const TIPOS_LOGISTICA = ['acopio', 'albergue'];

function txt(v: FormDataEntryValue | null | undefined) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null | undefined) { const s = txt(v); return s ? s : null; }
function numOpt(v: string) { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; }

async function exigirDigitalizar(tipoLugar: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra, verificado').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  const esAdmin = roles.includes('admin');
  const esBusq = roles.includes('busqueda');
  const esLog = roles.includes('logistica');
  if (!yo?.verificado || (!esAdmin && !esBusq && !esLog)) throw new Error('No tienes permiso para digitalizar.');
  if (!esAdmin) {
    let permitido = false;
    if (esBusq && TIPOS_BUSQUEDA.includes(tipoLugar)) {
      const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user.id).maybeSingle();
      permitido = (vi as any)?.estado === 'aprobada';
    }
    if (esLog && TIPOS_LOGISTICA.includes(tipoLugar)) permitido = true;
    if (!permitido) throw new Error('No puedes digitalizar listados de ese tipo de lugar (o te falta la segunda verificación).');
  }
  return { supabase, user };
}

export async function guardarListado(formData: FormData) {
  const tipoLugar = txt(formData.get('tipo_lugar')) || 'otro';
  if (!TIPOS.includes(tipoLugar)) throw new Error('Tipo de lugar no válido.');
  const { supabase, user } = await exigirDigitalizar(tipoLugar);

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

  // 1) Crear el listado.
  const { data: creado, error: eL } = await supabase.from('listados_digitalizados').insert({
    tipo_lugar: tipoLugar,
    lugar_nombre: lugarNombre,
    punto_acopio_id: tipoLugar === 'acopio' ? opt(formData.get('punto_acopio_id')) : null,
    lat: numOpt(txt(formData.get('lat'))),
    lng: numOpt(txt(formData.get('lng'))),
    notas: opt(formData.get('notas')),
    creado_por: user.id,
  }).select('id').single();
  if (eL) throw new Error('No se pudo crear el listado: ' + eL.message);
  const listadoId = creado!.id as string;

  // 2) Subir el documento escaneado (respaldo; no bloquea el guardado).
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

  // 3) Insertar las personas confirmadas.
  const { error: eP } = await supabase.from('personas_listado').insert(
    personas.map((p) => ({ ...p, listado_id: listadoId, creado_por: user.id })),
  );
  if (eP) throw new Error('Se creó el listado pero fallaron las personas: ' + eP.message);

  revalidatePath('/digitalizacion');
  redirigirOk('/digitalizacion', `Guardado: ${personas.length} personas en ${lugarNombre}`);
}
