-- ============================================================
-- 0034 — Módulo de Verificación de casos
-- ============================================================
-- Información/acciones sensibles entran como "casos" que un equipo de
-- verificación revisa. Solo cuando se marca "confirmado" avanza (queda listo
-- para la siguiente etapa). Acceso: coordinación o rol 'verificador', siempre
-- con cuenta verificada.
-- ============================================================

-- Rol de verificación.
alter type public.rol_usuario add value if not exists 'verificador';

-- Estado del caso.
do $$ begin
  create type public.estado_caso as enum ('en_proceso', 'confirmado', 'falso');
exception when duplicate_object then null; end $$;

create table if not exists public.casos (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity,
  titulo            text not null,
  descripcion       text,
  categoria         text,
  fuente            text,
  fuente_url        text,
  fecha_publicacion date,
  asignado_a        uuid references public.perfiles (id),
  estado            public.estado_caso not null default 'en_proceso',
  notas             text,
  creado_por        uuid references public.perfiles (id),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index if not exists idx_casos_estado on public.casos (estado, creado_en desc);

-- ¿Puede verificar? coordinación o rol verificador, con cuenta verificada.
create or replace function public.puede_verificar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificado() and public.mi_rol() in ('admin', 'coordinador', 'verificador');
$$;
grant execute on function public.puede_verificar() to authenticated;

alter table public.casos enable row level security;

drop policy if exists "casos_lectura" on public.casos;
create policy "casos_lectura" on public.casos for select to authenticated
  using (public.puede_verificar());

drop policy if exists "casos_insert" on public.casos;
create policy "casos_insert" on public.casos for insert to authenticated
  with check (public.puede_verificar() and creado_por = auth.uid());

drop policy if exists "casos_update" on public.casos;
create policy "casos_update" on public.casos for update to authenticated
  using (public.puede_verificar()) with check (public.puede_verificar());

drop policy if exists "casos_delete" on public.casos;
create policy "casos_delete" on public.casos for delete to authenticated
  using (public.es_coordinacion());

-- Auditoría: capturar también el 'estado' en metadata (para el historial).
create or replace function public.auditar_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  rec := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (
    auth.uid(),
    tg_table_name || ':' || lower(tg_op),
    tg_table_name,
    coalesce(rec->>'id', rec->>'tarea_id', rec->>'grupo_id'),
    jsonb_strip_nulls(jsonb_build_object(
      'titulo',    rec->>'titulo',
      'nombre',    rec->>'nombre',
      'estado',    rec->>'estado',
      'grupo_id',  rec->>'grupo_id',
      'perfil_id', rec->>'perfil_id'
    ))
  );
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

drop trigger if exists aud_casos on public.casos;
create trigger aud_casos after insert or update or delete on public.casos
  for each row execute function public.auditar_cambio();

do $$ begin
  alter publication supabase_realtime add table public.casos;
exception when duplicate_object then null; end $$;
