-- ============================================================
-- 0240 — Gestor Integral de Casos · Fase 2: pedir información con forma
-- ------------------------------------------------------------
-- LO QUE PIDE LA PROPUESTA (sección 3, «Autoridad para solicitar información»): que el
--   gestor pueda pedir un dato o una evidencia a CUALQUIER área, y que cada solicitud deje
--   registrado el dato requerido, el responsable, el motivo, la fecha límite y el
--   resultado esperado para permitir el avance.
--
-- LO QUE HABÍA: `casos.info_requerida` (0142), que es OTRA COSA y se queda como está. Ese
--   campo es el de «devolver a Recopilación»: Verificación escribe qué falta, el caso
--   vuelve a 'en_proceso', se suelta al verificador y se avisa a quien lo reportó. Es un
--   solo texto, una sola solicitud a la vez y siempre al mismo destinatario. Sirve para lo
--   suyo y no se toca; lo que no puede es pedirle un flete a Logística ni un contacto a
--   Alianzas, que es justo lo que el gestor necesita.
--
-- Y ADEMÁS DESBLOQUEA EL CUARTO REPORTE. En 0239 quedó dicho que «bloqueado» no se podía
--   calcular todavía y por qué: un caso no está bloqueado por llevar N días quieto, sino
--   porque ESPERA UN DATO QUE ALGUIEN PIDIÓ Y NO LLEGA. Con esta tabla eso ya es una
--   consulta, no una corazonada: bloqueado = tiene al menos una solicitud ABIERTA con la
--   fecha límite pasada. Ahora sí entra en `casos_gestion_control`.
--
-- «VENCIDA» NO ES UN ESTADO GUARDADO, se deriva de `vence_en < now()`. Guardarlo obligaría
--   a un proceso que recorra la tabla cada hora para mantenerlo al día, y un estado que se
--   pone solo tarde o temprano miente. Los estados guardados son los tres que cambia una
--   persona: abierta → respondida → cerrada.
--
-- QUIÉN RESPONDE: una PERSONA, un ÁREA, o las dos. Al menos una, por CHECK. Solo área
--   reparte pero no compromete a nadie; solo persona compromete pero se cae si esa persona
--   no está. Se deja elegir, y la interfaz empuja a poner persona cuando se sabe quién.
--
-- ESCRITURA solo por RPC (molde 0172, como 0234 y 0238): la tabla publica ÚNICAMENTE
--   policy de SELECT.
--
-- Idempotente. Ejecutar tras 0239.
-- ============================================================

-- ═══ (1) Quién puede atender una petición dirigida a un área ═══
-- Extiende `puede_operar_area_derivacion` (0198) con las dos áreas internas: allí caen en
-- el `else` y quedarían en manos de administración, con lo que una petición a Verificación
-- no la podría contestar ni Verificación.
create or replace function public.puede_atender_area_info(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_area
    when 'verificacion' then public.es_admin() or public.tiene_rol('verificador') or public.es_mando_verificacion()
    when 'recopilacion' then public.es_admin() or public.tiene_rol('recopilacion') or public.es_mando_recopilacion()
    else public.puede_operar_area_derivacion(p_area)
  end;
$$;
grant execute on function public.puede_atender_area_info(text) to authenticated;

-- ═══ (2) La tabla ═══
create table if not exists public.casos_solicitudes_info (
  id                  uuid primary key default gen_random_uuid(),
  caso_id             uuid not null references public.casos(id) on delete cascade,
  -- Los cinco campos que pide la propuesta.
  dato                text not null,
  motivo              text,
  resultado_esperado  text,
  area                text,
  responsable_id      uuid references public.perfiles(id) on delete set null,
  vence_en            timestamptz not null,
  -- Los tres estados que cambia una persona. «Vencida» se deriva de vence_en.
  estado              text not null default 'abierta'
                      check (estado in ('abierta','respondida','cerrada')),
  respuesta           text,
  respondida_por      uuid references public.perfiles(id) on delete set null,
  respondida_en       timestamptz,
  nota_cierre         text,
  cerrada_por         uuid references public.perfiles(id) on delete set null,
  cerrada_en          timestamptz,
  solicitada_por      uuid references public.perfiles(id) on delete set null,
  solicitante_sello   text not null,
  creado_en           timestamptz not null default now(),
  -- Una petición sin destinatario es un recordatorio, no una petición.
  constraint csi_destinatario_chk check (area is not null or responsable_id is not null),
  constraint csi_area_chk check (area is null or area in
    ('logistica','redes','donaciones','alianzas','coordinacion','otra','verificacion','recopilacion'))
);

create index if not exists idx_csi_caso on public.casos_solicitudes_info (caso_id, estado);
create index if not exists idx_csi_responsable on public.casos_solicitudes_info (responsable_id, estado);
-- El índice del reporte que esta migración desbloquea: lo abierto y vencido.
create index if not exists idx_csi_abiertas on public.casos_solicitudes_info (vence_en)
  where estado = 'abierta';

comment on table public.casos_solicitudes_info is
  'Solicitudes de información del Gestor de Casos (0240): qué dato falta, quién lo debe traer, por qué, para cuándo y qué desbloquea. Distinta de casos.info_requerida (0142), que es la devolución a Recopilación. Escritura solo por pedir/responder/cerrar_info_caso().';
comment on column public.casos_solicitudes_info.vence_en is
  'Fecha límite. «Vencida» NO se guarda: se deriva de aquí, para no depender de un proceso que mantenga un estado al día.';
comment on column public.casos_solicitudes_info.solicitante_sello is
  'Nombre congelado. solicitada_por es ON DELETE SET NULL para que dar de baja una cuenta no borre de quién salió la petición.';

-- ═══ (3) RLS ═══
alter table public.casos_solicitudes_info enable row level security;

drop policy if exists csi_select on public.casos_solicitudes_info;
create policy csi_select on public.casos_solicitudes_info for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or public.es_mando_verificacion()
    or solicitada_por = auth.uid()
    or responsable_id = auth.uid()
    or (area is not null and public.puede_atender_area_info(area))
    or exists (select 1 from public.casos c where c.id = caso_id and c.gestor_id = auth.uid())
  ));

-- Sin policy de INSERT/UPDATE/DELETE a propósito (molde 0172).
drop policy if exists csi_insert on public.casos_solicitudes_info;
drop policy if exists csi_update on public.casos_solicitudes_info;
drop policy if exists csi_delete on public.casos_solicitudes_info;

grant select on public.casos_solicitudes_info to authenticated;

-- ═══ (4) Pedir ═══
drop function if exists public.pedir_info_caso(uuid, text, text, text, text, uuid, timestamptz);
create function public.pedir_info_caso(
  p_caso        uuid,
  p_dato        text,
  p_motivo      text default null,
  p_resultado   text default null,
  p_area        text default null,
  p_responsable uuid default null,
  p_vence       timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caso   record;
  v_dato   text := nullif(btrim(coalesce(p_dato, '')), '');
  v_area   text := nullif(btrim(coalesce(p_area, '')), '');
  v_sello  text;
  v_id     uuid;
  v_titulo text;
begin
  select id, categoria, titulo, gestor_id, req_urgencia into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Esa solicitud no existe.' using errcode = '22023';
  end if;
  if v_caso.categoria is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de Desaparecidos siguen el circuito de Búsqueda.' using errcode = '22023';
  end if;
  -- Mismo gate que fijar la próxima acción: es el trabajo del dueño del caso.
  if not (public.es_admin() or public.es_mando_verificacion()
          or (v_caso.gestor_id is not null and v_caso.gestor_id = auth.uid())) then
    raise exception 'Solo el gestor del caso, su líder o administración piden información.'
      using errcode = '42501';
  end if;
  if v_dato is null then
    raise exception 'Di qué dato o evidencia hace falta.' using errcode = '22023';
  end if;
  if v_area is null and p_responsable is null then
    raise exception 'Indica a quién se le pide: una persona, un área, o las dos.' using errcode = '22023';
  end if;
  if v_area is not null and v_area not in
     ('logistica','redes','donaciones','alianzas','coordinacion','otra','verificacion','recopilacion') then
    raise exception 'Área no válida.' using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(p.nombre_completo), ''), 'Gestión de Casos') into v_sello
    from public.perfiles p where p.id = auth.uid();

  insert into public.casos_solicitudes_info
    (caso_id, dato, motivo, resultado_esperado, area, responsable_id, vence_en,
     solicitada_por, solicitante_sello)
  values (
    p_caso, left(v_dato, 500), left(nullif(btrim(coalesce(p_motivo, '')), ''), 1000),
    left(nullif(btrim(coalesce(p_resultado, '')), ''), 1000), v_area, p_responsable,
    -- Sin fecha explícita, la que toque por urgencia (0239). Nunca se queda sin reloj.
    coalesce(p_vence, now() + public.plazo_seguimiento(v_caso.req_urgencia::text)),
    auth.uid(), coalesce(v_sello, 'Gestión de Casos')
  ) returning id into v_id;

  v_titulo := coalesce(nullif(btrim(v_caso.titulo), ''), 'una solicitud');

  -- Aviso a quien le toca. A la PERSONA si la hay; si no, a quien opere el área.
  if p_responsable is not null then
    if p_responsable is distinct from auth.uid() then
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      -- El enlace va a «Me piden» y NO al caso: quien recibe la petición puede ser de
      -- Logística o Alianzas, que no leen `casos` por RLS, y el enlace los devolvería al
      -- panel. Allí ven la petición entera y la contestan.
      values (p_responsable, 'info_solicitada', 'Te piden un dato para avanzar un caso',
              left(v_dato, 140), '/gestion-casos?vista=piden');
    end if;
  elsif v_area is not null then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'info_solicitada', 'Le piden un dato a tu área para avanzar un caso',
           left(v_dato, 140), '/gestion-casos?vista=piden'
      from public.perfiles p
     where p.verificado and p.id is distinct from auth.uid()
       and exists (
         select 1 from unnest(public.roles_area_derivacion(v_area)) r
          where r = p.rol or r = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
       );
  end if;

  perform public.registrar_auditoria('caso_info_solicitada', 'casos', p_caso::text,
    jsonb_build_object('solicitud', v_id, 'area', v_area, 'responsable', p_responsable));
  return v_id;
end $$;

revoke all on function public.pedir_info_caso(uuid, text, text, text, text, uuid, timestamptz) from public;
grant execute on function public.pedir_info_caso(uuid, text, text, text, text, uuid, timestamptz) to authenticated;

-- ═══ (5) Responder ═══
drop function if exists public.responder_info_caso(uuid, text);
create function public.responder_info_caso(p_id uuid, p_respuesta text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record; v_resp text := nullif(btrim(coalesce(p_respuesta, '')), ''); v_gestor uuid;
begin
  select s.*, c.gestor_id as caso_gestor, c.titulo as caso_titulo
    into v_s
    from public.casos_solicitudes_info s
    join public.casos c on c.id = s.caso_id
   where s.id = p_id;
  if v_s.id is null then
    raise exception 'Esa petición no existe.' using errcode = '22023';
  end if;
  if v_s.estado = 'cerrada' then
    raise exception 'Esa petición ya está cerrada.' using errcode = '23514';
  end if;
  if not (public.es_admin() or public.es_mando_verificacion()
          or v_s.responsable_id = auth.uid()
          or (v_s.area is not null and public.puede_atender_area_info(v_s.area))
          or v_s.caso_gestor = auth.uid()) then
    raise exception 'Esta petición no es tuya ni de tu área.' using errcode = '42501';
  end if;
  if v_resp is null then
    raise exception 'Escribe la respuesta.' using errcode = '22023';
  end if;

  update public.casos_solicitudes_info
     set estado = 'respondida', respuesta = left(v_resp, 2000),
         respondida_por = auth.uid(), respondida_en = now()
   where id = p_id;

  -- Avisa a quien la pidió y al gestor del caso (que suelen ser la misma persona, de ahí
  -- el distinct: nadie necesita el mismo aviso dos veces).
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select d, 'info_respondida', 'Respondieron lo que pediste',
         left(v_resp, 140), '/casos?caso=' || v_s.caso_id
    from (select distinct unnest(array[v_s.solicitada_por, v_s.caso_gestor]) as d) x
   where d is not null and d is distinct from auth.uid();

  perform public.registrar_auditoria('caso_info_respondida', 'casos', v_s.caso_id::text,
    jsonb_build_object('solicitud', p_id));
end $$;

revoke all on function public.responder_info_caso(uuid, text) from public;
grant execute on function public.responder_info_caso(uuid, text) to authenticated;

-- ═══ (6) Cerrar ═══
-- La da por buena (o por descartada) quien la pidió. Que responder y cerrar sean pasos
-- distintos es a propósito: si respondiéndola se cerrara sola, «me respondieron algo que
-- no sirve» no tendría dónde quedar registrado y el caso seguiría pareciendo desbloqueado.
drop function if exists public.cerrar_info_caso(uuid, text);
create function public.cerrar_info_caso(p_id uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_s record;
begin
  select s.*, c.gestor_id as caso_gestor into v_s
    from public.casos_solicitudes_info s
    join public.casos c on c.id = s.caso_id
   where s.id = p_id;
  if v_s.id is null then
    raise exception 'Esa petición no existe.' using errcode = '22023';
  end if;
  if not (public.es_admin() or public.es_mando_verificacion()
          or v_s.solicitada_por = auth.uid() or v_s.caso_gestor = auth.uid()) then
    raise exception 'Cierra la petición quien la pidió, el gestor del caso o su líder.'
      using errcode = '42501';
  end if;

  update public.casos_solicitudes_info
     set estado = 'cerrada', nota_cierre = left(nullif(btrim(coalesce(p_nota, '')), ''), 1000),
         cerrada_por = auth.uid(), cerrada_en = now()
   where id = p_id;

  perform public.registrar_auditoria('caso_info_cerrada', 'casos', v_s.caso_id::text,
    jsonb_build_object('solicitud', p_id));
end $$;

revoke all on function public.cerrar_info_caso(uuid, text) from public;
grant execute on function public.cerrar_info_caso(uuid, text) to authenticated;

-- ═══ (7) Lo que me piden ═══
drop function if exists public.mis_solicitudes_info();
create function public.mis_solicitudes_info()
returns table (
  id            uuid,
  caso_id       uuid,
  caso_numero   bigint,
  caso_titulo   text,
  dato          text,
  motivo        text,
  resultado_esperado text,
  area          text,
  vence_en      timestamptz,
  vencida       boolean,
  estado        text,
  solicitante   text,
  es_mia        boolean,
  creado_en     timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.es_verificado() then
    return;
  end if;

  return query
    select s.id, s.caso_id, c.numero, c.titulo, s.dato, s.motivo, s.resultado_esperado,
           s.area, s.vence_en, (s.vence_en < now() and s.estado = 'abierta'), s.estado,
           s.solicitante_sello,
           -- Dirigida a mí en persona: va primero y no se puede escurrir en «es de mi área».
           (s.responsable_id = auth.uid()),
           s.creado_en
      from public.casos_solicitudes_info s
      join public.casos c on c.id = s.caso_id
     where s.estado <> 'cerrada'
       and (s.responsable_id = auth.uid()
            or (s.responsable_id is null and s.area is not null
                and public.puede_atender_area_info(s.area)))
     order by (s.responsable_id = auth.uid()) desc, s.vence_en
     limit 200;
end $$;

revoke all on function public.mis_solicitudes_info() from public;
grant execute on function public.mis_solicitudes_info() to authenticated;

-- ═══ (8) «Bloqueado» entra por fin en el reporte de control ═══
-- Ahora es una consulta y no una corazonada: espera un dato que se pidió y no llegó.
-- Va justo detrás de «sin responsable» porque un caso bloqueado no se destraba solo —hay
-- alguien a quien hay que ir a buscar—, mientras que uno vencido a veces solo necesita
-- que su gestor lo mire.
drop function if exists public.casos_gestion_control(text);
create function public.casos_gestion_control(p_situacion text default null)
returns table (
  id               uuid,
  numero           bigint,
  titulo           text,
  categoria        text,
  estado           text,
  urgencia         text,
  pais             text,
  gestor_id        uuid,
  gestor_nombre    text,
  proxima_accion   text,
  proxima_revision timestamptz,
  area_siguiente   text,
  situacion        text,
  actualizado_en   timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_admin() or public.es_mando_verificacion() or public.es_gestor_casos()) then
    return;
  end if;

  return query
  with base as (
    select c.id, c.numero, c.titulo, c.categoria, c.estado::text as estado,
           c.req_urgencia::text as urgencia, c.pais, c.gestor_id,
           c.proxima_accion, c.proxima_revision, c.area_siguiente, c.actualizado_en,
           case
             when c.gestor_id is null then 'sin_gestor'
             when exists (select 1 from public.casos_solicitudes_info s
                           where s.caso_id = c.id and s.estado = 'abierta' and s.vence_en < now())
               then 'bloqueado'
             when c.proxima_revision is not null and c.proxima_revision < now() then 'vencido'
             when c.proxima_accion is null then 'sin_proxima'
             when coalesce((select ci.pct_items from public.cobertura_items_caso(c.id) ci), 0) >= 100
               then 'por_cerrar'
             else 'al_dia'
           end as situacion
      from public.casos c
     where c.categoria is distinct from 'Desaparecidos'
       and c.estado::text not in ('resuelto', 'desestimado', 'falso')
  )
  select b.id, b.numero, b.titulo, b.categoria, b.estado, b.urgencia, b.pais,
         b.gestor_id,
         (select coalesce(nullif(btrim(p.nombre_completo), ''), 'Sin nombre')
            from public.perfiles p where p.id = b.gestor_id),
         b.proxima_accion, b.proxima_revision, b.area_siguiente, b.situacion, b.actualizado_en
    from base b
   where (p_situacion is null and b.situacion <> 'al_dia')
      or b.situacion = p_situacion
   order by case b.situacion
              when 'sin_gestor'  then 0
              when 'bloqueado'   then 1
              when 'vencido'     then 2
              when 'sin_proxima' then 3
              when 'por_cerrar'  then 4
              else 5 end,
            b.proxima_revision nulls first,
            b.actualizado_en desc
   limit 300;
end $$;

revoke all on function public.casos_gestion_control(text) from public;
grant execute on function public.casos_gestion_control(text) to authenticated;

comment on function public.casos_gestion_control(text) is
  'Reportes de control del Gestor de Casos (0239, ampliado en 0240): sin_gestor, bloqueado, vencido, sin_proxima y por_cerrar. «Bloqueado» = tiene una solicitud de información abierta y vencida; es una consulta, no una corazonada.';
