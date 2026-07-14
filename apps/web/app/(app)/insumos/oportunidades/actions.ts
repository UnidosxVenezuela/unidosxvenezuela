'use server';
// Donaciones e Insumos — Donación-Ofrecimiento (0141): registrar ofertas,
// llevar el pipeline de contacto (bitácora), emparejarlas con las solicitudes que
// encajan y concretarlas en una donación. La RLS es la fuente de verdad:
// cualquier verificado crea la SUYA; la gestión (estado/asignar/conectar/borrar)
// es de Logística. Aquí se valida en la acción para dar un buen mensaje de error.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk, redirigirError } from '@/lib/flash';
import { puedeLogistica, puedeRegistrarOportunidad, puedeVerificar } from '@/lib/auth';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import { validarArchivo } from '@/lib/validaciones';
import { TIPOS_OFERTA, TIPOS_INSUMO, ESTADOS_OFERTA, CANALES, CLASES_OFERTA, ORIGENES_OFERTA } from '@/lib/constantes';
import type { Rol } from '@unidos/types';

const ESTADOS_TODOS = [...ESTADOS_OFERTA, 'descartada'];
const RESULTADOS = ['positivo', 'pendiente', 'sin_respuesta', 'negativo'];

function txt(v: FormDataEntryValue | null | undefined) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null | undefined) { const s = txt(v); return s ? s : null; }
function numOpt(v: FormDataEntryValue | null | undefined) {
  const s = txt(v); if (!s) return null;
  const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : null;
}
// Normaliza el enlace: si no trae esquema, se asume https (se muestra solo si es https).
function enlaceOpt(v: FormDataEntryValue | null | undefined) {
  let s = txt(v); if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s.slice(0, 500);
}
// Detecta el error de «columna inexistente» de clase/origen (0152). Si esa migración
// aún no se aplicó, permite reintentar el insert sin esos campos para que registrar un
// ofrecimiento NUNCA se bloquee (mismo criterio que faltanColumnasPunto en casos).
function faltanColumnasOfrecimiento(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703') return true; // undefined_column
  const m = (error.message || '').toLowerCase();
  return /(clase|origen)/.test(m) && /does not exist|no existe|column/.test(m);
}

async function perfilActual() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  return { supabase, user, perfil: (yo ?? {}) as { rol?: Rol | null; roles_extra?: Rol[] | null } };
}
async function exigirRegistro() {
  const { supabase, user, perfil } = await perfilActual();
  if (!puedeRegistrarOportunidad(perfil)) throw new Error('No tienes permiso para registrar un Donación-Ofrecimiento.');
  return { supabase, user };
}
async function exigirLogistica() {
  const { supabase, user, perfil } = await perfilActual();
  if (!puedeLogistica(perfil)) throw new Error('Solo el equipo de Logística puede gestionar esta oportunidad.');
  return { supabase, user };
}
// Gestión compartida Logística + Verificación (bitácora, adjuntos, edición).
async function exigirGestionOferta() {
  const { supabase, user, perfil } = await perfilActual();
  if (!puedeLogistica(perfil) && !puedeVerificar(perfil)) {
    throw new Error('Solo Logística o Verificación pueden gestionar este ofrecimiento.');
  }
  return { supabase, user };
}
// Sube imágenes/archivos del ofrecimiento a la carpeta 'oportunidades' del bucket 'adjuntos'
// (0160) y registra cada uno en oportunidad_adjuntos. Un adjunto fallido no bloquea el resto.
async function subirAdjuntosOferta(supabase: any, oportunidadId: string, userId: string, files: FormDataEntryValue[]) {
  const archivos = files.filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of archivos.slice(0, 10)) {
    const val = validarArchivo(file.name, file.size, 10);
    if (!val.ok) continue;
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const ruta = `oportunidades/${oportunidadId}/${Date.now()}-${safe}`;
    try {
      await subirArchivo(supabase, 'adjuntos', ruta, file, { publico: false, upsert: false });
      const { error } = await supabase.from('oportunidad_adjuntos').insert({
        oportunidad_id: oportunidadId, url: ruta, nombre: file.name, mime: file.type || null, creado_por: userId,
      });
      if (error) await borrarArchivo(supabase, 'adjuntos', [ruta]);
    } catch { /* un adjunto fallido no bloquea */ }
  }
}

// ── Alta de la oferta (Logística o Recopilación) ──
export async function crearOportunidad(formData: FormData) {
  const { supabase, user } = await exigirRegistro();
  const organizacion = txt(formData.get('organizacion')).slice(0, 160);
  if (!organizacion) throw new Error('Indica quién ofrece la ayuda (organización, proyecto o persona).');
  const tipo_oferta = txt(formData.get('tipo_oferta'));
  if (!TIPOS_OFERTA.includes(tipo_oferta)) throw new Error('Elige un tipo de oferta válido.');
  // Qué se ofrece (0152): Donación (bienes) o Servicio de ayuda o atención.
  const claseRaw = txt(formData.get('clase'));
  const clase = CLASES_OFERTA.includes(claseRaw) ? claseRaw : 'donacion';
  // Quién ofrece (0152): centro de acopio / persona / organización (opcional).
  const origenRaw = txt(formData.get('origen'));
  const origen = ORIGENES_OFERTA.includes(origenRaw) ? origenRaw : null;
  const cubre_tipos = formData.getAll('cubre_tipos').map(String).filter((t) => TIPOS_INSUMO.includes(t));

  const fila: Record<string, unknown> = {
    organizacion,
    contacto: opt(formData.get('contacto')),
    clase,
    origen,
    tipo_oferta,
    cubre_tipos,
    descripcion: opt(formData.get('descripcion')),
    monto_estimado: numOpt(formData.get('monto_estimado')),
    ubicacion: opt(formData.get('ubicacion')),
    enlace: enlaceOpt(formData.get('enlace')),
    creado_por: user.id,
  };
  let { data: creado, error } = await supabase.from('oportunidades_donacion').insert(fila).select('id').single();
  // Si la migración 0152 aún no está aplicada, reintenta sin clase/origen.
  if (error && faltanColumnasOfrecimiento(error)) {
    const base = { ...fila }; delete base.clase; delete base.origen;
    ({ data: creado, error } = await supabase.from('oportunidades_donacion').insert(base).select('id').single());
  }
  if (error) throw new Error('No se pudo registrar el ofrecimiento: ' + error.message);
  revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades/' + creado!.id, 'Oportunidad registrada. 💛');
}

// ── Pipeline de estado (Logística) ──
export async function cambiarEstadoOportunidad(formData: FormData) {
  const { supabase } = await exigirLogistica();
  const id = txt(formData.get('id'));
  const estado = txt(formData.get('estado'));
  const volver = txt(formData.get('volver')) || '/insumos/oportunidades';
  if (!id || !ESTADOS_TODOS.includes(estado)) throw new Error('Datos no válidos.');
  const { error } = await supabase.from('oportunidades_donacion')
    .update({ estado, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo cambiar el estado: ' + error.message);
  revalidatePath('/insumos/oportunidades'); revalidatePath('/insumos/oportunidades/' + id);
  redirigirOk(volver, 'Estado actualizado.');
}

// ── Asignar responsable (Logística) ──
export async function asignarOportunidad(formData: FormData) {
  const { supabase } = await exigirLogistica();
  const id = txt(formData.get('id'));
  if (!id) throw new Error('Falta la oportunidad.');
  const { error } = await supabase.from('oportunidades_donacion')
    .update({ asignado_a: opt(formData.get('asignado_a')), actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo asignar: ' + error.message);
  revalidatePath('/insumos/oportunidades/' + id);
  redirigirOk('/insumos/oportunidades/' + id, 'Responsable actualizado.');
}

// ── Bitácora de contacto (Logística y Verificación dejan notas) ──
export async function registrarContactoOportunidad(formData: FormData) {
  const { supabase, user } = await exigirGestionOferta();
  const oportunidad_id = txt(formData.get('oportunidad_id'));
  const contenido = txt(formData.get('contenido'));
  if (!oportunidad_id) throw new Error('Falta la oportunidad.');
  if (!contenido) throw new Error('Escribe qué se gestionó.');
  const canal = txt(formData.get('canal'));
  const resultado = txt(formData.get('resultado'));
  const { error } = await supabase.from('bitacora_oportunidad').insert({
    oportunidad_id,
    autor_id: user.id,
    contenido: contenido.slice(0, 2000),
    canal: CANALES.includes(canal) ? canal : null,
    resultado: RESULTADOS.includes(resultado) ? resultado : null,
  });
  if (error) throw new Error('No se pudo guardar la gestión: ' + error.message);
  revalidatePath('/insumos/oportunidades/' + oportunidad_id);
  redirigirOk('/insumos/oportunidades/' + oportunidad_id, 'Gestión registrada.');
}

export async function eliminarContactoOportunidad(formData: FormData) {
  const { supabase } = await exigirLogistica();
  const id = txt(formData.get('id'));
  const oportunidad_id = txt(formData.get('oportunidad_id'));
  if (!id) throw new Error('Falta la nota.');
  const { error } = await supabase.from('bitacora_oportunidad').delete().eq('id', id);
  if (error) throw new Error('No se pudo eliminar la nota: ' + error.message);
  revalidatePath('/insumos/oportunidades/' + oportunidad_id);
  redirigirOk('/insumos/oportunidades/' + oportunidad_id, 'Nota eliminada.');
}

// ── Emparejamiento: concreta la oferta en una donación ligada a una solicitud ──
// Crea una `donaciones` (donante = organización de la oferta, ligada por
// oportunidad_id) y avanza la oportunidad a «comprometida». Requiere Logística
// (la RLS de donaciones y de la oportunidad ya lo exige).
export async function conectarConSolicitud(formData: FormData) {
  const { supabase, user } = await exigirLogistica();
  const oportunidad_id = txt(formData.get('oportunidad_id'));
  const solicitud_id = txt(formData.get('solicitud_id'));
  if (!oportunidad_id || !solicitud_id) throw new Error('Elige la solicitud con la que conectar.');
  const { data: o, error: eo } = await supabase.from('oportunidades_donacion')
    .select('organizacion, tipo_oferta, monto_estimado, descripcion').eq('id', oportunidad_id).maybeSingle();
  if (eo || !o) throw new Error('No se encontró la oportunidad.');
  const oo = o as any;
  const esDinero = oo.tipo_oferta === 'dinero';
  const { error: ed } = await supabase.from('donaciones').insert({
    donante: oo.organizacion,
    tipo: esDinero ? 'dinero' : 'especie',
    descripcion: oo.descripcion,
    monto: esDinero ? oo.monto_estimado : null,
    estado: 'comprometida',
    solicitud_id,
    oportunidad_id,
    creado_por: user.id,
  });
  if (ed) throw new Error('No se pudo crear la donación: ' + ed.message);
  await supabase.from('oportunidades_donacion')
    .update({ estado: 'comprometida', actualizado_en: new Date().toISOString() }).eq('id', oportunidad_id);
  revalidatePath('/insumos/oportunidades/' + oportunidad_id);
  revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades/' + oportunidad_id, 'Donación conectada a la solicitud. 💛');
}

// ── Verificación de la oferta (equipo de Verificación) ──
// La autorización real la impone la RPC verificar_oportunidad_donacion (puede_verificar);
// aquí solo se enruta. No toca el pipeline de contacto de Logística.
export async function verificarOportunidad(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('id'));
  const estado = txt(formData.get('estado'));
  if (!id) throw new Error('Falta la oportunidad.');
  const { error } = await supabase.rpc('verificar_oportunidad_donacion', {
    p_id: id, p_estado: estado, p_nota: txt(formData.get('nota')).slice(0, 500) || null,
  });
  if (error) throw new Error('No se pudo registrar la verificación: ' + error.message);
  revalidatePath('/insumos/oportunidades'); revalidatePath('/insumos/oportunidades/' + id);
  redirigirOk('/insumos/oportunidades/' + id, 'Verificación registrada.');
}

// ── Eliminar la oportunidad (Logística) ──
export async function eliminarOportunidad(formData: FormData) {
  const { supabase } = await exigirLogistica();
  const id = txt(formData.get('id'));
  if (!id) throw new Error('Falta la oportunidad.');
  const { error } = await supabase.from('oportunidades_donacion').delete().eq('id', id);
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades', 'Oportunidad eliminada.');
}

// ── Editar el ofrecimiento (Verificación, Logística o el creador de Recopilación) ──
// Actualiza los datos + sube adjuntos nuevos. Editar retira el «requiere info» (0160),
// igual que al corregir una solicitud. La RLS (oportdon_update, 0160) impone el permiso.
export async function editarOportunidad(formData: FormData) {
  const { supabase, user, perfil } = await perfilActual();
  const id = txt(formData.get('id'));
  if (!id) throw new Error('Falta la oportunidad.');
  const volver = '/insumos/oportunidades/' + id;
  const { data: o } = await supabase.from('oportunidades_donacion').select('creado_por').eq('id', id).maybeSingle();
  const esCreador = (o as any)?.creado_por === user.id;
  if (!(puedeLogistica(perfil) || puedeVerificar(perfil) || (esCreador && puedeRegistrarOportunidad(perfil)))) {
    throw new Error('No tienes permiso para editar este ofrecimiento.');
  }
  const organizacion = txt(formData.get('organizacion')).slice(0, 160);
  if (!organizacion) throw new Error('Indica quién ofrece la ayuda.');
  const tipo_oferta = txt(formData.get('tipo_oferta'));
  const claseRaw = txt(formData.get('clase'));
  const origenRaw = txt(formData.get('origen'));
  const cubre_tipos = formData.getAll('cubre_tipos').map(String).filter((t) => TIPOS_INSUMO.includes(t));
  const cambios: Record<string, unknown> = {
    organizacion,
    contacto: opt(formData.get('contacto')),
    descripcion: opt(formData.get('descripcion')),
    monto_estimado: numOpt(formData.get('monto_estimado')),
    ubicacion: opt(formData.get('ubicacion')),
    enlace: enlaceOpt(formData.get('enlace')),
    cubre_tipos,
    info_requerida: null,   // al editar/corregir se retira el «requiere información»
    actualizado_en: new Date().toISOString(),
  };
  if (TIPOS_OFERTA.includes(tipo_oferta)) cambios.tipo_oferta = tipo_oferta;
  if (CLASES_OFERTA.includes(claseRaw)) cambios.clase = claseRaw;
  cambios.origen = ORIGENES_OFERTA.includes(origenRaw) ? origenRaw : null;

  let { error } = await supabase.from('oportunidades_donacion').update(cambios).eq('id', id);
  if (error && faltanColumnasOfrecimiento(error)) {
    const base = { ...cambios }; delete base.clase; delete base.origen;
    ({ error } = await supabase.from('oportunidades_donacion').update(base).eq('id', id));
  }
  if (error) throw new Error('No se pudo guardar: ' + error.message);
  await subirAdjuntosOferta(supabase, id, user.id, formData.getAll('archivos'));
  revalidatePath(volver); revalidatePath('/insumos/oportunidades');
  redirigirOk(volver, 'Ofrecimiento actualizado.');
}

// ── Devolver a Recopilación cuando falta información (Verificación) ──
// Espeja requerirInfoCaso (0142): fija info_requerida (dispara el aviso a quien lo
// registró, trigger 0160) y marca la verificación como «observada».
export async function requerirInfoOportunidad(formData: FormData) {
  const { supabase, perfil } = await perfilActual();
  if (!puedeVerificar(perfil)) throw new Error('Solo Verificación puede devolver un ofrecimiento a Recopilación.');
  const id = txt(formData.get('id'));
  const volver = '/insumos/oportunidades/' + id;
  const motivo = txt(formData.get('motivo')).slice(0, 500);
  if (!motivo) return redirigirError(volver, 'Indica qué información falta para poder verificar.');
  const { error } = await supabase.from('oportunidades_donacion')
    .update({ info_requerida: motivo, estado_verificacion: 'observada', actualizado_en: new Date().toISOString() })
    .eq('id', id);
  if (error) return redirigirError(volver, 'No se pudo devolver: ' + error.message);
  revalidatePath(volver); revalidatePath('/insumos/oportunidades');
  redirigirOk(volver, 'Devuelto a Recopilación. Se avisó a quien lo registró con el motivo.');
}

// ── Eliminar un adjunto del ofrecimiento (autor / admin / Logística, RLS oadj_delete) ──
export async function eliminarAdjuntoOportunidad(formData: FormData) {
  const { supabase } = await perfilActual();
  const adjuntoId = txt(formData.get('adjunto_id'));
  const oportunidad_id = txt(formData.get('oportunidad_id'));
  const { data: adj } = await supabase.from('oportunidad_adjuntos').select('url').eq('id', adjuntoId).maybeSingle();
  if ((adj as any)?.url) await borrarArchivo(supabase, 'adjuntos', [(adj as any).url]);
  const { error } = await supabase.from('oportunidad_adjuntos').delete().eq('id', adjuntoId);
  if (error) throw new Error('No se pudo eliminar el adjunto: ' + error.message);
  revalidatePath('/insumos/oportunidades/' + oportunidad_id);
  redirigirOk('/insumos/oportunidades/' + oportunidad_id, 'Adjunto eliminado.');
}
