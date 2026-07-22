-- ============================================================
-- 0201 — Trazabilidad del relevo entre áreas en el «Historial de cambios» del caso
-- ------------------------------------------------------------
-- Las RPC tomar/avanzar/cerrar_derivacion (0177) auditan con entidad='casos_derivaciones',
-- pero el bloque «Historial de cambios» del detalle del caso lee registro_auditoria
-- filtrando entidad='casos'. Resultado: el relevo entre áreas (quién tomó, avanzó o cerró
-- una derivación) NO aparece en el historial del caso.
--
-- Aquí se REDEFINEN las tres RPC para que, ADEMÁS de su registro por derivación, escriban
-- un segundo asiento con entidad='casos' y entidad_id=caso_id (leído de la propia fila).
-- Así el historial existente muestra el relevo automáticamente, sin tocar la app. Cuerpos
-- idénticos a 0177 salvo el `caso_id` en el SELECT y el asiento extra. Idempotente.
-- ============================================================

-- ── tomar_derivacion: + asiento en el historial del caso ──
create or replace function public.tomar_derivacion(p_derivacion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_area text; v_estado text; v_prev uuid; v_caso uuid;
begin
  select area, estado, tomado_por, caso_id into v_area, v_estado, v_prev, v_caso
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

  -- Registro por derivación (Paso 8: quién la tenía, quién la tomó).
  perform public.registrar_auditoria('tomar_derivacion', 'casos_derivaciones', p_derivacion::text,
    jsonb_build_object('area', v_area, 'anterior', v_prev));
  -- + Registro en el historial del CASO (para el bloque «Historial de cambios»).
  perform public.registrar_auditoria('tomar_derivacion', 'casos', v_caso::text,
    jsonb_build_object('area', v_area, 'derivacion', p_derivacion));
end $$;

-- ── avanzar_derivacion: + asiento en el historial del caso ──
create or replace function public.avanzar_derivacion(p_derivacion uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_area text; v_estado text; v_caso uuid;
begin
  select area, estado, caso_id into v_area, v_estado, v_caso
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
  perform public.registrar_auditoria('avanzar_derivacion', 'casos', v_caso::text,
    jsonb_build_object('area', v_area, 'derivacion', p_derivacion));
end $$;

-- ── cerrar_derivacion: + asiento en el historial del caso ──
create or replace function public.cerrar_derivacion(p_derivacion uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_area text; v_caso uuid; v_motivo text;
begin
  select area, caso_id into v_area, v_caso from public.casos_derivaciones where id = p_derivacion;
  if v_area is null then
    raise exception 'Derivación no encontrada' using errcode = 'P0002';
  end if;
  if not public.puede_operar_area_derivacion(v_area) then
    raise exception 'No perteneces al área de esta derivación' using errcode = '42501';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo, '')), '');
  update public.casos_derivaciones
    set estado         = 'cerrada',
        cerrado_por    = auth.uid(),
        cerrado_en     = now(),
        motivo_cierre  = v_motivo,
        actualizado_en = now()
    where id = p_derivacion;

  perform public.registrar_auditoria('cerrar_derivacion', 'casos_derivaciones', p_derivacion::text,
    jsonb_build_object('area', v_area, 'motivo', v_motivo));
  perform public.registrar_auditoria('cerrar_derivacion', 'casos', v_caso::text,
    jsonb_build_object('area', v_area, 'motivo', v_motivo, 'derivacion', p_derivacion));
end $$;
