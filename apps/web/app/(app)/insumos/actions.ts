'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { subirArchivo, borrarArchivo } from '@/lib/storage';
import { redirigirOk, redirigirError } from '@/lib/flash';

async function usuario() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, userId: user.id };
}

// ── Solicitudes ──
export async function crearSolicitud(formData: FormData) {
  const { supabase, userId } = await usuario();
  const titulo = String(formData.get('titulo') ?? '').trim();
  if (!titulo) throw new Error('El título es obligatorio.');
  const { data, error } = await supabase.from('solicitudes_insumo').insert({
    titulo,
    tipo: String(formData.get('tipo') ?? 'otro'),
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    cantidad: String(formData.get('cantidad') ?? '').trim() || null,
    urgencia: String(formData.get('urgencia') ?? 'media'),
    punto_id: String(formData.get('punto_id') ?? '').trim() || null,
    solicitado_por: userId,
  }).select('id').single();
  if (error) throw new Error('No se pudo crear la solicitud: ' + error.message);
  revalidatePath('/insumos');
  redirigirOk('/insumos/' + data!.id, 'Solicitud creada');
}

export async function cambiarEstadoSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const estado = String(formData.get('estado'));

  // «Entregado» dejó de ser un estado más (0221): con desglose por ítem solo se cierra
  // con todo cubierto, o forzándolo a sabiendas como ENTREGA PARCIAL. Esa decisión vive
  // en la RPC (que además audita cuál de las dos fue); aquí solo se enruta.
  if (estado === 'entregado') {
    const forzar = String(formData.get('forzar') ?? '') === '1';
    const { error } = await supabase.rpc('entregar_solicitud_insumo', { p_solicitud: id, p_forzar: forzar });
    if (error) {
      const m = (error.message || '').toLowerCase();
      if (/could not find the function|function .* does not exist|no existe la funci/.test(m)) {
        // Sin 0221 aplicada, el comportamiento anterior: update directo.
        const { error: e2 } = await supabase.from('solicitudes_insumo')
          .update({ estado, actualizado_en: new Date().toISOString() }).eq('id', id);
        if (e2) return redirigirError('/insumos/' + id, 'No se pudo actualizar el estado: ' + e2.message);
      } else {
        return redirigirError('/insumos/' + id, error.message);
      }
    }
    revalidatePath('/insumos'); revalidatePath('/insumos/' + id); revalidatePath('/casos'); revalidatePath('/seguimiento');
    return redirigirOk('/insumos/' + id, forzar
      ? 'Entrega registrada como PARCIAL: quedó constancia de lo que faltaba y la solicitud sigue en el flujo para difundir el resto.'
      : 'Solicitud entregada.');
  }

  const { error } = await supabase.from('solicitudes_insumo')
    .update({ estado, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar el estado: ' + error.message);
  revalidatePath('/insumos'); revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, 'Estado actualizado');
}

// Imágenes de la solicitud (0212/0213). Logística adjunta en cualquier momento de la
// gestión, no solo al entregar. El DESTINO depende de la solicitud:
//   · si viene de una solicitud del flujo (caso), va AL CASO → la ven TODAS las áreas
//     (Verificación, Recopilación y Redacción), que es lo que pidió Logística;
//   · si es una tarea suelta de Logística (sin caso), va a su galería propia.
// Mismo patrón que los adjuntos de un caso: un archivo fallido no bloquea al resto.
export async function subirAdjuntosInsumo(formData: FormData) {
  const { supabase, userId } = await usuario();
  const id = String(formData.get('id'));
  const archivos = formData.getAll('imagenes').filter((f): f is File => f instanceof File && f.size > 0);
  if (archivos.length === 0) return redirigirError('/insumos/' + id, 'Elige al menos una imagen.');

  const { data: sol } = await supabase.from('solicitudes_insumo').select('caso_id').eq('id', id).maybeSingle();
  const casoId = (sol as { caso_id?: string | null } | null)?.caso_id ?? null;
  const bucket = casoId ? 'adjuntos' : 'entregas';

  let subidas = 0;
  let ultimoError = '';
  for (const file of archivos.slice(0, 10)) {
    if (file.size > 8 * 1024 * 1024) { ultimoError = 'cada imagen debe pesar menos de 8 MB'; continue; }
    if (!file.type.startsWith('image/')) { ultimoError = 'solo se admiten imágenes'; continue; }
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const ruta = casoId ? `casos/${casoId}/${Date.now()}-${safe}` : `${id}/${Date.now()}-${safe}`;
    try {
      await subirArchivo(supabase, bucket, ruta, file, { publico: false, upsert: false });
      const { error } = casoId
        ? await supabase.from('casos_adjuntos').insert({
            caso_id: casoId, url: ruta, nombre: file.name, mime: file.type || null, creado_por: userId,
          })
        : await supabase.from('insumos_adjuntos').insert({
            solicitud_id: id, url: ruta, nombre: file.name, mime: file.type || null, creado_por: userId,
          });
      if (error) { await borrarArchivo(supabase, bucket, [ruta]); ultimoError = error.message; continue; }
      subidas++;
    } catch (e) { ultimoError = (e as Error)?.message ?? 'error al subir'; }
  }

  revalidatePath('/insumos/' + id); revalidatePath('/casos'); revalidatePath('/envio-redaccion');
  if (subidas === 0) {
    return redirigirError('/insumos/' + id, /insumos_adjuntos|row-level security|violates|does not exist|no existe/i.test(ultimoError)
      ? 'No se pudo adjuntar. Puede faltar aplicar las migraciones 0212/0213.'
      : 'No se pudo subir la imagen' + (ultimoError ? ': ' + ultimoError : '.'));
  }
  const dondeSeVe = casoId ? ' Las ven todas las áreas en la solicitud.' : '';
  redirigirOk('/insumos/' + id, (subidas === 1 ? 'Imagen adjuntada.' : subidas + ' imágenes adjuntadas.') + dondeSeVe);
}

// Quita una imagen. `origen` dice de dónde: 'caso' (adjunto de la solicitud, visible para
// todas las áreas) o 'insumo' (galería de la tarea de Logística).
export async function eliminarAdjuntoInsumo(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const adjuntoId = String(formData.get('adjunto_id'));
  const esCaso = String(formData.get('origen') ?? 'insumo') === 'caso';
  const tabla = esCaso ? 'casos_adjuntos' : 'insumos_adjuntos';
  const bucket = esCaso ? 'adjuntos' : 'entregas';

  const { data: adj } = await supabase.from(tabla).select('url').eq('id', adjuntoId).maybeSingle();
  const { error } = await supabase.from(tabla).delete().eq('id', adjuntoId);
  if (error) return redirigirError('/insumos/' + id, 'No se pudo quitar la imagen: ' + error.message);
  // El objeto se borra DESPUÉS de que la RLS aceptó el borrado de la fila.
  const ruta = (adj as { url?: string } | null)?.url;
  if (ruta) { try { await borrarArchivo(supabase, bucket, [ruta]); } catch { /* la fila ya no está */ } }
  revalidatePath('/insumos/' + id); revalidatePath('/casos');
  redirigirOk('/insumos/' + id, 'Imagen quitada');
}

// Cobertura parcial (0211): cuando Logística solo cubre una parte, pide a Redacción que
// difunda EL REMANENTE. La RPC crea un caso hijo que reutiliza los datos (y la
// verificación) del caso original, así que no vuelve a pasar por Verificación, y queda
// marcado como solicitud del área de Logística por cobertura parcial.
export async function solicitarCoberturaParcial(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const faltante = String(formData.get('faltante') ?? '').trim().slice(0, 300);
  const cantidad = String(formData.get('cantidad') ?? '').trim().slice(0, 100) || null;
  const nota = String(formData.get('nota') ?? '').trim().slice(0, 500) || null;
  if (!faltante) return redirigirError('/insumos/' + id, 'Indica qué falta por cubrir.');
  const { error } = await supabase.rpc('solicitar_cobertura_parcial', {
    p_solicitud: id, p_faltante: faltante, p_cantidad: cantidad, p_nota: nota,
  });
  if (error) {
    const m = (error.message || '').toLowerCase();
    if (/could not find the function|function .* does not exist|no existe la función/.test(m)) {
      return redirigirError('/insumos/' + id, 'Aún no disponible (falta aplicar la migración 0211).');
    }
    return redirigirError('/insumos/' + id, 'No se pudo enviar a Redacción: ' + error.message);
  }
  revalidatePath('/insumos'); revalidatePath('/insumos/' + id);
  revalidatePath('/envio-redaccion'); revalidatePath('/casos'); revalidatePath('/seguimiento');
  redirigirOk('/insumos/' + id, 'Enviada a Redacción: se creó una solicitud por lo que falta, marcada como cobertura parcial de Logística.');
}

// Devolver una entrega (petición #2b, decisión 4): deshace un «entregado» — la solicitud
// vuelve a «en ruta» y el caso ligado de resuelto→confirmado (vía RPC SECURITY DEFINER, que
// además pasa el guard 0116). El reabastecimiento de inventario es MANUAL.
export async function devolverEntregaInsumo(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const { error } = await supabase.rpc('devolver_entrega_insumo', { p_solicitud: id });
  if (error) return redirigirError('/insumos/' + id, 'No se pudo devolver la entrega: ' + error.message);
  revalidatePath('/insumos'); revalidatePath('/insumos/' + id); revalidatePath('/casos'); revalidatePath('/seguimiento');
  redirigirOk('/insumos/' + id, 'Entrega devuelta: la solicitud volvió a «en ruta» y el caso a «confirmado». Ajusta el inventario manualmente si hace falta.');
}

// Escalar una solicitud al departamento de Alianzas Estratégicas (0200): cuando Logística
// no puede cubrirla con inventario/proveedores, la envía a Alianzas (que busque una
// empresa/aliado) y/o pide «Voluntariado Profesional». Se marca en la propia solicitud
// (la RLS solins_update exige puede_logistica) y el trigger avisa al departamento.
export async function escalarSolicitud(formData: FormData) {
  const { supabase, userId } = await usuario();
  const id = String(formData.get('id'));
  const destino = String(formData.get('destino'));
  const ahora = new Date().toISOString();
  const patch: Record<string, any> = { actualizado_en: ahora };
  if (destino === 'voluntariado') {
    patch.voluntariado_profesional = true;
    patch.voluntariado_profesional_en = ahora;
    patch.voluntariado_profesional_por = userId;
  } else {
    patch.escalado_alianzas = true;
    patch.escalado_alianzas_en = ahora;
    patch.escalado_alianzas_por = userId;
  }
  const { error } = await supabase.from('solicitudes_insumo').update(patch).eq('id', id);
  if (error) {
    const m = (error.message || '').toLowerCase();
    if (/escalado_alianzas|voluntariado_profesional|column .* does not exist|no existe la columna/.test(m)) {
      return redirigirError('/insumos/' + id, 'Aún no disponible (falta aplicar la migración 0200).');
    }
    throw new Error('No se pudo escalar la solicitud: ' + error.message);
  }
  await supabase.rpc('registrar_auditoria', {
    p_accion: destino === 'voluntariado' ? 'solicitud_voluntariado_profesional' : 'solicitud_escalada_alianzas',
    p_entidad: 'solicitudes_insumo', p_entidad_id: id, p_metadata: {},
  });
  revalidatePath('/insumos'); revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, destino === 'voluntariado'
    ? 'Marcada como «Voluntariado Profesional». Alianzas fue avisada.'
    : 'Enviada a Alianzas Estratégicas. El departamento fue avisado.');
}

export async function asignarProveedorSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const proveedorId = String(formData.get('proveedor_id') ?? '').trim() || null;
  const { error } = await supabase.from('solicitudes_insumo').update({ proveedor_id: proveedorId }).eq('id', id);
  if (error) throw new Error('No se pudo asignar el proveedor: ' + error.message);
  revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, 'Proveedor asignado');
}

// Enlazar la solicitud al centro de acopio que la cubrirá (Fase 3: sugerencia del
// más cercano con existencias). La RLS (solins_update) exige puede_logistica().
export async function asignarCentroSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const puntoId = String(formData.get('punto_id') ?? '').trim() || null;
  const { error } = await supabase.from('solicitudes_insumo').update({ punto_id: puntoId }).eq('id', id);
  if (error) throw new Error('No se pudo asignar el centro: ' + error.message);
  revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, 'Centro de acopio asignado');
}

// Surtir la entrega DESDE el inventario del centro asignado: descuenta con la RPC atómica
// registrar_salida (0184) —que bloquea la fila y deja el asiento en la bitácora del centro—
// y, si se pide, marca la solicitud como entregada. Así «entregar» SÍ mueve inventario
// (antes se cerraba la solicitud sin descontar). La RPC exige puede_gestionar_acopio, que
// cubre a Logística. El motivo enlaza el asiento con la solicitud de origen.
// Desde 0221, si se indica a QUÉ ÍTEM del desglose corresponde lo surtido, la salida y el
// aporte se escriben juntos con `aportar_item_desde_centro`: el aporte queda enlazado al
// asiento de inventario por `movimiento_id` —la FK que faltaba— y el ítem se cierra solo
// al llegar al 100 %. Sin ítem elegido (o sin la migración aplicada) se mantiene el
// camino de siempre: `registrar_salida` a secas.
export async function surtirDesdeCentro(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const puntoId = String(formData.get('punto_id') ?? '').trim();
  const itemId = String(formData.get('item_id') ?? '').trim();
  const casoItemId = String(formData.get('caso_item_id') ?? '').trim();
  const cantidad = Number(String(formData.get('cantidad') ?? '').replace(',', '.'));
  const marcarEntregada = String(formData.get('marcar_entregada') ?? '') === '1';
  const forzarEntrega = String(formData.get('forzar') ?? '') === '1';
  if (!puntoId || !itemId) throw new Error('Elige el centro y el producto a surtir.');
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error('Indica cuánto se surte.');

  let aporteOk = false;
  if (casoItemId) {
    const { error } = await supabase.rpc('aportar_item_desde_centro', {
      p_item: casoItemId, p_punto: puntoId, p_producto: itemId, p_cantidad: cantidad, p_solicitud: id,
    });
    if (!error) aporteOk = true;
    else {
      const m = (error.message || '').toLowerCase();
      if (!/could not find the function|function .* does not exist|no existe la funci/.test(m)) {
        return redirigirError('/insumos/' + id, 'No se pudo surtir del inventario: ' + error.message);
      }
    }
  }
  if (!aporteOk) {
    const { data: sol } = await supabase.from('solicitudes_insumo').select('titulo').eq('id', id).maybeSingle();
    const ref = ((sol as any)?.titulo ? 'Entrega — ' + (sol as any).titulo : 'Entrega de solicitud') + ' (sol. ' + id.slice(0, 8) + ')';
    const { error } = await supabase.rpc('registrar_salida', {
      p_punto: puntoId, p_item: itemId, p_cantidad: cantidad, p_motivo: ref,
    });
    if (error) throw new Error('No se pudo surtir del inventario: ' + error.message);
  }

  let avisoEntrega = '';
  if (marcarEntregada) {
    const { error } = await supabase.rpc('entregar_solicitud_insumo', { p_solicitud: id, p_forzar: forzarEntrega });
    if (error) {
      const m = (error.message || '').toLowerCase();
      if (/could not find the function|function .* does not exist|no existe la funci/.test(m)) {
        await supabase.from('solicitudes_insumo').update({ estado: 'entregado', actualizado_en: new Date().toISOString() }).eq('id', id);
        avisoEntrega = ' · solicitud entregada';
      } else {
        // El stock YA se descontó y el aporte quedó registrado: no es un fallo, es que
        // aún falta cubrir algo. Se dice con todas las letras.
        revalidatePath('/insumos/' + id); revalidatePath('/acopio/' + puntoId); revalidatePath('/casos');
        return redirigirError('/insumos/' + id, 'Surtido registrado, pero la solicitud NO se marcó como entregada: ' + error.message);
      }
    } else avisoEntrega = ' · solicitud entregada';
  }

  revalidatePath('/insumos'); revalidatePath('/insumos/' + id); revalidatePath('/acopio/' + puntoId);
  revalidatePath('/casos'); revalidatePath('/envio-redaccion');
  redirigirOk('/insumos/' + id, 'Surtido del inventario' + (casoItemId && aporteOk ? ' y anotado en el ítem' : '') + avisoEntrega);
}

// Evidencia de entrega (Fase 3, paso 6 del flujograma): foto y/o nota que respalda
// que el recurso llegó. La RLS (solins_update) exige puede_logistica().
export async function guardarEvidenciaEntrega(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const nota = String(formData.get('nota') ?? '').trim() || null;
  const patch: Record<string, unknown> = { entrega_nota: nota, actualizado_en: new Date().toISOString() };
  const file = formData.get('evidencia');
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) throw new Error('La imagen no puede superar 8 MB.');
    if (!file.type.startsWith('image/')) throw new Error('La evidencia debe ser una imagen.');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const ruta = id + '/' + Date.now() + '.' + ext;
    const { path } = await subirArchivo(supabase, 'entregas', ruta, file, { publico: false });
    patch.entrega_evidencia_path = path;
  }
  const { error } = await supabase.from('solicitudes_insumo').update(patch).eq('id', id);
  if (error) throw new Error('No se pudo guardar la evidencia: ' + error.message);
  revalidatePath('/insumos/' + id);
  redirigirOk('/insumos/' + id, 'Evidencia guardada');
}

export async function eliminarSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('solicitudes_insumo').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/insumos');
  redirigirOk('/insumos', 'Solicitud eliminada');
}

// ── Proveedores ──
export async function crearProveedor(formData: FormData) {
  const { supabase, userId } = await usuario();
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio.');
  const { error } = await supabase.from('proveedores').insert({
    nombre,
    tipo: String(formData.get('tipo') ?? '').trim() || null,
    contacto: String(formData.get('contacto') ?? '').trim() || null,
    notas: String(formData.get('notas') ?? '').trim() || null,
    creado_por: userId,
  });
  if (error) throw new Error('No se pudo crear el proveedor: ' + error.message);
  revalidatePath('/insumos/proveedores');
  redirigirOk('/insumos/proveedores', 'Proveedor agregado');
}

export async function eliminarProveedor(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('proveedores').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar el proveedor: ' + error.message);
  revalidatePath('/insumos/proveedores');
  redirigirOk('/insumos/proveedores', 'Proveedor eliminado');
}

// ── Envíos ──
export async function crearEnvio(formData: FormData) {
  const { supabase, userId } = await usuario();
  const solicitudId = String(formData.get('solicitud_id'));
  const fleteRaw = String(formData.get('flete') ?? '').trim();
  const { error } = await supabase.from('envios').insert({
    solicitud_id: solicitudId,
    transportista_id: String(formData.get('transportista_id') ?? '').trim() || null,
    tipo_vehiculo: String(formData.get('tipo_vehiculo') ?? '').trim() || null,
    flete: fleteRaw ? Number(fleteRaw) : null,
    origen: String(formData.get('origen') ?? '').trim() || null,
    destino: String(formData.get('destino') ?? '').trim() || null,
    notas: String(formData.get('notas') ?? '').trim() || null,
    creado_por: userId,
  });
  if (error) throw new Error('No se pudo registrar el envío: ' + error.message);
  revalidatePath('/insumos/' + solicitudId);
  redirigirOk('/insumos/' + solicitudId, 'Envío registrado');
}

export async function eliminarEnvio(formData: FormData) {
  const { supabase } = await usuario();
  const solicitudId = String(formData.get('solicitud_id'));
  const { error } = await supabase.from('envios').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar el envío: ' + error.message);
  revalidatePath('/insumos/' + solicitudId);
  redirigirOk('/insumos/' + solicitudId, 'Envío eliminado');
}

// ── Donaciones ──
// Una donación se CREA al conectar una oferta con una solicitud (ver
// conectarConSolicitud en oportunidades/actions.ts). Su lista, con seguimiento de
// estado y borrado, vive dentro de «Oportunidades de donación» (flujo unificado);
// ya no hay una sección «Donaciones» aparte ni alta directa.
export async function cambiarEstadoDonacion(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('donaciones')
    .update({ estado: String(formData.get('estado')) }).eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo actualizar: ' + error.message);
  revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades', 'Donación actualizada');
}

export async function eliminarDonacion(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('donaciones').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar: ' + error.message);
  revalidatePath('/insumos/oportunidades');
  redirigirOk('/insumos/oportunidades', 'Donación eliminada');
}

// ── Transportistas de Logística (0159) ──
// Registro propio de conductores/transportistas que ofrecen el servicio. Alimenta el
// selector de «Conductor» al registrar un envío. Lo gestiona Logística (RLS puede_logistica).
export async function crearTransportista(formData: FormData) {
  const { supabase, userId } = await usuario();
  const nombre = String(formData.get('nombre') ?? '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio.');
  const { error } = await supabase.from('transportistas_logistica').insert({
    nombre,
    contacto: String(formData.get('contacto') ?? '').trim() || null,
    vehiculo: String(formData.get('vehiculo') ?? '').trim() || null,
    notas: String(formData.get('notas') ?? '').trim() || null,
    creado_por: userId,
  });
  if (error) throw new Error('No se pudo registrar el transportista: ' + error.message);
  revalidatePath('/insumos/transportistas');
  redirigirOk('/insumos/transportistas', 'Transportista registrado');
}

export async function alternarTransportista(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id'));
  const activo = String(formData.get('activo')) === 'true';
  const { error } = await supabase.from('transportistas_logistica').update({ activo }).eq('id', id);
  if (error) throw new Error('No se pudo actualizar: ' + error.message);
  revalidatePath('/insumos/transportistas');
  redirigirOk('/insumos/transportistas', activo ? 'Transportista activado' : 'Transportista desactivado');
}

export async function eliminarTransportista(formData: FormData) {
  const { supabase } = await usuario();
  const { error } = await supabase.from('transportistas_logistica').delete().eq('id', String(formData.get('id')));
  if (error) throw new Error('No se pudo eliminar el transportista: ' + error.message);
  revalidatePath('/insumos/transportistas');
  redirigirOk('/insumos/transportistas', 'Transportista eliminado');
}

// Registrar un transportista tomando los datos de un Donación-Ofrecimiento de transporte
// (organización → nombre, contacto y descripción). El índice único evita duplicarlo.
export async function registrarTransportistaDesdeOferta(formData: FormData) {
  const { supabase, userId } = await usuario();
  const oportunidadId = String(formData.get('oportunidad_id'));
  const { data: o } = await supabase.from('oportunidades_donacion')
    .select('organizacion, contacto, descripcion').eq('id', oportunidadId).maybeSingle();
  if (!o) throw new Error('Ofrecimiento no encontrado.');
  const { error } = await supabase.from('transportistas_logistica').insert({
    nombre: (o as any).organizacion || 'Transportista',
    contacto: (o as any).contacto || null,
    notas: (o as any).descripcion || null,
    oportunidad_id: oportunidadId,
    creado_por: userId,
  });
  if (error) {
    if ((error as any).code === '23505') throw new Error('Este ofrecimiento ya está registrado como transportista.');
    throw new Error('No se pudo registrar: ' + error.message);
  }
  revalidatePath('/insumos/oportunidades/' + oportunidadId);
  revalidatePath('/insumos/transportistas');
  redirigirOk('/insumos/oportunidades/' + oportunidadId, 'Registrado como transportista de Logística');
}

// ── Bitácora de la solicitud (0163): Logística y Captación dejan notas con registro ──
export async function registrarNotaSolicitud(formData: FormData) {
  const { supabase, userId } = await usuario();
  const solicitud_id = String(formData.get('solicitud_id') ?? '').trim();
  const contenido = String(formData.get('contenido') ?? '').trim().slice(0, 2000);
  if (!solicitud_id || !contenido) throw new Error('Escribe la nota.');
  // La RLS (bitsol_insert) exige autor propio + rol Logística o Captación.
  const { error } = await supabase.from('bitacora_solicitud')
    .insert({ solicitud_id, autor_id: userId, contenido });
  if (error) throw new Error('No se pudo guardar la nota: ' + error.message);
  // «Con registro»: la nota queda además en el Registro de actividad a nombre del autor.
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'nota_solicitud', p_entidad: 'solicitud_insumo', p_entidad_id: solicitud_id, p_metadata: {},
  });
  revalidatePath('/insumos/' + solicitud_id);
  redirigirOk('/insumos/' + solicitud_id, 'Nota registrada.');
}

export async function eliminarNotaSolicitud(formData: FormData) {
  const { supabase } = await usuario();
  const id = String(formData.get('id') ?? '').trim();
  const solicitud_id = String(formData.get('solicitud_id') ?? '').trim();
  if (!id) throw new Error('Falta la nota.');
  const { error } = await supabase.from('bitacora_solicitud').delete().eq('id', id);
  if (error) throw new Error('No se pudo eliminar la nota: ' + error.message);
  revalidatePath('/insumos/' + solicitud_id);
  redirigirOk('/insumos/' + solicitud_id, 'Nota eliminada.');
}

// ── Semáforo de PASOS por ítem (0220) ──
// Mover el avance de UN ítem del desglose. Toda la autorización y la validación de la
// transición viven en la RPC `avanzar_item` (SECURITY DEFINER, gate puede_logistica() or
// es_admin()): aquí no se decide nada, solo se traduce el error a un aviso legible.
// Vive en el módulo de Logística porque es SU trabajo —Recopilación y Verificación editan
// el CONTENIDO del desglose (`guardar_item_caso`, 0218), no su avance—, pero la acción se
// puede pasar como prop a cualquier pantalla que deba dejar moverlo.
export async function avanzarItem(formData: FormData) {
  const { supabase } = await usuario();
  const item = String(formData.get('item_id') ?? '').trim();
  const estado = String(formData.get('estado') ?? '').trim();
  const volver = String(formData.get('volver') ?? '').trim() || '/insumos';
  if (!item || !estado) return redirigirError(volver, 'Falta el ítem o el estado.');

  const { error } = await supabase.rpc('avanzar_item', { p_item: item, p_estado: estado });
  if (error) {
    const m = (error.message || '').toLowerCase();
    if (/could not find the function|function .* does not exist|no existe la funci/.test(m)) {
      return redirigirError(volver, 'El semáforo por ítem aún no está disponible (falta aplicar la migración 0220).');
    }
    return redirigirError(volver, 'No se pudo mover el ítem: ' + error.message);
  }
  // El avance de un ítem se ve desde varias áreas: se revalidan todas las pantallas que
  // lo pintan. Redacción, además, recibe el aviso en vivo por `casos_difusion_senal` (0181),
  // que el trigger de 0220 sella — nunca por `casos`, que le entregaría el contacto.
  revalidatePath('/insumos'); revalidatePath('/casos');
  revalidatePath('/envio-redaccion'); revalidatePath('/seguimiento');
  revalidatePath(volver);
  redirigirOk(volver, 'Ítem actualizado.');
}

// ── Cumplimiento por ítem (0221) ──
// Cuánto se consiguió de cada cosa y gracias a quién. La autorización, la validación del
// origen y el cierre del ítem al 100 % viven en la RPC `registrar_aporte_item`; aquí solo
// se recogen los campos y se traduce el error.
function revalidarCobertura(volver: string) {
  revalidatePath('/insumos'); revalidatePath('/casos');
  revalidatePath('/envio-redaccion'); revalidatePath('/seguimiento');
  if (volver) revalidatePath(volver);
}
function faltaMigracion0221(error: { message?: string }): boolean {
  const m = (error.message || '').toLowerCase();
  return /could not find the function|function .* does not exist|no existe la funci|casos_item_aportes/.test(m);
}

export async function registrarAporteItem(formData: FormData) {
  const { supabase } = await usuario();
  const item = String(formData.get('item_id') ?? '').trim();
  const volver = String(formData.get('volver') ?? '').trim() || '/insumos';
  if (!item) return redirigirError(volver, 'Falta el ítem.');
  const crudo = String(formData.get('cantidad') ?? '').replace(',', '.').trim();
  const cantidad = crudo === '' ? null : Number(crudo);
  if (cantidad !== null && (!Number.isFinite(cantidad) || cantidad <= 0)) {
    return redirigirError(volver, 'La cantidad aportada debe ser mayor que cero.');
  }
  const origen = String(formData.get('origen') ?? 'miembro').trim() || 'miembro';
  const tercero = String(formData.get('tercero') ?? '').trim().slice(0, 160) || null;
  if (origen === 'tercero' && !tercero) {
    return redirigirError(volver, 'Indica qué organización o persona lo cubrió.');
  }
  const { error } = await supabase.rpc('registrar_aporte_item', {
    p_item: item,
    p_cantidad: cantidad,
    p_origen: origen,
    p_tercero: tercero,
    p_nota: String(formData.get('nota') ?? '').trim().slice(0, 500) || null,
  });
  if (error) {
    if (faltaMigracion0221(error)) return redirigirError(volver, 'El cumplimiento por ítem aún no está disponible (falta aplicar la migración 0221).');
    return redirigirError(volver, 'No se pudo registrar el aporte: ' + error.message);
  }
  revalidarCobertura(volver);
  redirigirOk(volver, 'Aporte registrado.');
}

// P9 — «esto ya lo cubrió otra ONG o una persona ajena»: se da por cubierto, deja de
// gestionarse, y queda grabado QUIÉN lo cubrió para no contarlo como capacidad propia.
export async function marcarItemPorTercero(formData: FormData) {
  const { supabase } = await usuario();
  const item = String(formData.get('item_id') ?? '').trim();
  const volver = String(formData.get('volver') ?? '').trim() || '/insumos';
  const tercero = String(formData.get('tercero') ?? '').trim().slice(0, 160);
  if (!item) return redirigirError(volver, 'Falta el ítem.');
  if (!tercero) return redirigirError(volver, 'Indica qué organización o persona lo cubrió.');
  const { error } = await supabase.rpc('marcar_item_cubierto_tercero', {
    p_item: item, p_tercero: tercero,
    p_nota: String(formData.get('nota') ?? '').trim().slice(0, 500) || null,
  });
  if (error) {
    if (faltaMigracion0221(error)) return redirigirError(volver, 'El cumplimiento por ítem aún no está disponible (falta aplicar la migración 0221).');
    return redirigirError(volver, 'No se pudo marcar como cubierto por un tercero: ' + error.message);
  }
  revalidarCobertura(volver);
  redirigirOk(volver, 'Marcado como cubierto por «' + tercero + '». Deja de gestionarse y queda registrado que lo cubrió un tercero.');
}

export async function quitarAporteItem(formData: FormData) {
  const { supabase } = await usuario();
  const aporte = String(formData.get('aporte_id') ?? '').trim();
  const volver = String(formData.get('volver') ?? '').trim() || '/insumos';
  if (!aporte) return redirigirError(volver, 'Falta el aporte.');
  const { error } = await supabase.rpc('eliminar_aporte_item', { p_aporte: aporte });
  if (error) {
    if (faltaMigracion0221(error)) return redirigirError(volver, 'El cumplimiento por ítem aún no está disponible (falta aplicar la migración 0221).');
    return redirigirError(volver, 'No se pudo quitar el aporte: ' + error.message);
  }
  revalidarCobertura(volver);
  redirigirOk(volver, 'Aporte quitado. Si con eso el ítem baja del 100 %, vuelve a «en gestión».');
}
