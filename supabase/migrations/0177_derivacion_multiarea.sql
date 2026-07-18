-- ============================================================
-- 0177 — Derivación multi-área (Requerimiento Paso 9)
-- ------------------------------------------------------------
-- Una vez que una solicitud está VALIDADA (todos los campos del semáforo en
-- verde, según `caso_esta_validado` de 0173), Verificación la DERIVA a una o
-- varias áreas de destino (Logística, Redes Sociales, Donaciones, Alianzas
-- Estratégicas, Coordinación u Otra), cada una con responsable, acción
-- requerida, prioridad y observaciones internas. Cada derivación lleva su
-- propio estado operativo (sin_tomar → tomada → en_proceso → cerrada), visible
-- para TODAS las áreas (Paso 5), de modo que ningún caso quede «perdido».
--
-- Regla institucional crítica (Paso 9): NINGÚN área recibe una derivación si el
-- caso no está Validado. Se aplica por partida doble: la RPC lo verifica (para
-- dar un mensaje claro) y un trigger BEFORE INSERT lo GARANTIZA a nivel de tabla,
-- bajo cualquier ruta de escritura.
--
-- Las escrituras van SOLO por RPC SECURITY DEFINER; la tabla no expone políticas
-- de INSERT/UPDATE/DELETE. Los avisos a cada área destino se insertan en
-- `notificaciones` (el Database Webhook de 0060 manda el push; titulo/cuerpo
-- propios, sin depender de un catálogo de tipos).
--
-- «Área» no es una columna en esta plataforma: todo se enruta por `rol_usuario`.
-- Por eso el área de destino es un enum propio (texto) que se mapea a los roles
-- existentes para (a) quién puede tomar/avanzar/cerrar y (b) a quién se notifica.
-- Idempotente. Ejecutar tras 0176.
-- ============================================================

-- ── Tabla de derivaciones (1 fila por caso × área) ──
create table if not exists public.casos_derivaciones (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos(id) on delete cascade,
  area           text not null,
  responsable_id uuid references public.perfiles(id) on delete set null,
  accion         text,
  prioridad      text not null default 'media',
  observaciones  text,
  estado         text not null default 'sin_tomar',
  derivado_por   uuid references public.perfiles(id) on delete set null,
  derivado_en    timestamptz not null default now(),
  tomado_por     uuid references public.perfiles(id) on delete set null,
  tomado_en      timestamptz,
  cerrado_por    uuid references public.perfiles(id) on delete set null,
  cerrado_en     timestamptz,
  motivo_cierre  text,
  actualizado_en timestamptz not null default now()
);

-- CHECKs (idempotentes)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_derivacion_area') then
    alter table public.casos_derivaciones add constraint chk_derivacion_area
      check (area in ('logistica','redes','donaciones','alianzas','coordinacion','otra'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_derivacion_prioridad') then
    alter table public.casos_derivaciones add constraint chk_derivacion_prioridad
      check (prioridad in ('alta','media','baja'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_derivacion_estado') then
    alter table public.casos_derivaciones add constraint chk_derivacion_estado
      check (estado in ('sin_tomar','tomada','en_proceso','cerrada'));
  end if;
end $$;

-- 1 derivación por (caso, área): re-derivar la misma área actualiza (upsert).
create unique index if not exists idx_derivacion_caso_area on public.casos_derivaciones(caso_id, area);
create index if not exists idx_derivacion_caso        on public.casos_derivaciones(caso_id);
create index if not exists idx_derivacion_area_estado on public.casos_derivaciones(area, estado);

-- ── RLS: lectura amplia (Paso 5: todas las áreas ven el recorrido, sin datos
--    sensibles); la escritura va SOLO por las RPC de abajo (sin políticas WRITE). ──
alter table public.casos_derivaciones enable row level security;
drop policy if exists derivaciones_select on public.casos_derivaciones;
create policy derivaciones_select on public.casos_derivaciones
  for select to authenticated using (true);

-- ── Etiqueta legible de área (para textos de aviso) ──
create or replace function public.etiqueta_area_derivacion(p_area text)
returns text language sql immutable as $$
  select case p_area
    when 'logistica'    then 'Logística'
    when 'redes'        then 'Redes Sociales'
    when 'donaciones'   then 'Donaciones'
    when 'alianzas'     then 'Alianzas Estratégicas'
    when 'coordinacion' then 'Coordinación'
    when 'otra'         then 'Otra área'
    else p_area
  end;
$$;

-- ── ¿El usuario actual opera el área de la derivación? (tomar/avanzar/cerrar) ──
-- Mapea cada área de destino a los roles operativos existentes (rol + roles_extra).
create or replace function public.puede_operar_area_derivacion(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_area
    when 'logistica'    then public.es_admin() or public.tiene_rol('logistica') or public.tiene_rol('admin_logistica')
    when 'redes'        then public.es_admin() or public.tiene_rol('redaccion') or public.tiene_rol('redes_sociales')
                             or public.tiene_rol('diseno_grafico') or public.tiene_rol('edicion_video')
                             or public.tiene_rol('influencers') or public.tiene_rol('admin_redes')
    when 'donaciones'   then public.es_admin() or public.tiene_rol('logistica') or public.tiene_rol('admin_logistica')
                             or public.tiene_rol('captacion')
    when 'alianzas'     then public.es_admin() or public.tiene_rol('captacion')
    when 'coordinacion' then public.es_admin()
    else public.es_admin()  -- 'otra' → Coordinación
  end;
$$;
grant execute on function public.puede_operar_area_derivacion(text) to authenticated;

-- ── Roles a notificar por área (helper interno) ──
create or replace function public.roles_area_derivacion(p_area text)
returns public.rol_usuario[] language sql immutable as $$
  select case p_area
    when 'logistica'    then array['logistica','admin_logistica']::public.rol_usuario[]
    when 'redes'        then array['redaccion','redes_sociales','diseno_grafico','edicion_video','influencers','admin_redes']::public.rol_usuario[]
    when 'donaciones'   then array['logistica','admin_logistica','captacion']::public.rol_usuario[]
    when 'alianzas'     then array['captacion']::public.rol_usuario[]
    when 'coordinacion' then array['admin']::public.rol_usuario[]
    else array['admin']::public.rol_usuario[]  -- 'otra'
  end;
$$;

-- ── GATE de tabla: no se inserta NINGUNA derivación de un caso no Validado ──
create or replace function public.gate_derivacion_validada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.caso_esta_validado(new.caso_id) then
    raise exception 'No se puede derivar: la solicitud no está Validada (verificación incompleta).'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_gate_derivacion_validada on public.casos_derivaciones;
create trigger trg_gate_derivacion_validada
  before insert on public.casos_derivaciones
  for each row execute function public.gate_derivacion_validada();

-- ── RPC: derivar a una o varias áreas ──
create or replace function public.derivar_caso(
  p_caso uuid,
  p_areas text[],
  p_responsable uuid default null,
  p_accion text default null,
  p_prioridad text default 'media',
  p_observaciones text default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_caso   record;
  v_area   text;
  v_prio   text;
  v_accion text;
  v_obs    text;
  v_roles  public.rol_usuario[];
  v_n      int := 0;
begin
  -- Solo Verificación / Coordinación derivan (Paso 9: «Verificación selecciona»).
  if not (public.es_admin() or public.puede_verificar()) then
    raise exception 'No tienes permiso para derivar solicitudes' using errcode = '42501';
  end if;

  select id, titulo, estado into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  if v_caso.estado::text = 'falso' then
    raise exception 'No se puede derivar una solicitud descartada' using errcode = '22023';
  end if;

  -- Regla institucional crítica (Paso 9): SOLO casos Validados, bajo ninguna
  -- circunstancia se deriva un caso 🟡 o 🔴.
  if not public.caso_esta_validado(p_caso) then
    raise exception 'No se puede derivar: la solicitud no está Validada. Completá la verificación (todos los campos del semáforo en verde) antes de derivar.'
      using errcode = '42501';
  end if;

  v_prio := lower(coalesce(nullif(trim(p_prioridad), ''), 'media'));
  if v_prio not in ('alta','media','baja') then v_prio := 'media'; end if;
  v_accion := nullif(trim(coalesce(p_accion, '')), '');
  v_obs    := nullif(trim(coalesce(p_observaciones, '')), '');

  foreach v_area in array coalesce(p_areas, '{}'::text[]) loop
    if v_area is null or trim(v_area) = '' then continue; end if;
    if v_area not in ('logistica','redes','donaciones','alianzas','coordinacion','otra') then
      raise exception 'Área de destino no válida: %', v_area using errcode = '22023';
    end if;

    insert into public.casos_derivaciones
      (caso_id, area, responsable_id, accion, prioridad, observaciones, estado, derivado_por, derivado_en, actualizado_en)
    values
      (p_caso, v_area, p_responsable, v_accion, v_prio, v_obs, 'sin_tomar', auth.uid(), now(), now())
    on conflict (caso_id, area) do update
      set responsable_id = excluded.responsable_id,
          accion         = excluded.accion,
          prioridad      = excluded.prioridad,
          observaciones  = excluded.observaciones,
          derivado_por   = excluded.derivado_por,
          derivado_en    = now(),
          actualizado_en = now();

    -- Aviso al área destino (anti-spam de 6 h por caso; el webhook 0060 empuja el push).
    v_roles := public.roles_area_derivacion(v_area);
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'caso_derivado',
           'Nueva derivación a ' || public.etiqueta_area_derivacion(v_area),
           'Se derivó una solicitud Validada: «' || coalesce(v_caso.titulo, 'solicitud') || '».'
             || case when v_accion is not null then ' Acción: ' || v_accion || '.' else '' end,
           '/casos?caso=' || p_caso
    from public.perfiles p
    where p.verificado
      and p.id is distinct from auth.uid()
      and (p.rol = any(v_roles) or p.roles_extra && v_roles)
      and not exists (
        select 1 from public.notificaciones n
        where n.destinatario_id = p.id
          and n.tipo = 'caso_derivado'
          and n.enlace = '/casos?caso=' || p_caso
          and n.creado_en > now() - interval '6 hours'
      );

    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'Debes elegir al menos un área de destino' using errcode = '22023';
  end if;

  perform public.registrar_auditoria('derivar_caso', 'casos', p_caso::text,
    jsonb_build_object('areas', p_areas, 'prioridad', v_prio));
  return v_n;
end $$;

revoke all on function public.derivar_caso(uuid, text[], uuid, text, text, text) from public;
grant execute on function public.derivar_caso(uuid, text[], uuid, text, text, text) to authenticated;

-- ── RPC: tomar una derivación (miembro del área destino) ──
create or replace function public.tomar_derivacion(p_derivacion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_area text; v_estado text; v_prev uuid;
begin
  select area, estado, tomado_por into v_area, v_estado, v_prev
  from public.casos_derivaciones where id = p_derivacion;
  if v_area is null then
    raise exception 'Derivación no encontrada' using errcode = 'P0002';
  end if;
  if not public.puede_operar_area_derivacion(v_area) then
    raise exception 'No perteneces al área de esta derivación' using errcode = '42501';
  end if;
  if v_estado = 'cerrada' then
    raise exception 'La derivación ya fue cerrada' using errcode = '22023';
  end if;

  update public.casos_derivaciones
    set tomado_por     = auth.uid(),
        tomado_en      = now(),
        estado         = case when estado = 'sin_tomar' then 'tomada' else estado end,
        actualizado_en = now()
    where id = p_derivacion;

  -- Registrar el relevo (Paso 8: quién la tenía, quién la tomó).
  perform public.registrar_auditoria('tomar_derivacion', 'casos_derivaciones', p_derivacion::text,
    jsonb_build_object('area', v_area, 'anterior', v_prev));
end $$;

revoke all on function public.tomar_derivacion(uuid) from public;
grant execute on function public.tomar_derivacion(uuid) to authenticated;

-- ── RPC: marcar «en proceso» ──
create or replace function public.avanzar_derivacion(p_derivacion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_area text; v_estado text;
begin
  select area, estado into v_area, v_estado
  from public.casos_derivaciones where id = p_derivacion;
  if v_area is null then
    raise exception 'Derivación no encontrada' using errcode = 'P0002';
  end if;
  if not public.puede_operar_area_derivacion(v_area) then
    raise exception 'No perteneces al área de esta derivación' using errcode = '42501';
  end if;
  if v_estado = 'cerrada' then
    raise exception 'La derivación ya fue cerrada' using errcode = '22023';
  end if;

  update public.casos_derivaciones
    set estado         = 'en_proceso',
        tomado_por     = coalesce(tomado_por, auth.uid()),
        tomado_en      = coalesce(tomado_en, now()),
        actualizado_en = now()
    where id = p_derivacion;

  perform public.registrar_auditoria('avanzar_derivacion', 'casos_derivaciones', p_derivacion::text,
    jsonb_build_object('area', v_area));
end $$;

revoke all on function public.avanzar_derivacion(uuid) from public;
grant execute on function public.avanzar_derivacion(uuid) to authenticated;

-- ── RPC: cerrar (finalizar) una derivación ──
create or replace function public.cerrar_derivacion(p_derivacion uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_area text;
begin
  select area into v_area from public.casos_derivaciones where id = p_derivacion;
  if v_area is null then
    raise exception 'Derivación no encontrada' using errcode = 'P0002';
  end if;
  if not public.puede_operar_area_derivacion(v_area) then
    raise exception 'No perteneces al área de esta derivación' using errcode = '42501';
  end if;

  update public.casos_derivaciones
    set estado         = 'cerrada',
        cerrado_por    = auth.uid(),
        cerrado_en     = now(),
        motivo_cierre  = nullif(trim(coalesce(p_motivo, '')), ''),
        actualizado_en = now()
    where id = p_derivacion;

  perform public.registrar_auditoria('cerrar_derivacion', 'casos_derivaciones', p_derivacion::text,
    jsonb_build_object('area', v_area, 'motivo', nullif(trim(coalesce(p_motivo, '')), '')));
end $$;

revoke all on function public.cerrar_derivacion(uuid, text) from public;
grant execute on function public.cerrar_derivacion(uuid, text) to authenticated;

comment on table public.casos_derivaciones is
  'Paso 9: derivación de una solicitud Validada a una o varias áreas de destino, con responsable/acción/prioridad y estado operativo por área (sin_tomar/tomada/en_proceso/cerrada). Visible a todas las áreas (Paso 5). Escritura solo por RPC.';
