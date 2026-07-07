-- ============================================================
-- 0123 — Notificaciones: cuerpos genéricos (sin datos en la pantalla de bloqueo)
-- ------------------------------------------------------------
-- El webhook de push (0060) copia `notificaciones.cuerpo` TAL CUAL al cuerpo del push,
-- que se muestra en la PANTALLA DE BLOQUEO del dispositivo. Dos avisos que se difunden
-- a TODO un equipo incrustaban el `titulo` (texto libre del reportante) del caso:
--   · Caso nuevo 'pendiente' → TODOS los verificadores (0118): `titulo || ' — llegó…'`.
--   · Caso derivado a Logística → TODA logística (0116): `'Se derivó a Logística: ' || titulo`.
-- Si el reportante escribe un nombre/cédula en el título, se difunde al equipo y aparece
-- en el lock screen. Se cambian ambos cuerpos a texto GENÉRICO; el detalle queda detrás
-- del enlace, ya en la app (autenticado) — mismo criterio que búsqueda/psicosocial (0091/0052).
--
-- Solo cambian los TEXTOS de esos dos avisos; destinatarios, permisos y lógica idénticos.
-- Idempotente. Ejecutar tras 0122.
-- ============================================================

-- ── (a) Caso nuevo 'pendiente' → verificadores: cuerpo genérico ──
create or replace function public.notificar_caso_nuevo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado::text = 'pendiente' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'caso_por_verificar', 'Nuevo caso por verificar',
           'Llegó un caso nuevo para verificar. Ábrelo para revisarlo.',
           '/casos?caso=' || new.id
    from public.perfiles p
    where p.verificado
      and p.id is distinct from new.creado_por
      and (p.rol = 'verificador'::public.rol_usuario
           or 'verificador'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])));
  end if;
  return new;
end $$;

-- ── (b) Caso derivado a Logística: cuerpo genérico (resto de la función, idéntico a 0116) ──
create or replace function public.derivar_caso_a_logistica(p_caso uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_caso record; v_sol uuid;
begin
  select id, numero, titulo, descripcion, categoria, estado, es_requerimiento,
         lat, lng, req_tipo, req_cantidad, req_urgencia, creado_por
    into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then raise exception 'Caso no encontrado.' using errcode = 'P0002'; end if;

  if not (public.es_admin() or public.puede_verificar() or public.opera_verificacion()
          or (public.tiene_rol('recopilacion') and public.identidad_aprobada())
          or v_caso.creado_por = auth.uid()) then
    raise exception 'No tienes permiso para derivar este caso a Logística.' using errcode = '42501';
  end if;

  if not v_caso.es_requerimiento then
    raise exception 'Este caso no es una solicitud de ayuda con ubicación.'; end if;
  if v_caso.categoria is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de «Desaparecidos» no se derivan a Logística.'; end if;
  if v_caso.estado::text not in ('confirmado', 'enviado_redaccion') then
    raise exception 'Solo se deriva un caso CONFIRMADO.'; end if;
  if v_caso.lat is null or v_caso.lng is null then
    raise exception 'El caso no tiene ubicación marcada en el mapa.'; end if;

  select id into v_sol from public.solicitudes_insumo where caso_id = p_caso;
  if v_sol is not null then
    raise exception 'Este caso ya fue derivado a Logística.' using errcode = '23505'; end if;

  insert into public.solicitudes_insumo
    (titulo, tipo, descripcion, cantidad, urgencia, estado, solicitado_por, caso_id)
  values (
    v_caso.titulo,
    coalesce(v_caso.req_tipo, 'otro'::public.tipo_insumo),
    v_caso.descripcion,
    v_caso.req_cantidad,
    coalesce(v_caso.req_urgencia, 'media'::public.prioridad),
    'solicitado'::public.estado_insumo,
    auth.uid(),
    p_caso
  ) returning id into v_sol;

  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:derivado', 'casos', p_caso::text,
          jsonb_build_object('solicitud_id', v_sol));

  -- AVISO: a Logística (rol principal o adicional) verificada — cuerpo genérico.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'insumo_derivado', 'Nueva solicitud de ayuda',
         'Se derivó un caso nuevo a Logística. Ábrelo para gestionarlo.', '/insumos/' || v_sol
  from public.perfiles p
  where p.verificado
    and (p.rol = 'logistica'::public.rol_usuario
         or 'logistica'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])));

  return v_sol;
end $$;
grant execute on function public.derivar_caso_a_logistica(uuid) to authenticated;
