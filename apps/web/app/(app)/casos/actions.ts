'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import { redirigirOk, redirigirError } from '@/lib/flash';
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
const TIPOS_LUGAR_VAL = ['hospital', 'albergue', 'acopio', 'otro'];

// Campos de «solicitud de ayuda con ubicación» (Propuesta Fase 1). Si el bloque no
// está activo, DEVUELVE los campos en null/false (así al desmarcarlo se limpian).
// Un requerimiento exige ubicación y NUNCA es 'Desaparecidos' (frontera con Búsqueda);
// el CHECK de la BD (0112) es el respaldo.
function datosRequerimiento(formData: FormData, categoria: string | null) {
  const es = txt(formData.get('es_requerimiento')) === 'on';
  // Nota: NO se toca `punto_acopio_id` (lo fija el trigger al verificar); solo la marca.
  if (!es) {
    return { es_requerimiento: false, lat: null, lng: null, req_tipo: null, req_cantidad: null, req_urgencia: null,
      punto_tipo: null, punto_temporal: false };
  }
  if (categoria === 'Desaparecidos') {
    throw new Error('Una solicitud de «Desaparecidos» no puede marcarse como solicitud de ayuda con ubicación (esos van al Grupo de Búsqueda, no a Logística).');
  }
  const lat = numOpt(formData.get('lat'));
  const lng = numOpt(formData.get('lng'));
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Marca la ubicación en el mapa (toca o arrastra el pin).');
  }
  const tipo = opt(formData.get('req_tipo'));
  const urg = opt(formData.get('req_urgencia'));
  // Punto del mapa (0145): si se elige un tipo válido, al confirmarse se crea el centro.
  const puntoTipo = opt(formData.get('punto_tipo'));
  return {
    es_requerimiento: true,
    lat, lng,
    req_tipo: tipo && TIPOS_INSUMO_VAL.includes(tipo) ? tipo : null,
    req_cantidad: opt(formData.get('req_cantidad')),
    req_urgencia: urg && PRIORIDADES_VAL.includes(urg) ? urg : 'media',
    punto_tipo: puntoTipo && TIPOS_LUGAR_VAL.includes(puntoTipo) ? puntoTipo : null,
    punto_temporal: txt(formData.get('punto_temporal')) === 'on',
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
  // Ya no se clasifica el tipo de caso: toda información entra como «solicitud con
  // ubicación» del lado de Verificación (nunca 'Desaparecidos', la frontera con Búsqueda).
  const categoria = 'Otras informaciones';
  const { data, error } = await supabase.from('casos').insert({
    titulo,
    descripcion: opt(formData.get('descripcion')),
    categoria,
    fuente: opt(formData.get('fuente')),
    fuente_url: an.url ?? fuenteUrl,
    fecha_publicacion: opt(formData.get('fecha_publicacion')),
    contacto: opt(formData.get('contacto')),
    estado: 'pendiente',
    creado_por: user.id,
    es_nna: false,
    // Toda información es una solicitud con ubicación (el formulario fija es_requerimiento).
    ...datosRequerimiento(formData, categoria),
  }).select('id').single();
  if (error) {
    // La RLS exige admin o recopilación con 2ª verificación aprobada. Mensaje claro.
    if (/row-level security|violates row-level/i.test(error.message)) {
      throw new Error('No tienes permiso para reportar solicitudes. Necesitas tu 2ª verificación de identidad aprobada (o pídele el rol a la administración).');
    }
    throw new Error('No se pudo crear la solicitud: ' + error.message);
  }
  const casoId = data!.id as string;

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
  redirigirOk('/casos?caso=' + casoId, 'Solicitud creada');
}

// Derivar un caso-requerimiento confirmado a Logística (Propuesta Fase 2): crea la
// solicitud de insumo enlazada (RPC atómica que valida, sella el enlace y audita).
export async function derivarCasoLogistica(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const volver = opt(formData.get('volver')) || ('/casos?caso=' + id);
  const { error } = await supabase.rpc('derivar_caso_a_logistica', { p_caso: id });
  if (error) return redirigirError(volver, error.message || 'No se pudo derivar la solicitud a Logística.');
  revalidatePath('/casos'); revalidatePath('/insumos');
  redirigirOk(volver, 'Solicitud derivada a Logística. La solicitud de insumo ya está en el tablero para coordinar la entrega.');
}

export async function cambiarEstadoCaso(formData: FormData) {
  const { supabase } = await exigirCasos(true);
  const id = txt(formData.get('caso_id'));
  const estado = txt(formData.get('estado')) as EstadoCaso;
  if (estado === 'enviado_redaccion') throw new Error('El paso a Redacción lo hace el equipo de Envío a Redacción.');
  const { error } = await supabase.from('casos')
    .update({ estado, info_requerida: null, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el estado: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(opt(formData.get('volver')) || '/casos', 'Estado actualizado');
}

// Descartar un caso (marcarlo falso) EXIGIENDO un motivo, que queda anexado a las notas
// para dejar constancia. El cambio de estado lo audita el trigger de la tabla `casos`.
export async function descartarCaso(formData: FormData) {
  const { supabase } = await exigirCasos(true);
  const id = txt(formData.get('caso_id'));
  const volver = opt(formData.get('volver')) || ('/casos?caso=' + id);
  const motivo = txt(formData.get('motivo')).slice(0, 500);
  if (!motivo) return redirigirError(volver, 'Indica el motivo para descartar la solicitud.');
  const { data: actual } = await supabase.from('casos').select('notas').eq('id', id).single();
  const sello = `[Descartado ${new Date().toISOString().slice(0, 10)}] ${motivo}`;
  const notas = ((actual as { notas?: string | null } | null)?.notas ? (actual as any).notas + '\n' : '') + sello;
  const { error } = await supabase.from('casos')
    .update({ estado: 'falso', notas, info_requerida: null, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) return redirigirError(volver, 'No se pudo descartar la solicitud: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(volver, 'Solicitud descartada. Quedó registrado el motivo.');
}

// «Requiere información adicional» (procedimiento del equipo de Verificación): el
// caso NO se descarta; vuelve a Recopilación para que lo complete. Guarda el motivo
// en info_requerida (el trigger 0142 avisa a quien lo reportó), lo deja en_proceso y
// libera la asignación para que el área anterior lo retome. El motivo queda anexado
// a las notas para dejar constancia.
export async function requerirInfoCaso(formData: FormData) {
  const { supabase } = await exigirCasos(true);
  const id = txt(formData.get('caso_id'));
  const volver = opt(formData.get('volver')) || ('/casos?caso=' + id);
  const motivo = txt(formData.get('motivo')).slice(0, 500);
  if (!motivo) return redirigirError(volver, 'Indica qué información falta para poder verificar.');
  const { data: actual } = await supabase.from('casos').select('notas').eq('id', id).single();
  const sello = `[Requiere info ${new Date().toISOString().slice(0, 10)}] ${motivo}`;
  const notas = ((actual as { notas?: string | null } | null)?.notas ? (actual as any).notas + '\n' : '') + sello;
  const { error } = await supabase.from('casos')
    .update({ estado: 'en_proceso', info_requerida: motivo, asignado_a: null, notas, actualizado_en: new Date().toISOString() })
    .eq('id', id);
  if (error) return redirigirError(volver, 'No se pudo devolver la solicitud: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(volver, 'Devuelta a Recopilación. Se avisó a quien la reportó con el motivo.');
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
  if (error) throw new Error('No se pudo tomar la solicitud: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(opt(formData.get('volver')) || ('/casos?caso=' + id), 'Solicitud tomada');
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
  redirigirOk('/envio-redaccion', 'Solicitud enviada a Redacción');
}

export async function eliminarCaso(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: yo } = await supabase.from('perfiles').select('rol, roles_extra').eq('id', user.id).single();
  const roles = [yo?.rol, ...(((yo?.roles_extra as Rol[] | null) ?? []))];
  if (!roles.includes('admin')) throw new Error('Solo un administrador puede eliminar solicitudes.');
  const id = txt(formData.get('caso_id'));
  const { error } = await supabase.from('casos').delete().eq('id', id);
  if (error) throw new Error('No se pudo eliminar la solicitud: ' + error.message);
  revalidatePath('/casos');
  redirigirOk('/casos', 'Solicitud eliminada');
}

export async function actualizarCaso(formData: FormData) {
  const { supabase } = await exigirCasos(true);
  const id = txt(formData.get('caso_id'));
  const { error } = await supabase.from('casos').update({
    notas: opt(formData.get('notas')),
    actualizado_en: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar la solicitud: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(opt(formData.get('volver')) || '/casos', 'Solicitud actualizada');
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
    contacto: opt(formData.get('contacto')),
    // Al corregir/completar los datos se limpia el aviso «Requiere información adicional».
    info_requerida: null,
    actualizado_en: new Date().toISOString(),
    // Solicitud de ayuda con ubicación (Fase 1): se limpia si se desmarca el bloque.
    ...datosRequerimiento(formData, categoria),
  }).eq('id', id);
  if (error) throw new Error('No se pudo editar la solicitud: ' + error.message);
  // Registro explícito de la edición (además del trigger de auditoría).
  await supabase.rpc('registrar_evento_caso', { p_caso: id, p_accion: 'edicion' });
  revalidatePath('/casos'); revalidatePath('/envio-redaccion');
  redirigirOk(opt(formData.get('volver')) || ('/casos?caso=' + id), 'Solicitud actualizada');
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
