-- ============================================================
-- 0120 — Países desde donde se colabora (para el globo del panel)
-- ------------------------------------------------------------
-- Agregado NO sensible para el globo del panel: cuántas personas verificadas colaboran
-- desde cada país. Devuelve solo (pais, conteo) — nunca filas ni datos personales — así
-- que se puede guardar por `authenticated` sin exponer perfiles. SECURITY DEFINER para
-- contar sobre toda la tabla sin depender del alcance de la RLS de `perfiles`.
-- Idempotente. Ejecutar tras 0119.
-- ============================================================

create or replace function public.paises_colaboradores()
returns table (pais text, n bigint)
language sql stable security definer set search_path = public as $$
  select p.pais, count(*)::bigint as n
  from public.perfiles p
  where p.pais is not null and p.pais <> '' and p.pais <> 'ZZ' and p.verificado = true
  group by p.pais
  order by n desc, p.pais;
$$;
grant execute on function public.paises_colaboradores() to authenticated;
