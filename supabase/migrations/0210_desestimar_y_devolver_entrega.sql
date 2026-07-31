-- ============================================================
-- 0210 — Desestimar una solicitud (con motivo) desde cualquier área + devolver una entrega
-- ------------------------------------------------------------
-- Petición #2 del documento del equipo + decisiones 3 y 4:
--   · #2a — «poder DESESTIMAR una solicitud dejando nota del motivo en todos los
--     departamentos (envío a redacción, logística)». Decisión 3 (recomendación): usar un
--     estado «desestimado» APARTE, para no ensuciar la métrica de «falsos» (que es de
--     Verificación). Redacción/Logística solo pueden desestimar en los estados que ya ven
--     (confirmado / enviado_redaccion / resuelto).
--   · #2b — «luego de que un caso se pone entregado en logística no se puede devolver».
--     Decisión 4 (sí): permitir DEVOLVER una entrega (revierte la solicitud y el caso
--     resuelto→confirmado). El reabastecimiento de inventario es MANUAL (entregar no
--     descuenta inventario automáticamente salvo surtido desde centro).
--
-- Enum-safety (lección 0114): 'desestimado' se AÑADE al enum y solo se usa en cuerpos
-- plpgsql (late-bound) o por comparación TEXT — nunca en un cast eager de policy/CHECK
-- en esta misma migración. Idempotente. Ejecutar tras 0209.
-- ============================================================

-- ── Estado nuevo: «Desestimado» (aparte de «falso») ──
alter type public.estado_caso add value if not exists 'desestimado';

-- ── (A) desestimar_caso — descartar con motivo desde Verificación / Redacción / Logística ──
-- Sella el motivo en `notas` (visible en Seguimiento, 0209), pone estado='desestimado',
-- cancela la solicitud de Logística ligada (si no está entregada) y audita el área. RPC
-- SECURITY DEFINER: Redacción/Logística no editan `casos` directo.
create or replace function public.desestimar_caso(p_caso uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso record; v_motivo text; v_sello text; v_area text;
begin
  select id, titulo, estado, categoria, notas into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0002';
  end if;

  -- Verificación (admin/verificador) puede desestimar como parte de su gestión; Redacción y
  -- Logística SOLO en los estados que ya ven (confirmado/enviado_redaccion/resuelto) y nunca
  -- Desaparecidos (flujo de Búsqueda).
  if public.es_admin() or public.puede_verificar() then
    v_area := case when public.puede_verificar() and not public.es_admin() then 'Verificación' else 'Admin' end;
  elsif public.es_verificado()
    and (public.tiene_rol('redaccion') or public.es_admin_redes() or public.puede_logistica())
    and v_caso.categoria is distinct from 'Desaparecidos'
    and v_caso.estado::text in ('confirmado','enviado_redaccion','resuelto') then
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

comment on function public.desestimar_caso(uuid, text) is
  'Petición #2 (0210): descarta una solicitud con motivo (estado «desestimado», aparte de «falso») desde Verificación / Redacción / Logística. Redacción/Logística solo en confirmado/enviado_redaccion/resuelto y no Desaparecidos. Cancela la solicitud de Logística ligada y audita el área.';

-- ── (B.0) Relajar el guard 0116 para el DEVOLVER controlado ──
-- auditar_estado_insumo (0116) impide reabrir 'entregado'/'cancelado' salvo admin. Se le
-- añade una compuerta: la RPC devolver_entrega_insumo marca `app.devolver_ok` y así Logística
-- puede deshacer su propia entrega. El resto de ediciones ad-hoc siguen bloqueadas. (Cuerpo
-- 0116 verbatim + la condición nueva.)
create or replace function public.auditar_estado_insumo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado then
    -- Una solicitud entregada o cancelada no se reabre (salvo administración o el devolver
    -- controlado por la RPC devolver_entrega_insumo).
    if old.estado::text in ('entregado', 'cancelado')
       and not public.es_admin()
       and coalesce(current_setting('app.devolver_ok', true), '') <> '1' then
      raise exception 'Una solicitud «%» no se puede reabrir.', old.estado using errcode = '42501';
    end if;
    insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
    values (auth.uid(), 'insumo:estado', 'solicitudes_insumo', new.id::text,
            jsonb_build_object('de', old.estado::text, 'a', new.estado::text));
  end if;
  return new;
end $$;

-- ── (B) devolver_entrega_insumo — deshacer un «entregado» (decisión 4) ──
-- Revierte la solicitud (entregado→en_ruta) y el caso ligado (resuelto→confirmado) para que
-- vuelva al flujo. El reabastecimiento de inventario es MANUAL (no se repone automáticamente).
-- SECURITY DEFINER: Logística no edita `casos` directo.
create or replace function public.devolver_entrega_insumo(p_solicitud uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_sol record;
begin
  if not (public.es_admin() or public.puede_logistica()) then
    raise exception 'No tienes permiso para devolver esta entrega.' using errcode = '42501';
  end if;

  select id, estado, caso_id into v_sol from public.solicitudes_insumo where id = p_solicitud;
  if v_sol.id is null then
    raise exception 'Solicitud de insumo no encontrada.' using errcode = 'P0002';
  end if;
  if v_sol.estado::text <> 'entregado' then
    raise exception 'Solo se puede devolver una solicitud que esté ENTREGADA.' using errcode = '22023';
  end if;

  -- Revierte la solicitud a «en ruta» (vuelve al tablero activo de Logística). No dispara la
  -- resolución del caso (el trigger 0114 solo actúa al ENTRAR a 'entregado'). La compuerta
  -- app.devolver_ok permite pasar el guard 0116 (reabrir 'entregado') solo aquí.
  perform set_config('app.devolver_ok', '1', true);
  update public.solicitudes_insumo
     set estado = 'en_ruta'::public.estado_insumo, actualizado_en = now()
   where id = p_solicitud;
  perform set_config('app.devolver_ok', '', true);

  -- Revierte el caso ligado que había quedado resuelto por la entrega.
  if v_sol.caso_id is not null then
    update public.casos set estado = 'confirmado', actualizado_en = now()
     where id = v_sol.caso_id and estado::text = 'resuelto';
  end if;

  perform public.registrar_auditoria('devolver_entrega_insumo', 'solicitudes_insumo', p_solicitud::text,
    jsonb_build_object('caso_id', v_sol.caso_id));
end $$;

revoke all on function public.devolver_entrega_insumo(uuid) from public;
grant execute on function public.devolver_entrega_insumo(uuid) to authenticated;

comment on function public.devolver_entrega_insumo(uuid) is
  'Petición #2b (0210, decisión 4): deshace un «entregado» — revierte la solicitud a en_ruta y el caso ligado resuelto→confirmado. El reabastecimiento de inventario es manual.';
