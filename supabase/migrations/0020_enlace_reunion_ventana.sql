-- ============================================================
-- 0020 — Enlace de reunión solo durante la ventana activa
-- ============================================================
-- Devuelve el enlace SOLO si: el usuario puede ver la reunión (miembro del
-- grupo o coordinación) Y now() está dentro de [inicio, inicio+duracion].
-- Así la página no necesita traer el enlace al cliente fuera de horario.
-- ============================================================
create or replace function public.enlace_reunion_si_activa(p_reunion uuid)
returns text language sql stable security definer set search_path = public as $$
  select r.enlace
  from public.reuniones r
  where r.id = p_reunion
    and (public.es_coordinacion() or public.es_miembro_de(r.grupo_id))
    and now() >= r.inicio
    and now() <= r.inicio + (r.duracion_min || ' minutes')::interval;
$$;
revoke all on function public.enlace_reunion_si_activa(uuid) from public;
grant execute on function public.enlace_reunion_si_activa(uuid) to authenticated;
