'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import { redirigirOk, redirigirError } from '@/lib/flash';
import { analizarUrl, validarArchivo } from '@/lib/validaciones';
import { revisarSafeBrowsing } from '@/lib/safe-browsing';
import { CANALES_DIFUSION, TERMINOS_FUERA_ALCANCE } from '@/lib/constantes';
import type { EstadoCaso, Rol } from '@unidos/types';

// Detecta que una RPC/param no existe todavía en la base (migración 0169 sin aplicar):
// PostgREST devuelve PGRST202 al no hallar la función con esa firma; Postgres, 42883.
// Sirve para degradar con elegancia (reintentar sin canales / avisar del redactor).
function rpcNoExiste(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  const m = (error.message || '').toLowerCase();
  return /could not find the function|schema cache|does not exist|no existe la funci/.test(m);
}

function txt(v: FormDataEntryValue | null) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null) { const s = txt(v); return s ? s : null; }
function numOpt(v: FormDataEntryValue | null): number | null {
  const s = txt(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null;
}

// Valores válidos de los enums reutilizados (public.tipo_insumo, public.prioridad).
const TIPOS_INSUMO_VAL = ['medicamentos', 'alimentos', 'agua', 'higiene', 'refugio', 'otro'];
const PRIORIDADES_VAL = ['baja', 'media', 'alta', 'critica'];
const TIPOS_LUGAR_VAL = ['hospital', 'albergue', 'acopio', 'otro'];
// Valores válidos de los campos estructurados nuevos (0173).
const TIPOS_FUENTE_VAL = ['contacto_directo', 'whatsapp', 'instagram', 'facebook', 'x', 'pagina_oficial', 'organizacion', 'publicacion', 'otra'];
const VIGENCIA_VAL = ['si', 'no', 'pendiente'];

// Detecta el error de «columna inexistente» de las columnas de PUNTO del mapa (0145).
// Si esa migración aún no se aplicó en la base, permite reintentar el insert/update
// sin esos campos para que reportar/editar una solicitud NUNCA se bloquee.
function faltanColumnasPunto(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42703') return true; // undefined_column
  const m = (error.message || '').toLowerCase();
  return /punto_tipo|punto_temporal|punto_acopio|referente|contacto_whatsapp|contacto_instagram|referente_rol|fuente_tipo|ubicacion_|sigue_vigente|ultima_confirmacion|contacto_difusion|autoriza_difusion|revision_alcance/.test(m)
    || (/column/.test(m) && /does not exist|no existe/.test(m));
}

// Quita las columnas «nuevas» (0145 punto del mapa, 0171 contacto estructurado, 0173
// campos estructurados) para reintentar si esas migraciones aún no se aplicaron. El
// `contacto` compuesto se conserva (columna vieja), así el contacto NUNCA se pierde.
function sinColumnasNuevas(fila: Record<string, unknown>): Record<string, unknown> {
  const f = { ...fila };
  delete f.punto_tipo; delete f.punto_temporal;
  delete f.referente; delete f.contacto_whatsapp; delete f.contacto_instagram;
  delete f.referente_rol; delete f.fuente_tipo;
  delete f.ubicacion_estado; delete f.ubicacion_municipio; delete f.ubicacion_parroquia;
  delete f.ubicacion_sector; delete f.ubicacion_direccion;
  delete f.sigue_vigente; delete f.ultima_confirmacion;
  delete f.contacto_difusion; delete f.autoriza_difusion;
  delete f.revision_alcance;
  return f;
}

// Normaliza WhatsApp/teléfono (deja + y dígitos; si no parece número, guarda el texto).
function normalizarWhatsapp(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/[^\d+]/g, '');
  return s.replace(/[^\d]/g, '').length >= 6 ? s : (v.trim() || null);
}
// Normaliza el usuario de Instagram (quita la URL y el @).
function normalizarInstagram(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
  return s || null;
}
// Contacto estructurado (0171). `exigir` (al crear): referente + al menos un canal.
// Devuelve también `contactoCompuesto` para quien lee el campo `contacto` (retrocompat).
function datosContacto(formData: FormData, exigir: boolean) {
  const referente = opt(formData.get('referente'));
  const referente_rol = opt(formData.get('referente_rol'));
  const wa = normalizarWhatsapp(opt(formData.get('contacto_whatsapp')));
  const ig = normalizarInstagram(opt(formData.get('contacto_instagram')));
  if (exigir) {
    if (!referente) throw new Error('Falta el nombre del referente (persona o institución).');
    if (!wa && !ig) throw new Error('Indica al menos un contacto: WhatsApp/teléfono o Instagram.');
  }
  const compuesto = [wa ? 'WhatsApp/tel: ' + wa : null, ig ? 'Instagram: @' + ig : null]
    .filter(Boolean).join(' · ') || null;
  return { referente, referente_rol, contacto_whatsapp: wa, contacto_instagram: ig, contactoCompuesto: compuesto, hayContacto: !!(wa || ig) };
}

// Campos estructurados nuevos (0173, Pasos 4/5): ubicación administrativa separada,
// vigencia (¿sigue vigente? + última confirmación) y tipo de fuente. Todos opcionales
// en la capa de datos; Verificación los confirma con su semáforo por campo.
function datosEstructurados(formData: FormData) {
  const ft = opt(formData.get('fuente_tipo'));
  const vig = opt(formData.get('sigue_vigente'));
  return {
    fuente_tipo: ft && TIPOS_FUENTE_VAL.includes(ft) ? ft : null,
    ubicacion_estado: opt(formData.get('ubicacion_estado')),
    ubicacion_municipio: opt(formData.get('ubicacion_municipio')),
    ubicacion_parroquia: opt(formData.get('ubicacion_parroquia')),
    ubicacion_sector: opt(formData.get('ubicacion_sector')),
    ubicacion_direccion: opt(formData.get('ubicacion_direccion')),
    sigue_vigente: vig && VIGENCIA_VAL.includes(vig) ? vig : null,
    ultima_confirmacion: opt(formData.get('ultima_confirmacion')),
    // Paso 10: contacto autorizado para difusión (lo único que verá Redes/Redacción).
    contacto_difusion: opt(formData.get('contacto_difusion')),
    autoriza_difusion: txt(formData.get('autoriza_difusion')) === 'on',
  };
}

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
  const tieneUbic = lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const tipo = opt(formData.get('req_tipo'));
  const urg = opt(formData.get('req_urgencia'));
  const reqTipo = tipo && TIPOS_INSUMO_VAL.includes(tipo) ? tipo : null;
  const reqCant = opt(formData.get('req_cantidad'));
  const reqUrg = urg && PRIORIDADES_VAL.includes(urg) ? urg : 'media';
  // Punto del mapa (0145): si se elige un tipo válido y HAY ubicación, al confirmarse se crea el centro.
  let puntoTipo = opt(formData.get('punto_tipo'));
  puntoTipo = puntoTipo && TIPOS_LUGAR_VAL.includes(puntoTipo) ? puntoTipo : null;

  // La UBICACIÓN es OPCIONAL. Mucha gente reporta desde equipos donde el mapa no carga
  // (WebGL / modo de bajo consumo) o sin poner el pin. Antes esto lanzaba un error duro
  // («Marca la ubicación…») que ROMPÍA el reporte y mostraba la página de error genérica.
  // Ahora, sin ubicación se registra igual como solicitud SIN ubicar: se guarda con
  // es_requerimiento=false (así satisface el CHECK 0112, que exige lat/lng solo cuando es
  // requerimiento) y Verificación puede pedir la ubicación con «Requiere información».
  // Un PUNTO del mapa sí necesita coordenadas: si se marcó sin ubicar, se guarda como
  // solicitud normal (sin la marca de punto), nunca se bloquea el reporte.
  if (!tieneUbic) {
    return { es_requerimiento: false, lat: null, lng: null,
      req_tipo: reqTipo, req_cantidad: reqCant, req_urgencia: reqUrg,
      punto_tipo: null, punto_temporal: false };
  }
  return {
    es_requerimiento: true,
    lat, lng,
    req_tipo: reqTipo,
    req_cantidad: reqCant,
    req_urgencia: reqUrg,
    punto_tipo: puntoTipo,
    punto_temporal: puntoTipo ? txt(formData.get('punto_temporal')) === 'on' : false,
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

// Filtro de alcance (Paso 2): marca 🟡 (revisión) si el texto libre menciona temas fuera
// de misión. NO bloquea (hay falsos positivos, p. ej. «no tengo dinero para el remedio»);
// solo la señala para que un responsable confirme si corresponde a la misión.
function marcaRevisionAlcance(texto: string): boolean {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const t = norm(texto);
  return TERMINOS_FUERA_ALCANCE.some((term) => t.includes(norm(term)));
}

export async function crearCaso(formData: FormData) {
  const { supabase, user } = await exigirCasos(false);
  const titulo = txt(formData.get('titulo'));
  if (!titulo) throw new Error('El título es obligatorio.');
  // Filtro institucional de alcance (Paso 2): exige la confirmación del reportante.
  if (txt(formData.get('confirmo_alcance')) !== 'on') {
    throw new Error('Debes confirmar que la solicitud está dentro del alcance de la organización (no dinero, vivienda, legal, diagnóstico/tratamiento ni política).');
  }
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
  // Datos prioritarios (Paso 3): referente + al menos un contacto (WhatsApp/tel o IG).
  const contacto = datosContacto(formData, true);
  const fila: Record<string, unknown> = {
    titulo,
    descripcion: opt(formData.get('descripcion')),
    categoria,
    fuente: opt(formData.get('fuente')),
    fuente_url: an.url ?? fuenteUrl,
    fecha_publicacion: opt(formData.get('fecha_publicacion')),
    contacto: contacto.contactoCompuesto,
    referente: contacto.referente,
    referente_rol: contacto.referente_rol,
    contacto_whatsapp: contacto.contacto_whatsapp,
    contacto_instagram: contacto.contacto_instagram,
    estado: 'pendiente',
    creado_por: user.id,
    es_nna: false,
    // Filtro de alcance (Paso 2): 🟡 si el texto menciona temas fuera de misión.
    revision_alcance: marcaRevisionAlcance(titulo + ' ' + (opt(formData.get('descripcion')) ?? '')),
    // Toda información es una solicitud con ubicación (el formulario fija es_requerimiento).
    ...datosRequerimiento(formData, categoria),
    // Ubicación administrativa, vigencia y tipo de fuente (Pasos 4/5).
    ...datosEstructurados(formData),
  };
  let { data, error } = await supabase.from('casos').insert(fila).select('id').single();
  // Resiliencia: si la migración 0145 («punto del mapa») aún no está aplicada en la
  // base, se reintenta sin esos campos para que reportar una solicitud no se bloquee.
  if (error && faltanColumnasPunto(error)) {
    ({ data, error } = await supabase.from('casos').insert(sinColumnasNuevas(fila)).select('id').single());
  }
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

// Verificación por campo (0172): marca un dato de la solicitud con su semáforo
// (sin_revisar / verificado / requiere_info / falso). La RPC reaplica la frontera
// por categoría (Verificación↔Otras, Búsqueda↔Desaparecidos) y audita el cambio.
export async function marcarCampoVerificacion(formData: FormData) {
  const { supabase } = await exigirCasos(true);
  const caso = txt(formData.get('caso_id'));
  const campo = txt(formData.get('campo'));
  const estado = txt(formData.get('estado'));
  const nota = opt(formData.get('nota'));
  const volver = opt(formData.get('volver')) || ('/casos?caso=' + caso);
  const { error } = await supabase.rpc('marcar_campo_verificacion', {
    p_caso: caso, p_campo: campo, p_estado: estado, p_nota: nota,
  });
  if (error) return redirigirError(volver, 'No se pudo marcar el campo: ' + error.message);
  revalidatePath('/casos');
  redirigirOk(volver, 'Verificación del campo actualizada');
}

// El grupo "Envío a Redacción" pasa un caso confirmado al estado final del flujo.
export async function enviarCasoRedaccion(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const volver = opt(formData.get('volver'));
  const { error } = await supabase.rpc('enviar_caso_redaccion', { p_caso: id });
  if (error) {
    // Desde el detalle (Verificación) volvemos a la solicitud con el aviso; sin `volver`
    // (cola de Redacción) mantenemos el comportamiento previo.
    if (volver) return redirigirError(volver, 'No se pudo enviar a Redacción: ' + error.message);
    throw new Error('No se pudo enviar a Redacción: ' + error.message);
  }
  revalidatePath('/envio-redaccion'); revalidatePath('/casos');
  redirigirOk(volver || '/envio-redaccion', 'Solicitud enviada a Redacción');
}

// Reubicar una solicitud MAL CLASIFICADA como Donación-Ofrecimiento (Recopilación /
// Verificación): a veces lo que llega como «solicitud» es en realidad alguien que
// OFRECE ayuda. El RPC 0167 crea el ofrecimiento y descarta la solicitud original con
// una nota que enlaza al nuevo «OF-xxxxx»; aterrizamos en el ofrecimiento para afinarlo.
export async function reubicarCasoOfrecimiento(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const clase = opt(formData.get('clase')) === 'servicio' ? 'servicio' : 'donacion';
  const volver = opt(formData.get('volver')) || ('/casos?caso=' + id);
  const { data, error } = await supabase.rpc('reubicar_caso_como_ofrecimiento', { p_caso: id, p_clase: clase });
  if (error) return redirigirError(volver, 'No se pudo reubicar la solicitud: ' + error.message);
  revalidatePath('/casos'); revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades/' + data, 'Solicitud reubicada como Donación-Ofrecimiento. Complétala o afínala aquí.');
}

// Redacción/Redes marca una solicitud como PUBLICADA (con enlace opcional). El
// permiso y la validación de estado los hace el RPC (0166); esto solo lo invoca.
export async function marcarCasoPublicado(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const url = opt(formData.get('publicacion_url'));
  // Canales de difusión (0169): en qué redes se publicó. Se validan contra la lista.
  const canales = formData.getAll('canales').map(String).filter((c) => CANALES_DIFUSION.includes(c));
  const volver = opt(formData.get('volver')) || ('/casos?caso=' + id);
  let { error } = await supabase.rpc('marcar_caso_publicado', { p_caso: id, p_url: url, p_canales: canales });
  // Si 0169 aún no está aplicada, la RPC no acepta p_canales: se reintenta sin ellos
  // para que marcar «Publicada» NUNCA se bloquee por una migración pendiente.
  if (error && rpcNoExiste(error)) {
    ({ error } = await supabase.rpc('marcar_caso_publicado', { p_caso: id, p_url: url }));
  }
  if (error) return redirigirError(volver, 'No se pudo marcar como publicada: ' + error.message);
  revalidatePath('/envio-redaccion'); revalidatePath('/casos');
  redirigirOk(volver, 'Solicitud marcada como publicada');
}

// Tomar / soltar una solicitud para redactar su difusión (0169). Auto-asignación
// (redactor_id = uno mismo), espejo de `tomarCaso` de Verificación pero en su propia
// columna para no pisar `asignado_a`. El permiso y el estado los valida la RPC.
export async function tomarCasoRedaccion(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const volver = opt(formData.get('volver')) || ('/envio-redaccion?caso=' + id);
  const { error } = await supabase.rpc('tomar_caso_redaccion', { p_caso: id });
  if (error) {
    return redirigirError(volver, rpcNoExiste(error)
      ? 'Falta aplicar la migración 0169 para asignar redactores.'
      : 'No se pudo tomar la solicitud: ' + error.message);
  }
  revalidatePath('/envio-redaccion'); revalidatePath('/casos');
  redirigirOk(volver, 'La tomaste para redactar su difusión.');
}

export async function soltarCasoRedaccion(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const volver = opt(formData.get('volver')) || ('/envio-redaccion?caso=' + id);
  const { error } = await supabase.rpc('soltar_caso_redaccion', { p_caso: id });
  if (error) {
    return redirigirError(volver, rpcNoExiste(error)
      ? 'Falta aplicar la migración 0169 para asignar redactores.'
      : 'No se pudo soltar la solicitud: ' + error.message);
  }
  revalidatePath('/envio-redaccion'); revalidatePath('/casos');
  redirigirOk(volver, 'La soltaste.');
}

export async function quitarCasoPublicado(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const id = txt(formData.get('caso_id'));
  const { error } = await supabase.rpc('quitar_caso_publicado', { p_caso: id });
  const volver = opt(formData.get('volver')) || ('/casos?caso=' + id);
  if (error) return redirigirError(volver, 'No se pudo deshacer: ' + error.message);
  revalidatePath('/envio-redaccion'); revalidatePath('/casos');
  redirigirOk(volver, 'Publicación deshecha');
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
  // Validar los adjuntos nuevos (opcionales) ANTES de tocar la solicitud.
  const archivos = formData.getAll('archivos').filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of archivos.slice(0, 10)) {
    const v = validarArchivo(file.name, file.size, 10);
    if (!v.ok) throw new Error(v.motivo || 'Archivo no admitido.');
  }
  const categoria = opt(formData.get('categoria'));
  const cambios: Record<string, unknown> = {
    titulo,
    descripcion: opt(formData.get('descripcion')),
    categoria,
    fuente: opt(formData.get('fuente')),
    fuente_url: an.url ?? fuenteUrl,
    fecha_publicacion: opt(formData.get('fecha_publicacion')),
    // Al corregir/completar los datos se limpia el aviso «Requiere información adicional».
    info_requerida: null,
    actualizado_en: new Date().toISOString(),
    // Solicitud de ayuda con ubicación (Fase 1): se limpia si se desmarca el bloque.
    ...datosRequerimiento(formData, categoria),
  };
  // Contacto estructurado (0171): solo se actualiza lo que el editor completó, para no
  // borrar lo ya cargado si el formulario no lo trae (p. ej. al editar desde Redacción).
  const contactoEd = datosContacto(formData, false);
  if (txt(formData.get('_contacto_estructurado')) === '1') {
    if (contactoEd.referente) cambios.referente = contactoEd.referente;
    if (contactoEd.referente_rol) cambios.referente_rol = contactoEd.referente_rol;
    if (contactoEd.contacto_whatsapp) cambios.contacto_whatsapp = contactoEd.contacto_whatsapp;
    if (contactoEd.contacto_instagram) cambios.contacto_instagram = contactoEd.contacto_instagram;
    if (contactoEd.hayContacto) cambios.contacto = contactoEd.contactoCompuesto;
  }
  // Datos estructurados nuevos (0173): solo se actualizan si el formulario los trae
  // (marca `_datos_estructurados`). Merge SUAVE: solo se escriben los campos con valor,
  // para no borrar lo ya cargado al editar desde vistas reducidas.
  if (txt(formData.get('_datos_estructurados')) === '1') {
    for (const [k, v] of Object.entries(datosEstructurados(formData))) {
      if (v !== null && v !== undefined) (cambios as Record<string, unknown>)[k] = v;
    }
  }
  let { error } = await supabase.from('casos').update(cambios).eq('id', id);
  // Resiliencia ante 0145 no aplicada (mismas columnas de «punto del mapa»).
  if (error && faltanColumnasPunto(error)) {
    ({ error } = await supabase.from('casos').update(sinColumnasNuevas(cambios)).eq('id', id));
  }
  if (error) throw new Error('No se pudo editar la solicitud: ' + error.message);

  // Adjuntos nuevos (opcional): al bucket privado 'adjuntos', carpeta casos/<id>. Se
  // SUMAN a los existentes. Mismo patrón que crearCaso; un adjunto fallido no bloquea.
  for (const file of archivos.slice(0, 10)) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const ruta = `casos/${id}/${Date.now()}-${safe}`;
    try {
      await subirArchivo(supabase, 'adjuntos', ruta, file, { publico: false, upsert: false });
      const { error: eAdj } = await supabase.from('casos_adjuntos').insert({
        caso_id: id, url: ruta, nombre: file.name, mime: file.type || null, creado_por: user.id,
      });
      if (eAdj) await borrarArchivo(supabase, 'adjuntos', [ruta]);
    } catch { /* un adjunto fallido no bloquea la edición */ }
  }

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
