-- ============================================================
-- 0214 — El LÍDER y los COORDINADORES de Logística ejercen sus funciones
-- ------------------------------------------------------------
-- BUG reportado por el área: «el equipo de Logística y sus coordinadores y líderes
-- tienen problemas para usar la opción DESESTIMAR».
--
-- Reproducido: quien lidera o coordina el grupo de Logística (clave 'gestion_acopio')
-- suele tener el rol principal 'coordinador'/'lider_grupo' pero NO el rol operativo
-- 'logistica'. Como `puede_logistica()` solo mira los roles (admin / logistica /
-- admin_logistica), el mando del grupo daba FALSE: no podía desestimar («No tienes
-- permiso…») ni, en general, operar su propia área.
--
-- Es el mismo caso que ya se corrigió para Recopilación (0143/0207) con
-- `es_mando_recopilacion`. Aquí se replica el molde para Logística y se suma al
-- `puede_logistica()`, que es el choke point del área: con eso el mando recupera de
-- una vez sus 29 políticas (solicitudes, insumos, proveedores, envíos, acopio…) y la
-- entrada a las pantallas de Logística, en lugar de parchear una función a la vez.
--
-- Blindaje: exige `identidad_aprobada()`, igual que los demás mandos.
--
-- Además, `desestimar_caso` (0210) explica MEJOR por qué no se puede desestimar: antes
-- respondía «No tienes permiso» también cuando el permiso estaba bien y lo que fallaba
-- era el ESTADO de la solicitud, lo que despistaba a quien lo intentaba.
-- Idempotente. Ejecutar tras 0213.
-- ============================================================

-- ── Mando del grupo de Logística (molde de es_mando_recopilacion, 0143) ──
create or replace function public.es_mando_logistica()
returns boolean language sql stable security definer set search_path = public as $$
  select public.identidad_aprobada() and (
    exists (select 1 from public.grupos g
            where g.clave = 'gestion_acopio' and g.lider_id = auth.uid())
    or exists (select 1 from public.grupos g
               join public.miembros_grupo m on m.grupo_id = g.id
               where g.clave = 'gestion_acopio' and m.perfil_id = auth.uid()
                 and m.rol_en_grupo = 'coordinador')
  );
$$;
grant execute on function public.es_mando_logistica() to authenticated;

comment on function public.es_mando_logistica() is
  'Mando del grupo de Logística (clave gestion_acopio): su líder o sus coordinadores, con identidad aprobada. Molde de es_mando_recopilacion (0143).';

-- ── El choke point del área reconoce al mando ──
-- Base 0119 (admin / logistica / admin_logistica) + el mando del grupo.
create or replace function public.puede_logistica()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.tiene_rol('admin') or public.tiene_rol('logistica')
      or public.es_admin_logistica() or public.es_mando_logistica();
end $$;

-- ── desestimar_caso (0210 VERBATIM) + mensajes de error que explican el motivo real ──
create or replace function public.desestimar_caso(p_caso uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso record; v_motivo text; v_sello text; v_area text; v_del_area boolean;
begin
  select id, titulo, estado, categoria, notas into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0002';
  end if;

  -- Verificación (admin/verificador) desestima como parte de su gestión; Redacción y
  -- Logística SOLO en los estados que ya ven y nunca «Desaparecidos».
  v_del_area := public.es_verificado()
                and (public.tiene_rol('redaccion') or public.es_admin_redes() or public.puede_logistica());

  if public.es_admin() or public.puede_verificar() then
    v_area := case when public.puede_verificar() and not public.es_admin() then 'Verificación' else 'Admin' end;
  elsif v_del_area then
    -- El permiso está bien: si no procede, es por la CATEGORÍA o por el ESTADO. Se dice
    -- cuál de los dos, en vez del genérico «No tienes permiso» (que despistaba).
    if v_caso.categoria is not distinct from 'Desaparecidos' then
      raise exception 'Las solicitudes de «Desaparecidos» no se desestiman desde aquí: ese flujo lo lleva Búsqueda.'
        using errcode = '42501';
    end if;
    if v_caso.estado::text not in ('confirmado','enviado_redaccion','resuelto') then
      raise exception 'Esta solicitud está en «%» y desde tu área solo se puede desestimar cuando está confirmada, enviada a redacción o resuelta. Si hay que sacarla del flujo antes, pídeselo a Verificación.', v_caso.estado
        using errcode = '42501';
    end if;
    v_area := case when public.puede_logistica() then 'Logística' else 'Redacción' end;
  else
    raise exception 'No tienes permiso para desestimar esta solicitud.' using errcode = '42501';
  end if;

  if v_caso.estado::text in ('falso','desestimado') then
    raise exception 'La solicitud ya está fuera del flujo.' using errcode = '22023';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'Indica el motivo para desestimar la solicitud.' using errcode = '22023';
  end if;
  v_sello := '[Desestimado ' || to_char(now(), 'YYYY-MM-DD') || ' · ' || v_area || '] ' || v_motivo;

  update public.casos
     set estado = 'desestimado',
         notas = case when coalesce(notas, '') = '' then v_sello else notas || E'\n' || v_sello end,
         info_requerida = null,
         actualizado_en = now()
   where id = p_caso;

  -- Cancela la solicitud de Logística ligada (si la hay y no fue entregada).
  update public.solicitudes_insumo
     set estado = 'cancelado'::public.estado_insumo, actualizado_en = now()
   where caso_id = p_caso and estado::text not in ('entregado','cancelado');

  perform public.registrar_auditoria('desestimar_caso', 'casos', p_caso::text,
    jsonb_build_object('area', v_area, 'motivo', v_motivo));
end $$;

revoke all on function public.desestimar_caso(uuid, text) from public;
grant execute on function public.desestimar_caso(uuid, text) to authenticated;
