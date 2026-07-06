'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import { redirigirOk } from '@/lib/flash';
import { analizarUrl, validarArchivo } from '@/lib/validaciones';
import { revisarSafeBrowsing } from '@/lib/safe-browsing';
import type { EstadoCaso, Rol } from '@unidos/types';

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }
function numOpt(v: FormDataEntryValue | null): number | null {
  const s = txt(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null;
}

// Valores válidos de los enums reutilizados (public.tipo_insumo, public.prioridad).
const TIPOS_INSUMO_VAL = ['medicamentos', 'alimentos', 'agua', 'higiene', 'refugio', 'otro'];
const PRIORIDADES_VAL = ['baja', 'media', 'alta', 'critica'];

// Campos de «solicitud de ayuda con ubicación» (Propuesta Fase 1). Si el bloque no
// está activo, DEVUELVE los campos en null/false (así al desmarcarlo se limpian).
// Un requerimiento exige ubicación y NUNCA es 'Desaparecidos' (frontera con Búsqueda);
// el CHECK de la BD (0112) es el respaldo.
function datosRequerimiento(formData: FormData, categoria: string | null) {
  const es = txt(formData.get('es_requerimiento')) === 'on';
  if (!es) {
    return { es_requerimiento: false, lat: null, lng: null, req_tipo: null, req_cantidad: null, req_urgencia: null };
  }
  if (categoria === 'Desaparecidos') {
    throw new Error('Un caso de «Desaparecidos» no puede marcarse como solicitud de ayuda con ubicación (esos van al Grupo de Búsqueda, no a Logística).');
  }
  const lat = numOpt(formData.get('lat'));
  const lng = numOpt(formData.get('lng'));
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Marca la ubicación en el mapa (toca o arrastra el pin).');
  }
  const tipo = opt(formData.get('req_tipo'));
  const urg = opt(formData.get('req_urgencia'));
  return {
    es_requerimiento: true,
    lat, lng,
    req_tipo: tipo && TIPOS_INSUMO_VAL.includes(tipo) ? tipo : null,
    req_cantidad: opt(formData.get('req_cantidad')),
    req_urgencia: urg && PRIORIDADES_VAL.includes(urg) ? urg : 'media',
  };
}

// Segunda línea de defensa para el enlace de la fuente: Google Safe Browsing
// (solo servidor). Fail-open: si no hay clave o la API falla, no bloquea (se
// apoya en el análisis heurístico local de analizarUrl).
async function exigirEnlaceSeguro(url: string | null | undefined) {
  const sb = await revisarSafeBrowsing(url);
  if (sb.revisado && !sb.seguro) {
    throw new Error(`El enlace de la fuente fue marcado como peligroso (${sb.amenaza}) por Google Safe Browsing. No se guardó; revisa la fuente antes de continuar.`);
  }
}

// soloVerificar=true → admin/verificador/busqueda (cambiar estado, notas, tomar).
// soloVerificar=false → crear: SOLO Gestión de casos (recopilación) o admin.
// Se evalúa el CONJUNTO de roles (principal + adicionales, sincronizados por grupo).
// La RLS aplica la frontera por categoría (verificador↔Otras, búsqueda↔Desaparecidos)
// y la 2ª verificación obligatoria; aquí solo filtramos el rol de forma temprana.
async function exigirCasos(soloVerificar: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra, verificado').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  const permitidos = soloVerificar
    ? ['admin', 'verificador', 'busqueda']
    : ['admin', 'recopilacion'];
  let ok = !!yo?.verificado && roles.some((r) => permitidos.includes(r as string));
  // El Admin de Verificaciones opera los casos de su área con su 2ª verificación
  // (identidad) aprobada. La RLS/RPC aplican el mismo criterio.
  if (!ok && yo?.verificado && roles.includes('admin_verificacion')) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user.id).maybeSingle();
    ok = (vi as any)?.estado === 'aprobada';
  }
  if (!ok) throw new Error('No tienes permisos para esta acción.');
  return { supabase, user };
}

export async function crearCaso(formData: FormData) {
  const { supabase, user } = await exigirCasos(false);
  const titulo = txt(formData.get('titulo'));
  if (!titulo) throw new Error('El título es obligatorio.');
  // Validar el enlace de la fuente (formato + seguridad heurística).
  const fuenteUrl = opt(formData.get('fuente_url'));
  const an = analizarUrl(fuenteUrl);
  if (!an.ok) throw new Error(an.motivo || 'El enlace de la fuente no es válido.');
  await exigirEnlaceSeguro(an.url ?? fuenteUrl);
  // Validar los archivos ANTES de crear el caso (tipo permitido + tamaño).
  const archivos = formData.getAll('archivos').filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of archivos.slice(0, 10)) {
    const v = validarArchivo(file.name, file.size, 10);
    if (!v.ok) throw new Error(v.motivo || 'Archivo no admitido.');
  }
  const categoria = opt(formData.get('categoria'));
  const { data, error } = await supabase.from('casos').insert({
    titulo,
    descripcion: opt(formData.get('descripcion')),
    categoria,
    fuente: opt(formData.get('fuente')),
    fuente_url: an.url ?? fuenteUrl,
    fecha_publicacion: opt(formData.get('fecha_publicacion')),
    // Nace «pendiente» (sin asignar) para «Otras informaciones»; los Desaparecidos
    // entran de una vez al flujo de Búsqueda, así que arrancan «en proceso».
    estado: categoria === 'Desaparecidos' ? 'en_proceso' : 'pendiente',
    creado_por: user.id,
    // Pista para el Grupo de Búsqueda: solo aplica a «Desaparecidos». Si se marca,
    // el disparador (0098) crea la ficha ya clasificada como NNA → va al Buscador NNA.
    es_nna: txt(formData.get('es_nna')) === 'on',
    // Solicitud de ayuda con ubicación (Fase 1): campos vacíos si no se marcó.
    ...datosRequerimiento(formData, categoria),
  }).select('id').single();
  if (error) {
    // La RLS exige admin o recopilación con 2ª verificación aprobada. Mensaje claro.
    if (/row-level security|violates row-level/i.test(error.message)) {
      throw new Error('No tienes permiso para reportar casos. Necesitas tu 2ª verificación de identidad aprobada (o pídele el rol a la administración).');
    }
    throw new Error('No se pudo crear el caso: ' + error.message);
  }
  const casoId = data!.id as string;

  // Desaparecidos: vuelca los datos de la persona/reporte en la ficha del Grupo de
  // Búsqueda (creada por el disparador). Best-effort: si falla, el caso queda igual y
  // el equipo de Búsqueda podrá completar la ficha. La RPC (0100) valida y escopa.
  if (categoria === 'Desaparecidos') {
    const edadStr = txt(formData.get('edad'));
    const edadNum = edadStr ? Math.trunc(Number(edadStr)) : null;
    await supabase.rpc('completar_ficha_busqueda', {
      p_caso: casoId,
      p_edad: edadNum !== null && Number.isFinite(edadNum) ? edadNum : null,
      p_sexo: opt(formData.get('sexo')),
      p_ultima_ubicacion: opt(formData.get('ultima_ubicacion')),
      p_situacion: opt(formData.get('situacion')),
      p_reporta_nombre: opt(formData.get('reporta_nombre')),
      p_reporta_telefono: opt(formData.get('reporta_telefono')),
    });
  }

  // Adjuntos de respaldo (opcional): al bucket privado 'adjuntos', carpeta casos/<id>.
  for (const file of archivos.slice(0, 10)) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const ruta = `casos/${casoId}/${Date.now()}-${safe}`;
    try {
      await subirArchivo(supabase, 'adjuntos', ruta, file, { publico: false, upsert: false });
      const { error: eAdj } = await supabase.from('casos_adjuntos').insert({
        caso_id: casoId, url: ruta, nombre: file.name, mime: file.type || null, creado_por: user.id,
      });
      if (eAdj) await borrarArchivo(supabase, 'adjuntos', [ruta]);
    } catch { /* un adjunto fallido no bloquea el caso */ }
  }

  revalidatePath('/casos');
  redirigirOk('/casos?caso=' + casoId, 'Caso creado');
}

export async function cambiarEstadoCaso(formData: FormData) {
  const { supabase } = await exigirCasos(true);
  const id = txt(formData.get('caso_id'));
  const estado = txt(formData.get('estado')) as EstadoCaso;
  if (estado === 'enviado_redaccion') throw new Error('El paso a Redacción lo hace el equipo de Envío a Redacción.');
  const { error } = await supabase.from('casos')
    .update({ estado, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el estado: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(opt(formData.get('volver')) || '/casos', 'Estado actualizado');
}

// «Tomar» un caso para trabajarlo (se lo asigna a sí mismo). Pensado para el
// Grupo de Búsqueda con los casos de desaparecidos, pero también sirve a
// Verificación. La RLS decide sobre qué casos puede (por categoría + 2ª verif).
export async function tomarCaso(formData: FormData) {
  const { supabase, user } = await exigirCasos(true);
  const id = txt(formData.get('caso_id'));
  // Al tomarlo, si estaba «pendiente» pasa a «en proceso» (ya lo está trabajando alguien).
  const { data: actual } = await supabase.from('casos').select('estado').eq('id', id).single();
  const cambios: Record<string, unknown> = { asignado_a: user.id, actualizado_en: new Date().toISOString() };
  if ((actual as { estado?: string } | null)?.estado === 'pendiente') cambios.estado = 'en_proceso';
  const { error } = await supabase.from('casos').update(cambios).eq('id', id);
  if (error) throw new Error('No se pudo tomar el caso: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(opt(formData.get('volver')) || ('/casos?caso=' + id), 'Caso tomado');
}

// El grupo "Envío a Redacción" pasa un caso confirmado al estado final del flujo.
export async function enviarCasoRedaccion(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const { error } = await supabase.rpc('enviar_caso_redaccion', { p_caso: id });
  if (error) throw new Error('No se pudo enviar a Redacción: ' + error.message);
  revalidatePath('/envio-redaccion'); revalidatePath('/casos');
  redirigirOk('/envio-redaccion', 'Caso enviado a Redacción');
}

export async function eliminarCaso(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin')) throw new Error('Solo un administrador puede eliminar casos.');
  const id = txt(formData.get('caso_id'));
  const { error } = await supabase.from('casos').delete().eq('id', id);
  if (error) throw new Error('No se pudo eliminar el caso: ' + error.message);
  revalidatePath('/casos');
  redirigirOk('/casos', 'Caso eliminado');
}

export async function actualizarCaso(formData: FormData) {
  const { supabase } = await exigirCasos(true);
  const id = txt(formData.get('caso_id'));
  const { error } = await supabase.from('casos').update({
    notas: opt(formData.get('notas')),
    actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el caso: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(opt(formData.get('volver')) || '/casos', 'Caso actualizado');
}

// Editar los DATOS del caso (título, descripción, categoría, fuente, fecha).
// Permite corregir/completar información. La RLS (0073) decide quién puede:
// admin/verificador, o el CREADOR mientras el caso siga «en proceso».
// La edición queda registrada por el trigger de auditoría (casos:update).
export async function editarCaso(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const titulo = txt(formData.get('titulo'));
  if (!titulo) throw new Error('El título es obligatorio.');
  const fuenteUrl = opt(formData.get('fuente_url'));
  const an = analizarUrl(fuenteUrl);
  if (!an.ok) throw new Error(an.motivo || 'El enlace de la fuente no es válido.');
  await exigirEnlaceSeguro(an.url ?? fuenteUrl);
  const categoria = opt(formData.get('categoria'));
  const { error } = await supabase.from('casos').update({
    titulo,
    descripcion: opt(formData.get('descripcion')),
    categoria,
    fuente: opt(formData.get('fuente')),
    fuente_url: an.url ?? fuenteUrl,
    fecha_publicacion: opt(formData.get('fecha_publicacion')),
    actualizado_en: new Date().toISOString(),
    // Solicitud de ayuda con ubicación (Fase 1): se limpia si se desmarca el bloque.
    ...datosRequerimiento(formData, categoria),
  }).eq('id', id);
  if (error) throw new Error('No se pudo editar el caso: ' + error.message);
  // Registro explícito de la edición (además del trigger de auditoría).
  await supabase.rpc('registrar_evento_caso', { p_caso: id, p_accion: 'edicion' });
  revalidatePath('/casos'); revalidatePath('/envio-redaccion');
  redirigirOk(opt(formData.get('volver')) || ('/casos?caso=' + id), 'Caso actualizado');
}

// Registra que Redacción COPIÓ o DESCARGÓ un caso (monitoreo). Se invoca desde
// el cliente (AccionesRedaccionCaso). Best-effort: no interrumpe la copia.
export async function registrarEventoCaso(casoId: string, accion: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.rpc('registrar_evento_caso', {
    p_caso: casoId, p_accion: accion === 'descarga' ? 'descarga' : 'copia',
  });
}
