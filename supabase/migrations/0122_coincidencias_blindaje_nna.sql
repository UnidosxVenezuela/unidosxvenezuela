-- ============================================================
-- 0122 — Coincidencias: propagar el blindaje NNA (menores)
-- ------------------------------------------------------------
-- 0093 separó los CASOS y `busqueda_casos` por `es_nna`: un buscador general
-- (rol 'busqueda') NO ve un caso de menor; el Buscador NNA ('buscador_nna') ve solo
-- los de menores. Pero ese blindaje NUNCA se extendió a las COINCIDENCIAS: la RLS de
-- `coincidencias`, el RPC `listar_coincidencias()` y el buscador `buscar_personas()`
-- solo exigían `es_busqueda() + identidad`, sin filtrar por menor. Como la página usa
-- `listar_coincidencias()` (SECURITY DEFINER, salta la RLS de casos/personas), un
-- buscador general veía las coincidencias de MENORES con el nombre del caso, la persona
-- hallada (nombre/cédula/edad) y el lugar. A la vez, un Buscador NNA "puro" no veía
-- NINGUNA coincidencia (el gate exigía `es_busqueda()`, falso para 'buscador_nna').
--
-- Este parche alinea las coincidencias con 0093 usando el helper DEFINER
-- `caso_busqueda_es_nna(caso_id)` (lee `busqueda_casos.es_nna` saltando la RLS):
--   · admin / opera_verificacion / mando de búsqueda → TODO.
--   · buscador general (es_busqueda)  → SOLO coincidencias de casos NO-NNA.
--   · Buscador NNA (es_buscador_nna)  → SOLO coincidencias de casos NNA.
--   · Enlace de contacto              → coincidencias NO-NNA (su rama, 0093/0094).
-- Y `buscar_personas()` oculta a los MENORES digitalizados al buscador general.
--
-- Sin datos nuevos ni cambios de firma (los RPC conservan sus columnas → `create or
-- replace` seguro). Idempotente. Ejecutar tras 0121.
-- ============================================================

-- ── 1) RLS de la tabla `coincidencias`: SELECT y UPDATE con filtro NNA ──
drop policy if exists coincidencias_select on public.coincidencias;
create policy coincidencias_select on public.coincidencias for select to authenticated
  using (
    public.es_admin() or public.opera_verificacion() or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada()
        and not public.caso_busqueda_es_nna(caso_id))
    or (public.es_buscador_nna() and public.identidad_aprobada()
        and public.caso_busqueda_es_nna(caso_id))
    or (public.es_enlace() and public.identidad_aprobada()
        and not public.caso_busqueda_es_nna(caso_id))
  );

drop policy if exists coincidencias_update on public.coincidencias;
create policy coincidencias_update on public.coincidencias for update to authenticated
  using (
    public.es_admin() or public.opera_verificacion() or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada()
        and not public.caso_busqueda_es_nna(caso_id))
    or (public.es_buscador_nna() and public.identidad_aprobada()
        and public.caso_busqueda_es_nna(caso_id))
    or (public.es_enlace() and public.identidad_aprobada()
        and not public.caso_busqueda_es_nna(caso_id))
  )
  with check (
    public.es_admin() or public.opera_verificacion() or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada()
        and not public.caso_busqueda_es_nna(caso_id))
    or (public.es_buscador_nna() and public.identidad_aprobada()
        and public.caso_busqueda_es_nna(caso_id))
    or (public.es_enlace() and public.identidad_aprobada()
        and not public.caso_busqueda_es_nna(caso_id))
  );

-- ── 2) `listar_coincidencias()`: mismo filtro NNA per-fila (firma idéntica a 0106) ──
create or replace function public.listar_coincidencias()
returns table (
  id uuid, estado text, motivo text, creado_en timestamptz,
  persona_nombre text, persona_cedula text, persona_edad int, persona_condicion text, es_menor boolean,
  lugar_nombre text, lugar_tipo text,
  caso_id uuid, caso_numero bigint, caso_titulo text
) language sql stable security definer set search_path = public as $$
  select c.id, c.estado, c.motivo, c.creado_en,
         p.nombre_completo, p.cedula, p.edad, p.condicion,
         (p.edad is not null and p.edad < 18),
         l.nombre, l.tipo,
         ca.id, ca.numero, ca.titulo
  from public.coincidencias c
  join public.personas_listado p on p.id = c.persona_listado_id
  left join public.listados_digitalizados ld on ld.id = p.listado_id
  left join public.lugares l on l.id = ld.lugar_id
  join public.casos ca on ca.id = c.caso_id
  where public.es_admin() or public.opera_verificacion() or public.es_mando_busqueda()
     or (public.es_busqueda() and public.identidad_aprobada()
         and not public.caso_busqueda_es_nna(c.caso_id))
     or (public.es_buscador_nna() and public.identidad_aprobada()
         and public.caso_busqueda_es_nna(c.caso_id))
     or (public.es_enlace() and public.identidad_aprobada()
         and not public.caso_busqueda_es_nna(c.caso_id))
  order by (c.estado = 'nueva') desc, c.creado_en desc
  limit 300;
$$;
grant execute on function public.listar_coincidencias() to authenticated;

-- ── 3) `buscar_personas()`: el buscador general NO ve menores digitalizados ──
-- (firma idéntica a 0084). El Buscador NNA / mando / admin / opera_verificacion ven todo.
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
  where (
          public.es_admin() or public.opera_verificacion() or public.es_mando_busqueda()
          or (public.es_buscador_nna() and public.identidad_aprobada())
          or (public.es_busqueda() and public.identidad_aprobada()
              and not (p.edad is not null and p.edad < 18))
        )
    and length(t.norm) >= 2
    and (p.nombre_norm like '%' || t.norm || '%'
         or (t.ced <> '' and regexp_replace(coalesce(p.cedula, ''), '\D', '', 'g') like '%' || t.ced || '%'))
  order by p.nombre_completo
  limit 100;
$$;
grant execute on function public.buscar_personas(text) to authenticated;
