-- ============================================================
-- Puntos de acopio (mapa de coordinación)
-- ============================================================
create table public.puntos_acopio (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  direccion   text,
  responsable text,
  telefono    text,
  recibe      text,        -- qué insumos recibe
  necesita    text,        -- qué hace falta ahora
  horario     text,
  lat         double precision not null,
  lng         double precision not null,
  activo      boolean not null default true,
  creado_por  uuid references public.perfiles (id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index idx_acopio_activo on public.puntos_acopio (activo);

alter table public.puntos_acopio enable row level security;

-- Lectura para cualquier autenticado (coordinación abierta).
create policy "acopio_lectura" on public.puntos_acopio for select
  to authenticated using (true);

-- Registrar puntos: cualquier autenticado (queda como creador).
create policy "acopio_insert" on public.puntos_acopio for insert
  to authenticated with check (creado_por = auth.uid());

-- Editar/borrar: el creador o la coordinación.
create policy "acopio_update" on public.puntos_acopio for update
  to authenticated
  using (creado_por = auth.uid() or public.es_coordinacion())
  with check (creado_por = auth.uid() or public.es_coordinacion());
create policy "acopio_delete" on public.puntos_acopio for delete
  to authenticated using (creado_por = auth.uid() or public.es_coordinacion());

-- Tiempo real.
alter publication supabase_realtime add table public.puntos_acopio;
