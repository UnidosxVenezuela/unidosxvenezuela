-- ============================================================
-- 0128 — El Verificador de Digitalización también modera lugares
-- ------------------------------------------------------------
-- El verificador (con su 2ª verificación) ya revisa/corrige los listados; ahora
-- además MODERA los lugares del mapa: completa/corrige sus datos y los marca
-- verificados. Para eso se añade `opera_verificacion_digitalizacion()`
-- (verificador + identidad aprobada, 0125) a la LECTURA y la ACTUALIZACIÓN de
-- `lugares`.
--
-- El Admin de Digitalización CONSERVA todo (leer/editar/borrar vía
-- `es_admin_digitalizacion` / `opera_digitalizacion`, 0124) y sigue supervisando
-- su área. El verificador NO borra lugares: el DELETE queda como en 0124
-- (admin general + admin de Digitalización) y no se toca aquí.
-- Sin enums nuevos. Idempotente. Tras 0127.
-- ============================================================

-- Ver lugares: digitalización (admin · admin de digit · digitalizador, vía
-- puede_digitalizar) + verificador con identidad.
drop policy if exists lugares_select on public.lugares;
create policy lugares_select on public.lugares for select to authenticated
  using (public.puede_digitalizar() or public.opera_verificacion_digitalizacion());

-- Moderar (completar/corregir/verificar datos): admin, admin de Digitalización y
-- verificador (con 2ª verificación). Mismo predicado en using y with check.
drop policy if exists lugares_update on public.lugares;
create policy lugares_update on public.lugares for update to authenticated
  using (public.es_admin() or public.es_admin_digitalizacion() or public.opera_verificacion_digitalizacion())
  with check (public.es_admin() or public.es_admin_digitalizacion() or public.opera_verificacion_digitalizacion());

-- (lugares_delete NO cambia: solo admin general y admin de Digitalización — 0124.)
