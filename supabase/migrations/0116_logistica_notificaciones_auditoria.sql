-- ============================================================
-- 0116 — Logística: notificaciones del ciclo + auditoría de estados
-- ------------------------------------------------------------
-- Cierra el lazo de AVISOS del flujo casos↔logística (0112-0114) y deja rastro de
-- los cambios de estado de una solicitud:
--   (#1) Al DERIVAR un caso → se avisa a Logística (rol logistica) que entró una
--        solicitud de ayuda. (Se re-crea derivar_caso_a_logistica sobre su versión
--        0113 sumando SOLO el aviso — lección de rebase 0104/0105.)
--   (#1) Al ENTREGAR → se avisa a quien REPORTÓ y a quien ATENDIÓ el caso que su
--        solicitud fue resuelta. (Se re-crea cerrar_caso_al_entregar sobre 0114.)
--   (#4) Los cambios de estado de una solicitud quedan AUDITADOS (registro_auditoria)
--        y no se puede REABRIR un estado terminal (entregado/cancelado) salvo admin.
--
-- Los avisos usan la tabla `notificaciones` (0001) — su webhook per-row (0060) emite
-- el push y alimenta la campana, así que no hace falta tocar la app. `tipo` es texto
-- libre; sin problemas de enum. Idempotente. Ejecutar tras 0115.
-- ============================================================

-- ── (#1) Derivación → avisar a Logística (rebase de 0113 + aviso) ──
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

  -- AVISO nuevo: a la gente de Logística (rol principal o adicional) verificada.
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'insumo_derivado', 'Nueva solicitud de ayuda',
         'Se derivó a Logística: ' || v_caso.titulo, '/insumos/' || v_sol
  from public.perfiles p
  where p.verificado
    and (p.rol = 'logistica'::public.rol_usuario
         or 'logistica'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])));

  return v_sol;
end $$;
grant execute on function public.derivar_caso_a_logistica(uuid) to authenticated;

-- ── (#1) Entrega → caso resuelto + avisar al reportante/asignado (rebase de 0114) ──
create or replace function public.cerrar_caso_al_entregar()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; v_creador uuid; v_asignado uuid;
begin
  if new.caso_id is not null and new.estado = 'entregado'
     and old.estado is distinct from 'entregado' then
    update public.casos set estado = 'resuelto', actualizado_en = now()
      where id = new.caso_id and estado::text in ('confirmado', 'enviado_redaccion')
      returning creado_por, asignado_a into v_creador, v_asignado;
    get diagnostics n = row_count;
    if n > 0 then
      insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
      values (auth.uid(), 'casos:resuelto', 'casos', new.caso_id::text,
              jsonb_build_object('solicitud_id', new.id));
      -- AVISO nuevo: a quien reportó y a quien atendió el caso.
      insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
      select distinct d, 'caso_resuelto', 'Tu caso fue atendido',
             'La ayuda se entregó y el caso quedó resuelto. 💛', '/casos/' || new.caso_id
      from (values (v_creador), (v_asignado)) as t(d)
      where d is not null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cerrar_caso_al_entregar on public.solicitudes_insumo;
create trigger trg_cerrar_caso_al_entregar
  after update of estado on public.solicitudes_insumo
  for each row execute function public.cerrar_caso_al_entregar();

-- ── (#4) Auditar los cambios de estado + no reabrir estados terminales ──
create or replace function public.auditar_estado_insumo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado then
    -- Una solicitud entregada o cancelada no se reabre (salvo administración).
    if old.estado::text in ('entregado', 'cancelado') and not public.es_admin() then
      raise exception 'Una solicitud «%» no se puede reabrir.', old.estado using errcode = '42501';
    end if;
    insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
    values (auth.uid(), 'insumo:estado', 'solicitudes_insumo', new.id::text,
            jsonb_build_object('de', old.estado::text, 'a', new.estado::text));
  end if;
  return new;
end $$;

drop trigger if exists trg_auditar_estado_insumo on public.solicitudes_insumo;
create trigger trg_auditar_estado_insumo
  before update of estado on public.solicitudes_insumo
  for each row execute function public.auditar_estado_insumo();
