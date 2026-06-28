-- ============================================================
-- 0012 — Adjuntos de tareas (imagen / documento / enlace)
-- ============================================================
-- CRÍTICO: la visibilidad de ADJUNTOS NO hereda la regla de "tareas
-- abiertas". Los adjuntos pueden contener datos sensibles. Solo
-- coordinación, creador, asignado y miembros del grupo los ven.
-- ============================================================

do $$ begin
  create type public.tipo_adjunto as enum ('imagen', 'documento', 'enlace');
exception when duplicate_object then null; end $$;

create table if not exists public.adjuntos_tarea (
  id          uuid primary key default gen_random_uuid(),
  tarea_id    uuid not null references public.tareas (id) on delete cascade,
  tipo        public.tipo_adjunto not null,
  url         text not null,
  nombre      text not null,
  mime        text,
  creado_por  uuid references public.perfiles (id) on delete set null,
  creado_en   timestamptz not null default now(),
  constraint adj_enlace_https check (
    tipo <> 'enlace'
    or (url ~ '^https://[^[:cntrl:][:space:]]+$' and url !~ '[[:cntrl:]]')
  )
);
create index if not exists idx_adjtarea_tarea on public.adjuntos_tarea (tarea_id);

alter table public.adjuntos_tarea enable row level security;

-- ¿Puedo VER esta tarea PARA ADJUNTOS? SIN la rama de tareas abiertas.
create or replace function public.puede_ver_tarea(p_tarea uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tareas t
    where t.id = p_tarea
      and (
        public.es_coordinacion()
        or t.asignado_a = auth.uid()
        or t.creado_por = auth.uid()
        or (t.grupo_id is not null and public.es_miembro_de(t.grupo_id))
      )
  );
$$;

create or replace function public.puede_editar_tarea(p_tarea uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tareas t
    where t.id = p_tarea
      and (
        public.es_coordinacion()
        or t.asignado_a = auth.uid()
        or t.creado_por = auth.uid()
        or exists (select 1 from public.grupos g
                   where g.id = t.grupo_id and g.lider_id = auth.uid())
      )
  );
$$;

drop policy if exists "adjtarea_lectura" on public.adjuntos_tarea;
create policy "adjtarea_lectura" on public.adjuntos_tarea for select
  to authenticated using (public.puede_ver_tarea(tarea_id));

drop policy if exists "adjtarea_insert" on public.adjuntos_tarea;
create policy "adjtarea_insert" on public.adjuntos_tarea for insert
  to authenticated
  with check (creado_por = auth.uid() and public.puede_editar_tarea(tarea_id));

drop policy if exists "adjtarea_delete" on public.adjuntos_tarea;
create policy "adjtarea_delete" on public.adjuntos_tarea for delete
  to authenticated using (creado_por = auth.uid() or public.es_coordinacion());

do $$ begin
  alter publication supabase_realtime add table public.adjuntos_tarea;
exception when duplicate_object then null; end $$;
