-- ============================================================
-- 0121 — Total de colaboradores (para el subtítulo del globo del panel)
-- ------------------------------------------------------------
-- El globo mostraba «Somos N» sumando solo perfiles verificados CON país, así que no
-- coincidía con el total de usuarios de la plataforma (que cuenta a todas las personas
-- registradas). Esta función devuelve ese total — un solo número, sin datos personales —
-- para que el subtítulo cuadre con el conteo real. SECURITY DEFINER para contar sobre
-- toda la tabla sin depender del alcance de la RLS de `perfiles`.
-- Idempotente. Ejecutar tras 0120.
-- ============================================================

create or replace function public.total_colaboradores()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)::bigint from public.perfiles;
$$;
grant execute on function public.total_colaboradores() to authenticated;
