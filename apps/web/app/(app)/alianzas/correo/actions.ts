'use server';
// Correo institucional de Alianzas Estratégicas (0217).
//
// LA REGLA DE ORO: se REGISTRA ANTES DE ENVIAR. Primero se crea la fila en
// `correo_envios` (estado 'pendiente', con folio) y solo después se intenta el envío;
// el resultado se escribe encima con `marcar_envio_correo`. Si el proveedor falla, si
// la clave no está configurada o si el proceso se cae en medio, la constancia de que
// se escribió NO se pierde — que es justo lo que no ocurría antes (el helper viejo
// hacía `if (!API_KEY) return;` y se daba por bueno en silencio).
//
// El cuerpo renderizado NO se guarda: la RPC solo recibe plantilla + variables, y las
// filtra otra vez del lado de la base (correo_variables_publicas).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { redirigirOk, redirigirError } from '@/lib/flash';
import { enviarEmail, emailActivo, type ResultadoEmail } from '@/lib/email';
import { cuerpoFinal, extraerVariables, renderizarTexto, sanearHtmlCorreo, variablesFaltantes } from '@/lib/correo';

const RUTA = '/alianzas/correo';

function txt(v: FormDataEntryValue | null | undefined) { return String(v ?? '').trim(); }
function opt(v: FormDataEntryValue | null | undefined) { const s = txt(v); return s ? s : null; }

async function exigirAlianzas() {
  const { user, perfil } = await requireUsuario();
  if (!user) redirect('/login');
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
  const supabase = await createClient();
  return { supabase, user, perfil };
}

/** ¿El error viene de que la migración 0217 aún no está aplicada? (molde 0192/0199) */
function faltaMigracion(error: { code?: string; message?: string } | null): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return error?.code === 'PGRST202' || error?.code === '42P01' ||
    /registrar_envio_correo|marcar_envio_correo|guardar_plantilla_correo|correo_plantillas|correo_envios|schema cache|no existe la funci/.test(m);
}

/** Valores de las variables: llegan como campos `var_<nombre>` del formulario. */
function valoresDeFormulario(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('var_')) out[k.slice(4)] = String(v ?? '').trim().slice(0, 300);
  }
  return out;
}

// ── Redactar y enviar ──────────────────────────────────────────────────────────
export async function enviarCorreoInstitucional(formData: FormData) {
  const { supabase } = await exigirAlianzas();
  const volver = RUTA + '/nuevo';

  const plantillaId = txt(formData.get('plantilla_id'));
  const destinatario = txt(formData.get('destinatario_email')).toLowerCase();
  if (!plantillaId) return redirigirError(volver, 'Elige una plantilla.');
  if (!destinatario) return redirigirError(volver, 'Indica el correo del destinatario.');

  const { data: plantilla, error: ePlantilla } = await supabase
    .from('correo_plantillas')
    .select('id, clave, nombre, asunto, cuerpo_html, variables')
    .eq('id', plantillaId).maybeSingle();
  if (ePlantilla && faltaMigracion(ePlantilla)) {
    return redirigirError(volver, 'Aún no disponible (falta aplicar la migración 0217).');
  }
  if (!plantilla) return redirigirError(volver, 'Esa plantilla ya no existe.');

  const p = plantilla as any;
  const valores = valoresDeFormulario(formData);
  // Las variables declaradas mandan; si la plantilla no las declara, se leen del texto.
  const variables: string[] = (Array.isArray(p.variables) && p.variables.length)
    ? p.variables : extraerVariables(p.asunto, p.cuerpo_html);
  const faltan = variablesFaltantes(variables, valores);
  if (faltan.length > 0) {
    return redirigirError(volver, 'Completa los datos de la plantilla: ' + faltan.join(', ') + '.');
  }

  const asunto = (opt(formData.get('asunto')) ?? renderizarTexto(p.asunto, valores)).slice(0, 300);
  const cuerpo = cuerpoFinal(p.cuerpo_html, valores);

  // 1) REGISTRAR. La RPC valida el correo, rechaza los internos de WhatsApp y filtra
  //    las variables sensibles. Si falla aquí, no se envía nada.
  const { data: envioId, error: eReg } = await supabase.rpc('registrar_envio_correo', {
    p_destinatario_email: destinatario,
    p_asunto: asunto,
    p_plantilla: p.id,
    p_destinatario_nombre: opt(formData.get('destinatario_nombre')),
    p_entidad: opt(formData.get('entidad')),
    p_entidad_id: opt(formData.get('entidad_id')),
    p_variables: valores,
    p_oportunidad: opt(formData.get('oportunidad_id')),
    p_proveedor: opt(formData.get('proveedor_id')),
    p_caso: opt(formData.get('caso_id')),
  });
  if (eReg) {
    if (faltaMigracion(eReg)) return redirigirError(volver, 'Aún no disponible (falta aplicar la migración 0217).');
    return redirigirError(volver, 'No se pudo registrar el correo: ' + eReg.message);
  }
  const id = String(envioId ?? '');

  // 2) ENVIAR (best-effort: nunca lanza).
  const activo = emailActivo();
  const r: ResultadoEmail = activo
    ? await enviarEmail({ to: destinatario, subject: asunto, html: cuerpo })
    : { ok: false, error: 'RESEND_API_KEY no configurada' };
  const estado = !activo ? 'no_configurado' : (r.ok ? 'enviado' : 'fallido');

  // 3) CERRAR el registro con el resultado. Si esto falla, la fila queda 'pendiente'
  //    —visible en el listado— en vez de desaparecer.
  const { error: eMarcar } = await supabase.rpc('marcar_envio_correo', {
    p_envio: id, p_estado: estado,
    p_mensaje_id: r.id ?? null,
    p_error: r.ok ? null : (r.error ?? null),
  });
  if (eMarcar) console.error('[correo] no se pudo cerrar el envío %s: %s', id, eMarcar.message);

  revalidatePath(RUTA);
  if (estado === 'enviado') return redirigirOk(RUTA + '/' + id, 'Correo enviado y registrado.');
  if (estado === 'no_configurado') {
    return redirigirError(RUTA + '/' + id, 'El correo quedó REGISTRADO, pero no se envió: falta configurar RESEND_API_KEY.');
  }
  return redirigirError(RUTA + '/' + id, 'El correo quedó REGISTRADO, pero el envío falló: ' + (r.error ?? 'motivo desconocido'));
}

// ── Plantillas ─────────────────────────────────────────────────────────────────
export async function guardarPlantillaCorreo(formData: FormData) {
  const { supabase } = await exigirAlianzas();
  const volver = RUTA + '/plantillas';

  const clave = txt(formData.get('clave'));
  const nombre = txt(formData.get('nombre'));
  const asunto = txt(formData.get('asunto'));
  const cuerpo = sanearHtmlCorreo(String(formData.get('cuerpo_html') ?? '').trim());
  if (!clave) return redirigirError(volver, 'Ponle una clave a la plantilla (ej.: solicitud_donacion).');
  if (!nombre) return redirigirError(volver, 'Ponle un nombre a la plantilla.');
  if (!asunto) return redirigirError(volver, 'La plantilla necesita un asunto.');
  if (!cuerpo) return redirigirError(volver, 'La plantilla necesita un cuerpo.');

  // Las variables NO se piden aparte: se deducen del propio texto ({{nombre}}…), así
  // no pueden quedar desincronizadas con lo que realmente se escribió.
  const variables = extraerVariables(asunto, cuerpo);

  const { error } = await supabase.rpc('guardar_plantilla_correo', {
    p_clave: clave,
    p_nombre: nombre,
    p_asunto: asunto,
    p_cuerpo_html: cuerpo,
    p_variables: variables,
    p_area: opt(formData.get('area')) ?? 'alianzas_estrategicas',
    p_activa: txt(formData.get('activa')) !== 'false',
  });
  if (error) {
    if (faltaMigracion(error)) return redirigirError(volver, 'Aún no disponible (falta aplicar la migración 0217).');
    return redirigirError(volver, 'No se pudo guardar la plantilla: ' + error.message);
  }

  revalidatePath(volver); revalidatePath(RUTA + '/nuevo');
  redirigirOk(volver, 'Plantilla guardada.');
}
