-- ============================================================
-- 0054 — Supervisión del área psicosocial para admin (sin ver casos)
-- ============================================================
-- El admin/coordinación general debe poder SUPERVISAR que el área funciona
-- (cuántos casos hay, por estado, backlog, tamaño del equipo) SIN acceder al
-- contenido confidencial (persona, motivo, bitácora). Se logra con una función
-- SECURITY DEFINER que devuelve SOLO agregados (números), nunca filas ni datos
-- identificables. La RLS de acompanamientos/bitácora NO cambia: el admin sigue
-- sin poder leer los casos. Idempotente.
-- ============================================================

create or replace function public.resumen_psicosocial()
returns table (
  total             bigint,
  solicitados       bigint,
  asignados         bigint,
  en_acompanamiento bigint,
  seguimiento       bigint,
  cerrados          bigint,
  cancelados        bigint,
  sin_asignar       bigint,
  profesionales     bigint,
  nuevos_7d         bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  -- Solo admin o el equipo psicosocial obtienen el resumen. Nadie más.
  if not (public.es_admin() or public.es_psicosocial()) then
    raise exception 'Sin permiso para ver el resumen psicosocial.' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where a.estado = 'solicitado')::bigint,
    count(*) filter (where a.estado = 'asignado')::bigint,
    count(*) filter (where a.estado = 'en_acompanamiento')::bigint,
    count(*) filter (where a.estado = 'seguimiento')::bigint,
    count(*) filter (where a.estado = 'cerrado')::bigint,
    count(*) filter (where a.estado = 'cancelado')::bigint,
    count(*) filter (where a.asignado_a is null and a.estado not in ('cerrado','cancelado'))::bigint,
    (
      select count(*) from public.perfiles p
      where p.rol::text in ('apoyo_psicosocial','coordinador_psicosocial')
         or exists (
           select 1 from unnest(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) as r
           where r::text in ('apoyo_psicosocial','coordinador_psicosocial')
         )
    )::bigint,
    count(*) filter (where a.creado_en > now() - interval '7 days')::bigint
  from public.acompanamientos a;
end $$;

grant execute on function public.resumen_psicosocial() to authenticated;
