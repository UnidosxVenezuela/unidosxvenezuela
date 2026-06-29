-- ============================================================
-- 0023 — Mensajes fijados del grupo (anuncios)
-- ============================================================
-- Líder del grupo, coordinador y admin pueden dejar mensajes fijos
-- (anuncios) en un grupo. Cualquier usuario verificado los lee (igual
-- que el resto de la página del grupo). Fijar = crear; quitar = borrar.
-- ============================================================

create table if not exists public.mensajes_fijados (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.grupos (id) on delete cascade,
  autor_id  uuid not null references public.perfiles (id),
  contenido text not null check (char_length(contenido) between 1 and 2000),
  creado_en timestamptz not null default now()
);
create index if not exists idx_msgfij_grupo on public.mensajes_fijados (grupo_id, creado_en desc);

alter table public.mensajes_fijados enable row level security;

-- ¿Puede el usuario fijar/quitar en este grupo? Coordinación global o líder del grupo.
create or replace function public.puede_fijar_en_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_coordinacion()
      or exists (select 1 from public.grupos g where g.id = p_grupo and g.lider_id = auth.uid());
$$;

-- Lectura: cualquier usuario autenticado (la página del grupo ya es abierta a verificados).
drop policy if exists "msgfij_lectura" on public.mensajes_fijados;
create policy "msgfij_lectura" on public.mensajes_fijados for select
  to authenticated using (true);

-- Escribir: solo quien puede fijar en ese grupo, y como autor.
drop policy if exists "msgfij_insert" on public.mensajes_fijados;
create policy "msgfij_insert" on public.mensajes_fijados for insert
  to authenticated
  with check (autor_id = auth.uid() and public.puede_fijar_en_grupo(grupo_id));

-- Quitar: quien puede fijar en ese grupo (líder/coordinación/admin).
drop policy if exists "msgfij_delete" on public.mensajes_fijados;
create policy "msgfij_delete" on public.mensajes_fijados for delete
  to authenticated using (public.puede_fijar_en_grupo(grupo_id));

-- Realtime para que el mensaje aparezca/desaparezca en vivo.
alter publication supabase_realtime add table public.mensajes_fijados;
