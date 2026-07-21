-- ============================================================
-- 0195 — Tablero de Coordinación cross-área: RPC resumen_coordinacion()
-- ------------------------------------------------------------
-- El Panel es «pendiente de MÍ» y /seguimiento es caso-a-caso: ningún coordinador
-- general tenía la foto AGREGADA de toda la respuesta. Esta RPC devuelve, en un
-- solo round-trip y con gate de rol (Coordinación = admin, como 0054/0179), la
-- matriz de derivaciones por área × estado (con personas afectadas) + el embudo de
-- solicitudes por estado + KPIs de cabecera. Solo lectura, agregada. Idempotente.
-- Ejecutar tras 0194.
-- ============================================================

create or replace function public.resumen_coordinacion()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.es_admin() then
    raise exception 'Sin permiso para el resumen de coordinación.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- Matriz derivaciones: una fila por (área, estado) con nº de derivaciones y
    -- personas afectadas de los casos involucrados.
    'matriz', coalesce((
      select jsonb_agg(jsonb_build_object('area', area, 'estado', estado, 'n', n, 'personas', personas))
      from (
        select d.area, d.estado, count(*)::bigint as n,
               coalesce(sum(c.personas_afectadas), 0)::bigint as personas
        from public.casos_derivaciones d
        join public.casos c on c.id = d.caso_id
        group by d.area, d.estado
      ) m), '[]'::jsonb),
    -- Embudo: solicitudes por estado (excluye Desaparecidos, flujo restringido).
    'casos_por_estado', coalesce((
      select jsonb_object_agg(estado, n)
      from (
        select c.estado::text as estado, count(*)::bigint as n
        from public.casos c
        where c.categoria is distinct from 'Desaparecidos'
        group by c.estado
      ) s), '{}'::jsonb),
    -- KPIs de cabecera.
    'kpis', jsonb_build_object(
      'derivaciones_abiertas', (select count(*) from public.casos_derivaciones where estado <> 'cerrada'),
      'derivaciones_total',    (select count(*) from public.casos_derivaciones),
      'casos_activos',         (select count(*) from public.casos c
                                where c.categoria is distinct from 'Desaparecidos'
                                  and c.estado::text not in ('resuelto', 'falso')),
      'personas_afectadas',    (select coalesce(sum(personas_afectadas), 0) from public.casos c
                                where c.categoria is distinct from 'Desaparecidos')
    )
  ) into v;

  return v;
end $$;

revoke all on function public.resumen_coordinacion() from public;
grant execute on function public.resumen_coordinacion() to authenticated;
