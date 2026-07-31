-- ============================================================
-- 0208 — Ruteo EXPLÍCITO: derivar confirma, y cada área recibe SOLO lo suyo
-- ------------------------------------------------------------
-- Peticiones #3 y #7 del documento del equipo + decisión «ruteo explícito también para
-- Logística».
--
-- ANTES: al CONFIRMAR una solicitud, (a) Logística recibía TODA confirmada (trigger
-- autoderivar_caso_confirmado, 0156) y (b) Redes veía TODA confirmada (vista casos_difusion,
-- 0189). Resultado: un caso «solo redes» caía también en Logística, y todo confirmado caía
-- en Redes aunque no se le enviara (caso 00117).
--
-- AHORA, ruteo por DERIVACIÓN (0177):
--   · #3 — `derivar_caso` AUTO-CONFIRMA la solicitud validada (excepto 'Desaparecidos',
--     decisión 6) para que aparezca en las áreas de destino (que filtran por estado).
--   · Logística — la solicitud de insumo se crea SOLO al derivar a 'logistica' (nuevo
--     trigger sobre casos_derivaciones); `autoderivar_caso_confirmado` se NEUTRALIZA (ya
--     no crea tarea al confirmar).
--   · #7 — REDES (vista casos_difusion) muestra SOLO lo derivado a 'redes' (o enviado a
--     redacción, o escalado por Logística `requiere_difusion`, o ya publicado), NO todo
--     'confirmado'.
--
-- Idempotente. Ejecutar tras 0207.
-- ============================================================

-- ── Helper: crear (idempotente) la solicitud de Logística de un caso ──
-- Extraído del cuerpo de autoderivar_caso_confirmado (0156). No exige que el caso esté
-- 'confirmado': se llama al derivar a 'logistica'. Nunca 'Desaparecidos'.
create or replace function public.solicitud_logistica_de_caso(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso record; v_sol uuid;
begin
  select id, titulo, descripcion, req_tipo, req_cantidad, req_urgencia, creado_por, categoria
    into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then return; end if;
  if v_caso.categoria is not distinct from 'Desaparecidos' then return; end if;
  if exists (select 1 from public.solicitudes_insumo where caso_id = p_caso) then return; end if;

  insert into public.solicitudes_insumo
    (titulo, tipo, descripcion, cantidad, urgencia, estado, solicitado_por, caso_id)
  values (
    v_caso.titulo,
    coalesce(v_caso.req_tipo, 'otro'::public.tipo_insumo),
    v_caso.descripcion,
    v_caso.req_cantidad,
    coalesce(v_caso.req_urgencia, 'media'::public.prioridad),
    'solicitado'::public.estado_insumo,
    v_caso.creado_por,
    p_caso
  ) returning id into v_sol;

  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:derivado_logistica', 'casos', p_caso::text,
          jsonb_build_object('solicitud_id', v_sol));

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'insumo_nuevo', 'Nueva solicitud en Logística',
         'Una solicitud verificada entró para coordinar su entrega.', '/insumos/' || v_sol
  from public.perfiles p
  where p.rol in ('logistica'::public.rol_usuario, 'admin_logistica'::public.rol_usuario)
     or 'logistica'::public.rol_usuario       = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
     or 'admin_logistica'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]));
end $$;

-- ── (A) Logística ahora es EXPLÍCITA ──
-- (A.1) Neutraliza el autoderivar por estado (0156): confirmar ya NO crea tarea de Logística.
--       Se deja como no-op para no romper el trigger trg_autoderivar_caso_confirmado (0149).
create or replace function public.autoderivar_caso_confirmado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Ruteo explícito (0208): la tarea de Logística se crea al DERIVAR a 'logistica'
  -- (trg_crear_logistica_al_derivar), no al confirmar.
  return new;
end $$;

-- (A.2) Nuevo: al DERIVAR a 'logistica', crea su solicitud de insumo.
create or replace function public.crear_logistica_al_derivar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.area = 'logistica' then
    perform public.solicitud_logistica_de_caso(new.caso_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_crear_logistica_al_derivar on public.casos_derivaciones;
create trigger trg_crear_logistica_al_derivar
  after insert on public.casos_derivaciones
  for each row execute function public.crear_logistica_al_derivar();

-- ── (B) derivar_caso (0177 VERBATIM) + auto-confirmación (#3) ──
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

  select id, titulo, estado, categoria into v_caso from public.casos where id = p_caso;
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

  -- #3 — Auto-confirmación: al derivar una solicitud VALIDADA que sigue sin confirmar,
  -- pásala a 'confirmado' para que aparezca en las áreas de destino (casos_select /
  -- casos_difusion filtran por estado). Excepto 'Desaparecidos' (decisión 6: su flujo de
  -- confirmación es de Búsqueda). El UPDATE pasa el candado gate_confirmacion_caso (ya está
  -- Validada, no lo debilita). El traslado/estado manual (cambiarEstadoCaso) se conserva.
  if v_caso.categoria is distinct from 'Desaparecidos'
     and v_caso.estado::text not in ('confirmado','enviado_redaccion','resuelto') then
    update public.casos set estado = 'confirmado', actualizado_en = now() where id = p_caso;
  end if;

  perform public.registrar_auditoria('derivar_caso', 'casos', p_caso::text,
    jsonb_build_object('areas', p_areas, 'prioridad', v_prio));
  return v_n;
end $$;

revoke all on function public.derivar_caso(uuid, text[], uuid, text, text, text) from public;
grant execute on function public.derivar_caso(uuid, text[], uuid, text, text, text) to authenticated;

-- ── (C) casos_difusion (0189 VERBATIM en columnas) + WHERE de REDES EXPLÍCITO (#7) ──
-- Redes ve una solicitud SOLO si: fue derivada a 'redes', o enviada a redacción
-- (enviado_redaccion), o escalada por Logística (requiere_difusion), o ya está publicada.
-- Ya NO por el simple hecho de estar 'confirmado' (eso hacía que todo cayera en Redes).
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
    c.tipo_difusion, c.url_original
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
  'Fuente curada de Redacción/Redes (Paso 10): solo columnas seguras (nunca contacto interno). Ruteo EXPLÍCITO (0208): muestra una solicitud solo si fue derivada a «redes», enviada a redacción, escalada por Logística (requiere_difusion) o ya publicada — no todo «confirmado».';
