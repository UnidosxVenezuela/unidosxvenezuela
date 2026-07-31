-- ============================================================
-- 0211 — Logística pide a Redacción lo que NO logró cubrir (cobertura parcial)
-- ------------------------------------------------------------
-- Petición del área de Logística: hay solicitudes que cubren solo PARCIALMENTE y
-- necesitan enviar a Redacción una solicitud por el remanente, para completar la
-- original. Estas NO pasan por Verificación (reutilizan los datos del caso ya
-- verificado), pero deben distinguirse CLARAMENTE como «solicitud del área de
-- Logística por cobertura parcial».
--
-- Antes solo existía el todo-o-nada: marcar la tarea «no disponible» ponía
-- requiere_difusion en el MISMO caso (0149). Eso obliga a abandonar la entrega
-- parcial ya lograda y no dice QUÉ falta.
--
-- Ahora: `solicitar_cobertura_parcial` crea un caso HIJO que
--   · copia los datos del caso padre (contacto, ubicación, fuente, categoría…),
--   · describe lo que FALTA (tipo, cantidad, nota),
--   · nace 'confirmado' y HEREDA la verificación del padre (no vuelve a Verificación;
--     el trigger notificar_caso_nuevo solo avisa en 'pendiente', así que no hace ruido),
--   · se deriva a 'redes' (ruteo explícito 0208) y se marca requiere_difusion para que
--     entre en la cola de Redacción como prioridad,
--   · queda marcado con origen_area='logistica' + caso_padre_id → insignia en la UI.
--
-- Idempotente. Ejecutar tras 0210.
-- ============================================================

-- ── Procedencia del caso: qué área lo originó y de qué caso viene ──
alter table public.casos add column if not exists origen_area   text;
alter table public.casos add column if not exists caso_padre_id uuid references public.casos (id) on delete set null;
create index if not exists idx_casos_padre on public.casos (caso_padre_id) where caso_padre_id is not null;

comment on column public.casos.origen_area is
  'Área que ORIGINÓ la solicitud cuando no viene de Recopilación. Hoy: «logistica» (cobertura parcial, 0211).';
comment on column public.casos.caso_padre_id is
  'Caso del que deriva esta solicitud (p. ej. el remanente que Logística no pudo cubrir, 0211).';

-- ── RPC: crear la solicitud de cobertura parcial ──
-- SECURITY DEFINER: Logística no inserta en `casos` por RLS (casos_insert exige
-- recopilación/admin) ni deriva (derivar_caso exige Verificación). Aquí se hace de
-- forma acotada y auditada.
create or replace function public.solicitar_cobertura_parcial(
  p_solicitud uuid,
  p_faltante  text,
  p_cantidad  text default null,
  p_nota      text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sol    record;
  v_padre  record;
  v_falta  text;
  v_cant   text;
  v_nota   text;
  v_nuevo  uuid;
  v_desc   text;
  v_req    boolean;
  v_prio   text;
begin
  if not (public.es_admin() or public.puede_logistica()) then
    raise exception 'Solo Logística puede pedir la cobertura parcial de una solicitud.' using errcode = '42501';
  end if;

  select id, caso_id, titulo, tipo, urgencia into v_sol
    from public.solicitudes_insumo where id = p_solicitud;
  if v_sol.id is null then
    raise exception 'Solicitud de insumo no encontrada.' using errcode = 'P0002';
  end if;
  if v_sol.caso_id is null then
    raise exception 'Esta tarea de Logística no viene de una solicitud del flujo, así que no hay datos que reutilizar.'
      using errcode = '22023';
  end if;

  select * into v_padre from public.casos where id = v_sol.caso_id;
  if v_padre.id is null then
    raise exception 'No se encontró la solicitud de origen.' using errcode = 'P0002';
  end if;
  if v_padre.categoria is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de «Desaparecidos» no se difunden por esta vía.' using errcode = '42501';
  end if;

  v_falta := nullif(trim(coalesce(p_faltante, '')), '');
  if v_falta is null then
    raise exception 'Indica qué falta por cubrir.' using errcode = '22023';
  end if;
  v_cant := nullif(trim(coalesce(p_cantidad, '')), '');
  v_nota := nullif(trim(coalesce(p_nota, '')), '');

  -- Descripción autoexplicativa: qué falta + contexto del caso original.
  v_desc := 'Cobertura parcial de Logística. FALTA POR CUBRIR: ' || v_falta
            || case when v_cant is not null then ' (' || v_cant || ')' else '' end || '.'
            || case when v_nota is not null then E'\nNota de Logística: ' || v_nota else '' end
            || E'\n\n— Solicitud original #' || lpad(v_padre.numero::text, 5, '0')
            || case when coalesce(v_padre.descripcion, '') <> '' then ': ' || v_padre.descripcion else '' end;

  -- casos_requerimiento_chk (0112) exige ubicación si es requerimiento.
  v_req := (v_padre.lat is not null and v_padre.lng is not null);

  -- La urgencia del insumo es `prioridad` (baja/media/alta/critica), pero la derivación
  -- solo admite alta/media/baja (chk_derivacion_prioridad): «crítica» entra como «alta».
  v_prio := lower(coalesce(nullif(coalesce(v_sol.urgencia, v_padre.req_urgencia)::text, ''), 'media'));
  if v_prio = 'critica' then v_prio := 'alta'; end if;
  if v_prio not in ('alta','media','baja') then v_prio := 'media'; end if;

  insert into public.casos (
    titulo, descripcion, categoria, fuente, fuente_url, fuente_tipo, fecha_publicacion,
    estado, creado_por, es_requerimiento, req_tipo, req_cantidad, req_urgencia,
    lat, lng, ubicacion_estado, ubicacion_municipio, ubicacion_parroquia, ubicacion_sector, ubicacion_direccion,
    contacto, referente, referente_rol, contacto_whatsapp, contacto_instagram,
    contacto_difusion, autoriza_difusion, personas_afectadas,
    requiere_difusion, origen_area, caso_padre_id
  ) values (
    'Falta por cubrir · ' || coalesce(v_padre.titulo, 'solicitud'),
    v_desc,
    v_padre.categoria, v_padre.fuente, v_padre.fuente_url, v_padre.fuente_tipo, v_padre.fecha_publicacion,
    'confirmado', auth.uid(), v_req,
    coalesce(v_sol.tipo, v_padre.req_tipo), v_cant, coalesce(v_sol.urgencia, v_padre.req_urgencia),
    v_padre.lat, v_padre.lng, v_padre.ubicacion_estado, v_padre.ubicacion_municipio,
    v_padre.ubicacion_parroquia, v_padre.ubicacion_sector, v_padre.ubicacion_direccion,
    v_padre.contacto, v_padre.referente, v_padre.referente_rol, v_padre.contacto_whatsapp, v_padre.contacto_instagram,
    v_padre.contacto_difusion, v_padre.autoriza_difusion, v_padre.personas_afectadas,
    true, 'logistica', v_padre.id
  ) returning id into v_nuevo;

  -- HEREDA la verificación del padre: no vuelve a pasar por Verificación (reutiliza sus
  -- datos ya verificados). Queda constancia en la nota de cada campo.
  insert into public.casos_verificacion_campo (caso_id, campo, estado, nota, verificado_por, verificado_en)
  select v_nuevo, v.campo, v.estado,
         'Heredado de la solicitud #' || lpad(v_padre.numero::text, 5, '0') || ' (cobertura parcial de Logística).',
         auth.uid(), now()
  from public.casos_verificacion_campo v
  where v.caso_id = v_padre.id and v.estado = 'verificado';

  -- Si el padre no era requerimiento y este sí, completa los campos que exige el
  -- semáforo para un requerimiento (ubicación/cantidad) con la misma constancia.
  if v_req then
    insert into public.casos_verificacion_campo (caso_id, campo, estado, nota, verificado_por, verificado_en)
    select v_nuevo, c.campo, 'verificado',
           'Heredado de la solicitud #' || lpad(v_padre.numero::text, 5, '0') || ' (cobertura parcial de Logística).',
           auth.uid(), now()
    from (values ('ubicacion'), ('cantidad')) as c(campo)
    where not exists (select 1 from public.casos_verificacion_campo x
                      where x.caso_id = v_nuevo and x.campo = c.campo);
  end if;

  -- Ruteo explícito (0208): va a REDES. El trigger de Logística solo dispara con
  -- area='logistica', así que no se genera otra tarea de Logística (sin bucles).
  insert into public.casos_derivaciones
    (caso_id, area, accion, prioridad, observaciones, estado, derivado_por, derivado_en, actualizado_en)
  values (
    v_nuevo, 'redes',
    'Difundir lo que falta por cubrir',
    v_prio,
    'Cobertura parcial: Logística cubrió una parte y falta ' || v_falta || '.',
    'sin_tomar', auth.uid(), now(), now()
  )
  on conflict (caso_id, area) do nothing;

  -- Aviso a Redacción / Redes.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'difusion_requerida', 'Logística pide difundir lo que falta',
         'Una solicitud se cubrió solo en parte. Falta: ' || v_falta || '.',
         '/envio-redaccion?caso=' || v_nuevo
  from public.perfiles p
  where p.verificado
    and p.id is distinct from auth.uid()
    and (p.rol in ('redaccion'::public.rol_usuario, 'admin_redes'::public.rol_usuario)
         or p.roles_extra && array['redaccion','admin_redes']::public.rol_usuario[]);

  perform public.registrar_auditoria('solicitar_cobertura_parcial', 'casos', v_nuevo::text,
    jsonb_build_object('solicitud_id', p_solicitud, 'caso_padre', v_padre.id, 'falta', v_falta));

  return v_nuevo;
end $$;

revoke all on function public.solicitar_cobertura_parcial(uuid, text, text, text) from public;
grant execute on function public.solicitar_cobertura_parcial(uuid, text, text, text) to authenticated;

comment on function public.solicitar_cobertura_parcial(uuid, text, text, text) is
  'Logística (0211): crea un caso HIJO con lo que NO se pudo cubrir, reutilizando los datos del caso padre y su verificación (no pasa por Verificación). Nace confirmado, se deriva a «redes» y queda marcado origen_area=logistica + caso_padre_id.';

-- ── casos_difusion: 0209 VERBATIM + procedencia (para la insignia en Redacción) ──
drop view if exists public.casos_difusion;
create view public.casos_difusion
  with (security_invoker = false) as
  select
    c.id, c.numero, c.titulo, c.descripcion, c.categoria,
    c.fuente, c.fuente_url, c.fecha_publicacion,
    c.contacto_difusion, c.autoriza_difusion, c.notas,
    c.creado_por, c.actualizado_en, c.requiere_difusion,
    c.es_requerimiento, c.req_tipo, c.req_cantidad, c.req_urgencia,
    c.lat, c.lng, c.estado, c.publicado_en, c.publicacion_url,
    c.redactor_id, c.canales_publicacion,
    c.tipo_difusion, c.url_original,
    c.contacto, c.referente, c.contacto_whatsapp, c.contacto_instagram, c.referente_rol,
    -- Procedencia (0211): distingue la solicitud creada por Logística por cobertura parcial.
    c.origen_area, c.caso_padre_id,
    (select p.numero from public.casos p where p.id = c.caso_padre_id) as caso_padre_numero
  from public.casos c
  where c.categoria is distinct from 'Desaparecidos'
    and (
      c.publicado_en is not null
      or c.requiere_difusion
      or c.estado::text = 'enviado_redaccion'
      or exists (select 1 from public.casos_derivaciones d where d.caso_id = c.id and d.area = 'redes')
    )
    and public.es_verificado()
    and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'));

grant select on public.casos_difusion to authenticated;

comment on view public.casos_difusion is
  'Fuente de Redacción/Redes. Ruteo EXPLÍCITO (0208): solo lo derivado a «redes» / enviado a redacción / requiere_difusion / publicado. Expone el contacto interno (0209) y la procedencia del caso (0211: origen_area/caso_padre_*). Se auto-acota por rol.';

-- ── seguimiento_casos: 0209 VERBATIM + procedencia (visible para todas las áreas) ──
drop function if exists public.seguimiento_casos(text);
create function public.seguimiento_casos(p_q text default null)
returns table (
  id uuid,
  numero bigint,
  titulo text,
  categoria text,
  estado text,
  es_requerimiento boolean,
  req_tipo text,
  req_urgencia text,
  ubicacion_estado text,
  ubicacion_municipio text,
  validado boolean,
  publicado_en timestamptz,
  notas text,
  origen_area text,
  caso_padre_numero bigint,
  creado_en timestamptz,
  actualizado_en timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  v_num text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
  v_txt text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.es_verificado() then
    return;
  end if;

  return query
    select c.id, c.numero, c.titulo, c.categoria, c.estado::text,
           c.es_requerimiento, c.req_tipo::text, c.req_urgencia::text,
           c.ubicacion_estado, c.ubicacion_municipio,
           public.caso_esta_validado(c.id), c.publicado_en, c.notas,
           c.origen_area,
           (select p.numero from public.casos p where p.id = c.caso_padre_id),
           c.creado_en, c.actualizado_en
    from public.casos c
    where c.categoria is distinct from 'Desaparecidos'
      and (
        v_txt is null
        or c.titulo ilike '%' || v_txt || '%'
        or (v_num is not null and c.numero = v_num::bigint)
      )
    order by c.actualizado_en desc
    limit 100;
end $$;

revoke all on function public.seguimiento_casos(text) from public;
grant execute on function public.seguimiento_casos(text) to authenticated;

comment on function public.seguimiento_casos(text) is
  'Paso 5 (cross-área): recorrido/estado de solicitudes para todo el personal verificado. Suma publicado_en y notas (0209) y la procedencia del caso (0211). Excluye Desaparecidos.';
