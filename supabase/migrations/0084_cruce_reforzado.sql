-- ============================================================
-- 0084 — Cruce reforzado: nombre normalizado + búsqueda por nombre parcial
-- ------------------------------------------------------------
-- · Columna generada `nombre_norm` en personas_listado (minúsculas, sin acentos
--   ni símbolos) para detectar duplicados (misma persona en varias listas) y
--   buscar por nombre de forma robusta.
-- · buscar_personas(): búsqueda por NOMBRE PARCIAL o cédula sobre las personas
--   digitalizadas — solo para admin o Búsqueda con 2ª verificación (la data de
--   personas es sensible). Sirve para contrastar manualmente un desaparecido.
-- Idempotente. Ejecutar tras 0083.
-- ============================================================

-- Columna generada (normalizar_nombre es IMMUTABLE, de 0082).
alter table public.personas_listado
  add column if not exists nombre_norm text generated always as (public.normalizar_nombre(nombre_completo)) stored;
create index if not exists idx_personas_nombre_norm on public.personas_listado (nombre_norm);

-- Búsqueda por nombre parcial / cédula sobre personas digitalizadas.
create or replace function public.buscar_personas(p_termino text)
returns table (
  persona_id uuid, nombre text, cedula text, edad int, condicion text, es_menor boolean,
  lugar_nombre text, lugar_tipo text, listado_id uuid
) language sql stable security definer set search_path = public as $$
  with t as (
    select public.normalizar_nombre(p_termino) as norm,
           regexp_replace(coalesce(p_termino, ''), '\D', '', 'g') as ced
  )
  select p.id, p.nombre_completo, p.cedula, p.edad, p.condicion,
         (p.edad is not null and p.edad < 18),
         l.nombre, l.tipo, ld.id
  from public.personas_listado p
  left join public.listados_digitalizados ld on ld.id = p.listado_id
  left join public.lugares l on l.id = ld.lugar_id,
       t
  where (public.es_admin() or (public.es_busqueda() and public.identidad_aprobada()))
    and length(t.norm) >= 2
    and (p.nombre_norm like '%' || t.norm || '%'
         or (t.ced <> '' and regexp_replace(coalesce(p.cedula, ''), '\D', '', 'g') like '%' || t.ced || '%'))
  order by p.nombre_completo
  limit 100;
$$;
grant execute on function public.buscar_personas(text) to authenticated;
