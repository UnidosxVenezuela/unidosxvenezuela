-- 0037: Pipeline de producción de contenido.
-- Una "pieza de contenido" nace de un caso CONFIRMADO Y ACTIVO y avanza por
-- etapas: Redacción → (Diseño | Video) → Redes → Publicado.
-- Aplicar DESPUÉS de 0036 (usa los roles nuevos del enum rol_usuario).

-- Etapas del pipeline y destino elegido en Redacción.
do $$ begin
  create type public.etapa_contenido as enum ('redaccion', 'diseno', 'video', 'redes', 'publicado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.destino_contenido as enum ('diseno', 'video');
exception when duplicate_object then null; end $$;

create table if not exists public.piezas_contenido (
  id              uuid primary key default gen_random_uuid(),
  caso_id         uuid references public.casos (id) on delete set null,
  titulo          text not null,
  etapa           public.etapa_contenido not null default 'redaccion',
  destino         public.destino_contenido,
  contenido       text,
  descripcion     text,
  enlace_pieza    text,
  notas           text,
  asignado_a      uuid references public.perfiles (id),
  creado_por      uuid references public.perfiles (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists idx_piezas_etapa on public.piezas_contenido (etapa);
create index if not exists idx_piezas_caso on public.piezas_contenido (caso_id);

-- ¿Participa del pipeline de contenido? (coordinación o un rol de producción)
create or replace function public.puede_pipeline()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificado() and public.mi_rol() in
    ('admin', 'coordinador', 'redaccion', 'diseno_grafico', 'edicion_video', 'redes_sociales');
$$;

-- ¿Puede actuar sobre una pieza en esta etapa? (coordinación o el rol de la etapa)
create or replace function public.puede_editar_etapa(p_etapa public.etapa_contenido)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_coordinacion() or case p_etapa
    when 'redaccion' then public.mi_rol() = 'redaccion'
    when 'diseno'    then public.mi_rol() = 'diseno_grafico'
    when 'video'     then public.mi_rol() = 'edicion_video'
    when 'redes'     then public.mi_rol() = 'redes_sociales'
    else false
  end;
$$;

alter table public.piezas_contenido enable row level security;

-- Lectura: cualquiera del pipeline ve el tablero.
drop policy if exists "piezas_lectura" on public.piezas_contenido;
create policy "piezas_lectura" on public.piezas_contenido for select to authenticated
  using (public.puede_pipeline());

-- Crear: solo coordinación (1-2 admins envían el caso confirmado a Redacción).
drop policy if exists "piezas_insert" on public.piezas_contenido;
create policy "piezas_insert" on public.piezas_contenido for insert to authenticated
  with check (public.es_coordinacion() and creado_por = auth.uid());

-- Editar/avanzar: coordinación o el rol de la etapa actual. La transición válida
-- la asegura la server action; la RLS solo limita a miembros del pipeline.
drop policy if exists "piezas_update" on public.piezas_contenido;
create policy "piezas_update" on public.piezas_contenido for update to authenticated
  using (public.es_coordinacion() or public.puede_editar_etapa(etapa))
  with check (public.puede_pipeline());

-- Borrar: coordinación.
drop policy if exists "piezas_delete" on public.piezas_contenido;
create policy "piezas_delete" on public.piezas_contenido for delete to authenticated
  using (public.es_coordinacion());

-- Realtime + auditoría (historial reutilizando registro_auditoria).
alter publication supabase_realtime add table public.piezas_contenido;
create trigger aud_piezas_contenido after insert or update or delete on public.piezas_contenido
  for each row execute function public.auditar_cambio();
