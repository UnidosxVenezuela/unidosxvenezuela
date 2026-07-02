-- ============================================================
-- 0066 — Adjuntos de las piezas de contenido (entregables)
-- ------------------------------------------------------------
-- Los creadores de contenido pueden adjuntar VARIOS archivos a una pieza
-- (referencias, arte, video, versiones…), cada uno con quién lo compartió.
-- Los archivos van al bucket público 'contenido' (mismo que la pieza final).
-- Idempotente.
-- ============================================================

create table if not exists public.piezas_adjuntos (
  id          uuid primary key default gen_random_uuid(),
  pieza_id    uuid not null references public.piezas_contenido (id) on delete cascade,
  url         text not null,
  nombre      text not null,
  mime        text,
  etapa       text,          -- etapa en la que se subió (informativo)
  creado_por  uuid references public.perfiles (id),
  creado_en   timestamptz not null default now()
);
create index if not exists idx_piezas_adjuntos on public.piezas_adjuntos (pieza_id);

alter table public.piezas_adjuntos enable row level security;

-- Lee el pipeline; sube quien participa (para sí mismo); borra el autor o la coordinación.
drop policy if exists padj_select on public.piezas_adjuntos;
create policy padj_select on public.piezas_adjuntos for select to authenticated
  using (public.puede_pipeline());
drop policy if exists padj_insert on public.piezas_adjuntos;
create policy padj_insert on public.piezas_adjuntos for insert to authenticated
  with check (public.puede_pipeline() and creado_por = auth.uid());
drop policy if exists padj_delete on public.piezas_adjuntos;
create policy padj_delete on public.piezas_adjuntos for delete to authenticated
  using (creado_por = auth.uid() or public.es_coordinacion());

do $$ begin alter publication supabase_realtime add table public.piezas_adjuntos; exception when duplicate_object then null; end $$;
