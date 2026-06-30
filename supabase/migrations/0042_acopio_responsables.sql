-- ============================================================
-- 0042 — Coordinadores responsables de centros de acopio
-- Un administrador puede asignar uno o varios responsables (perfiles de la app)
-- a cada centro de acopio. Solo el admin asigna/quita; todos pueden ver quién es.
-- Idempotente: se puede re-ejecutar sin error.
-- ============================================================

create table if not exists public.acopio_responsables (
  punto_id     uuid not null references public.puntos_acopio (id) on delete cascade,
  perfil_id    uuid not null references public.perfiles (id) on delete cascade,
  asignado_por uuid references public.perfiles (id) on delete set null,
  creado_en    timestamptz not null default now(),
  primary key (punto_id, perfil_id)
);
create index if not exists idx_acopio_resp_punto on public.acopio_responsables (punto_id);
create index if not exists idx_acopio_resp_perfil on public.acopio_responsables (perfil_id);

alter table public.acopio_responsables enable row level security;

-- Lectura: cualquier autenticado (igual que los centros, coordinación abierta).
drop policy if exists "acopio_resp_lectura" on public.acopio_responsables;
create policy "acopio_resp_lectura" on public.acopio_responsables for select
  to authenticated using (true);

-- Asignar y quitar responsables: SOLO administradores.
drop policy if exists "acopio_resp_insert" on public.acopio_responsables;
create policy "acopio_resp_insert" on public.acopio_responsables for insert
  to authenticated with check (public.es_admin());

drop policy if exists "acopio_resp_delete" on public.acopio_responsables;
create policy "acopio_resp_delete" on public.acopio_responsables for delete
  to authenticated using (public.es_admin());

-- Tiempo real (idempotente: ignora si ya está en la publicación).
do $$ begin
  alter publication supabase_realtime add table public.acopio_responsables;
exception when duplicate_object then null;
end $$;
