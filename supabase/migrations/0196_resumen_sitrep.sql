-- ============================================================
-- 0196 — SitRep (Reporte de Situación): RPC resumen_sitrep()
-- ------------------------------------------------------------
-- El «SitRep» es el artefacto humanitario clásico: una FOTO agregada, de un
-- vistazo, del estado de toda la respuesta, lista para imprimir/compartir con la
-- coordinación. Va más allá del Tablero de Coordinación (0195): suma el desglose
-- por URGENCIA, el pulso de LOGÍSTICA (derivaciones/entregas por estado) y el de
-- DIFUSIÓN (publicadas, confirmadas sin publicar, por canal).
--
-- Todo en un solo round-trip, con gate de rol (Coordinación = admin, como 0195) y
-- SECURITY DEFINER para leer TODAS las áreas por encima de la RLS (agregado, solo
-- lectura). Excluye la categoría restringida «Desaparecidos» (flujo aparte).
-- Idempotente. Ejecutar tras 0195.
-- ============================================================

create or replace function public.resumen_sitrep()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.es_admin() then
    raise exception 'Sin permiso para el reporte de situación.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- Panorama de solicitudes por estado (embudo).
    'por_estado', coalesce((
      select jsonb_object_agg(estado, n)
      from (
        select c.estado::text as estado, count(*)::bigint as n
        from public.casos c
        where c.categoria is distinct from 'Desaparecidos'
        group by c.estado
      ) s), '{}'::jsonb),

    -- Panorama por URGENCIA del requerimiento (crítica/alta/media/baja/sin dato).
    'por_urgencia', coalesce((
      select jsonb_object_agg(urg, n)
      from (
        select coalesce(c.req_urgencia::text, 'sin') as urg, count(*)::bigint as n
        from public.casos c
        where c.categoria is distinct from 'Desaparecidos'
        group by coalesce(c.req_urgencia::text, 'sin')
      ) u), '{}'::jsonb),

    -- Derivaciones por área × estado (con personas afectadas), como en 0195.
    'matriz', coalesce((
      select jsonb_agg(jsonb_build_object('area', area, 'estado', estado, 'n', n, 'personas', personas))
      from (
        select d.area, d.estado, count(*)::bigint as n,
               coalesce(sum(c.personas_afectadas), 0)::bigint as personas
        from public.casos_derivaciones d
        join public.casos c on c.id = d.caso_id
        group by d.area, d.estado
      ) m), '[]'::jsonb),

    -- Pulso de LOGÍSTICA: derivaciones a logística por estado (las «cerrada» ≈ entregas).
    'logistica', coalesce((
      select jsonb_object_agg(estado, n)
      from (
        select d.estado::text as estado, count(*)::bigint as n
        from public.casos_derivaciones d
        where d.area = 'logistica'
        group by d.estado
      ) l), '{}'::jsonb),

    -- Pulso de DIFUSIÓN: publicadas, confirmadas aún sin publicar, y por canal.
    'difusion', jsonb_build_object(
      'publicadas', (select count(*) from public.casos c
                     where c.publicado_en is not null
                       and c.categoria is distinct from 'Desaparecidos'),
      'confirmadas_sin_publicar', (select count(*) from public.casos c
                     where c.categoria is distinct from 'Desaparecidos'
                       and c.estado::text in ('confirmado', 'enviado_redaccion')
                       and c.publicado_en is null),
      'por_canal', coalesce((
        select jsonb_object_agg(canal, n)
        from (
          select canal, count(*)::bigint as n
          from public.casos_publicaciones
          where estado_canal = 'publicado'
          group by canal
        ) p), '{}'::jsonb)),

    -- KPIs de cabecera.
    'kpis', jsonb_build_object(
      'solicitudes_total',     (select count(*) from public.casos c
                                where c.categoria is distinct from 'Desaparecidos'),
      'activas',               (select count(*) from public.casos c
                                where c.categoria is distinct from 'Desaparecidos'
                                  and c.estado::text not in ('resuelto', 'falso')),
      'personas_afectadas',    (select coalesce(sum(personas_afectadas), 0) from public.casos c
                                where c.categoria is distinct from 'Desaparecidos'),
      'publicadas',            (select count(*) from public.casos c
                                where c.publicado_en is not null
                                  and c.categoria is distinct from 'Desaparecidos'),
      'derivaciones_abiertas', (select count(*) from public.casos_derivaciones where estado <> 'cerrada'),
      'derivaciones_total',    (select count(*) from public.casos_derivaciones)
    )
  ) into v;

  return v;
end $$;

revoke all on function public.resumen_sitrep() from public;
grant execute on function public.resumen_sitrep() to authenticated;
