-- ============================================================
-- 0016 — Base de datos compartida: endpoints de plataformas aliadas
-- ============================================================
-- Rol nuevo 'lider_plataforma_aliada' (líder de una plataforma aliada
-- que comparte sus endpoints). Sección de acceso EXCLUSIVO a admin y a
-- ese rol: el resto no ve nada. "Juntos somos más."
-- ============================================================

-- Nuevo rol (idempotente).
alter type public.rol_usuario add value if not exists 'lider_plataforma_aliada';

-- Helper: ¿es líder de plataforma aliada? (comparación por texto para no
-- requerir el valor del enum en tiempo de parseo de políticas).
create or replace function public.es_aliado()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol::text = 'lider_plataforma_aliada' from public.perfiles where id = auth.uid()), false);
$$;

create table if not exists public.endpoints_aliados (
  id           uuid primary key default gen_random_uuid(),
  plataforma   text not null,            -- nombre de la app/plataforma aliada
  descripcion  text,                     -- qué hace la plataforma
  url          text not null,            -- endpoint base (https)
  metodo       text not null default 'GET',
  formato      text,                     -- json, csv, geojson...
  datos        text,                     -- qué datos ofrece / unifica
  auth_notas   text,                     -- cómo autenticar / notas de uso
  contacto     text,                     -- contacto técnico
  activo       boolean not null default true,
  creado_por   uuid references public.perfiles (id) on delete set null,
  creado_en    timestamptz not null default now(),
  constraint endpoints_url_https
    check (url ~ '^https://[^[:cntrl:][:space:]]+$' and url !~ '[[:cntrl:]]')
);
create index if not exists idx_endpoints_activo on public.endpoints_aliados (activo);

alter table public.endpoints_aliados enable row level security;

-- Lectura EXCLUSIVA: admin o líder de plataforma aliada.
drop policy if exists "endpoints_lectura" on public.endpoints_aliados;
create policy "endpoints_lectura" on public.endpoints_aliados for select
  to authenticated using (public.es_admin() or public.es_aliado());

-- Alta: admin o aliado, registrando su autoría.
drop policy if exists "endpoints_insert" on public.endpoints_aliados;
create policy "endpoints_insert" on public.endpoints_aliados for insert
  to authenticated
  with check (creado_por = auth.uid() and (public.es_admin() or public.es_aliado()));

-- Editar/borrar: el autor o un admin.
drop policy if exists "endpoints_update" on public.endpoints_aliados;
create policy "endpoints_update" on public.endpoints_aliados for update
  to authenticated
  using (public.es_admin() or creado_por = auth.uid())
  with check (public.es_admin() or creado_por = auth.uid());

drop policy if exists "endpoints_delete" on public.endpoints_aliados;
create policy "endpoints_delete" on public.endpoints_aliados for delete
  to authenticated using (public.es_admin() or creado_por = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.endpoints_aliados;
exception when duplicate_object then null; end $$;
