-- ============================================================
-- 0065 — Inventario y necesidades de los centros de acopio
-- ------------------------------------------------------------
-- El centro se crea simple (sin necesidades). Ya creado, se lleva:
--   · inventario_acopio  → control de existencias (producto + cantidad actual),
--     alta manual o por código (QR/barras) desde el teléfono.
--   · necesidades_acopio → solicitudes / faltantes marcados por urgencia.
-- Gestionan: admin, rol logística, el creador del centro y sus responsables.
-- Idempotente.
-- ============================================================

-- ¿Puede gestionar el inventario/necesidades de ESTE centro?
create or replace function public.puede_gestionar_acopio(p_punto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.tiene_rol('logistica')
     or exists (select 1 from public.puntos_acopio pa where pa.id = p_punto and pa.creado_por = auth.uid())
     or exists (select 1 from public.acopio_responsables ar where ar.punto_id = p_punto and ar.perfil_id = auth.uid());
$$;
grant execute on function public.puede_gestionar_acopio(uuid) to authenticated;

-- ── Inventario ──
create table if not exists public.inventario_acopio (
  id              uuid primary key default gen_random_uuid(),
  punto_id        uuid not null references public.puntos_acopio (id) on delete cascade,
  producto        text not null,
  categoria       text,            -- medicamentos/alimentos/agua/higiene/refugio/otro
  unidad          text,            -- unidades/kg/litros/cajas/paquetes
  cantidad        numeric not null default 0 check (cantidad >= 0),
  codigo          text,            -- código de barras/QR (opcional)
  actualizado_por uuid references public.perfiles (id),
  actualizado_en  timestamptz not null default now(),
  creado_en       timestamptz not null default now(),
  unique (punto_id, producto)
);
create index if not exists idx_inv_punto on public.inventario_acopio (punto_id);

alter table public.inventario_acopio enable row level security;
drop policy if exists inv_select on public.inventario_acopio;
create policy inv_select on public.inventario_acopio for select to authenticated using (true);
drop policy if exists inv_insert on public.inventario_acopio;
create policy inv_insert on public.inventario_acopio for insert to authenticated
  with check (public.puede_gestionar_acopio(punto_id));
drop policy if exists inv_update on public.inventario_acopio;
create policy inv_update on public.inventario_acopio for update to authenticated
  using (public.puede_gestionar_acopio(punto_id)) with check (public.puede_gestionar_acopio(punto_id));
drop policy if exists inv_delete on public.inventario_acopio;
create policy inv_delete on public.inventario_acopio for delete to authenticated
  using (public.puede_gestionar_acopio(punto_id));

-- ── Necesidades / solicitudes urgentes ──
create table if not exists public.necesidades_acopio (
  id          uuid primary key default gen_random_uuid(),
  punto_id    uuid not null references public.puntos_acopio (id) on delete cascade,
  producto    text not null,
  categoria   text,
  urgencia    text not null default 'media' check (urgencia in ('alta','media','baja')),
  nota        text,
  resuelta    boolean not null default false,
  creado_por  uuid references public.perfiles (id),
  creado_en   timestamptz not null default now()
);
create index if not exists idx_nec_punto on public.necesidades_acopio (punto_id, resuelta);

alter table public.necesidades_acopio enable row level security;
drop policy if exists nec_select on public.necesidades_acopio;
create policy nec_select on public.necesidades_acopio for select to authenticated using (true);
drop policy if exists nec_insert on public.necesidades_acopio;
create policy nec_insert on public.necesidades_acopio for insert to authenticated
  with check (public.puede_gestionar_acopio(punto_id));
drop policy if exists nec_update on public.necesidades_acopio;
create policy nec_update on public.necesidades_acopio for update to authenticated
  using (public.puede_gestionar_acopio(punto_id)) with check (public.puede_gestionar_acopio(punto_id));
drop policy if exists nec_delete on public.necesidades_acopio;
create policy nec_delete on public.necesidades_acopio for delete to authenticated
  using (public.puede_gestionar_acopio(punto_id));

-- Realtime (para actualizar el inventario en vivo entre teléfonos).
do $$ begin alter publication supabase_realtime add table public.inventario_acopio; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.necesidades_acopio; exception when duplicate_object then null; end $$;
