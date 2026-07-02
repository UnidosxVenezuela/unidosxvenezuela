-- ============================================================
-- 0070 — Liderazgo por centro + capacidad de albergue
-- ------------------------------------------------------------
-- Cada centro lo LIDERA su creador (y los responsables que el admin asigne).
-- El rol logística deja de ser gestor GLOBAL: ahora un usuario de logística
-- lidera los centros que crea o donde es responsable, SIN interferir con los
-- centros de otros líderes. El admin conserva acceso total (supervisión).
-- Los líderes pueden VER los demás centros y su contacto (para coordinarse),
-- pero solo gestionan el/los suyo(s). La interacción entre centros es el
-- traspaso (y, en 0071, la solicitud de traspaso).
-- Además: capacidad de albergue (camas) para damnificados en todos los centros.
-- Idempotente.
-- ============================================================

-- ── Gestión de un centro: admin, su creador o un responsable (co-líder) ──
-- (Se quita el 'tiene_rol(logistica)' global.)
create or replace function public.puede_gestionar_acopio(p_punto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin()
     or exists (select 1 from public.puntos_acopio pa
                 where pa.id = p_punto and pa.creado_por = auth.uid())
     or exists (select 1 from public.acopio_responsables ar
                 where ar.punto_id = p_punto and ar.perfil_id = auth.uid());
$$;
grant execute on function public.puede_gestionar_acopio(uuid) to authenticated;

-- ── ¿Es líder de acopio? Controla el ACCESO a la sección (para coordinarse) ──
-- Admin, rol logística, o quien crea/lidera al menos un centro.
create or replace function public.es_lider_acopio()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.tiene_rol('logistica')
     or exists (select 1 from public.puntos_acopio where creado_por = auth.uid())
     or exists (select 1 from public.acopio_responsables where perfil_id = auth.uid());
$$;
grant execute on function public.es_lider_acopio() to authenticated;

-- ── Metadatos del centro (nombre, ubicación, capacidad): editar/borrar = sus líderes ──
drop policy if exists "acopio_update" on public.puntos_acopio;
create policy "acopio_update" on public.puntos_acopio for update to authenticated
  using (public.puede_gestionar_acopio(id)) with check (public.puede_gestionar_acopio(id));
drop policy if exists "acopio_delete" on public.puntos_acopio;
create policy "acopio_delete" on public.puntos_acopio for delete to authenticated
  using (public.puede_gestionar_acopio(id));

-- ── Capacidad de albergue (camas) para damnificados ──
alter table public.puntos_acopio add column if not exists camas_total    integer not null default 0;
alter table public.puntos_acopio add column if not exists camas_ocupadas integer not null default 0;
