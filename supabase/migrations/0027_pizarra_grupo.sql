-- ============================================================
-- 0027 — Pizarra de dibujo por grupo (lluvia de ideas)
-- ============================================================
-- Un lienzo (escena de Excalidraw, JSON) por grupo. Lo ven y editan los
-- miembros del grupo y la coordinación. Guardado autosave (último que
-- guarda gana) + realtime para ver cambios de otros.
-- ============================================================

create table if not exists public.pizarra_grupo (
  grupo_id        uuid primary key references public.grupos (id) on delete cascade,
  escena          jsonb not null default '{}'::jsonb,
  actualizado_por uuid references public.perfiles (id),
  actualizado_en  timestamptz not null default now()
);

alter table public.pizarra_grupo enable row level security;

drop policy if exists "pizarra_lectura" on public.pizarra_grupo;
create policy "pizarra_lectura" on public.pizarra_grupo for select to authenticated
  using (public.es_coordinacion() or public.es_miembro_de(grupo_id));

drop policy if exists "pizarra_insert" on public.pizarra_grupo;
create policy "pizarra_insert" on public.pizarra_grupo for insert to authenticated
  with check (public.es_coordinacion() or public.es_miembro_de(grupo_id));

drop policy if exists "pizarra_update" on public.pizarra_grupo;
create policy "pizarra_update" on public.pizarra_grupo for update to authenticated
  using (public.es_coordinacion() or public.es_miembro_de(grupo_id))
  with check (public.es_coordinacion() or public.es_miembro_de(grupo_id));

-- Realtime (idempotente).
do $$ begin
  alter publication supabase_realtime add table public.pizarra_grupo;
exception when duplicate_object then null;
end $$;
