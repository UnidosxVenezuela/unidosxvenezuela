-- ============================================================
-- 0010 — Grupos + Colaboración
-- (a) WhatsApp del grupo  (b) conteo público de miembros
-- (c) reuniones (videollamada) con RLS
-- ============================================================

-- (a) WhatsApp del grupo. CHECK endurecido: solo https a dominios de
-- WhatsApp, sin espacios NI caracteres de control.
alter table public.grupos add column if not exists whatsapp text;

alter table public.grupos drop constraint if exists grupos_whatsapp_formato;
alter table public.grupos add constraint grupos_whatsapp_formato
  check (
    whatsapp is null
    or (
      whatsapp ~ '^https://(wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)/[^[:cntrl:][:space:]]+$'
      and whatsapp !~ '[[:cntrl:]]'
    )
  );

-- (b) Conteo de miembros para TODO autenticado. SECURITY DEFINER, solo agregados.
create or replace function public.conteo_miembros_grupo()
returns table (grupo_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select grupo_id, count(*)::bigint from public.miembros_grupo group by grupo_id;
$$;
revoke all on function public.conteo_miembros_grupo() from public;
grant execute on function public.conteo_miembros_grupo() to authenticated;

-- Helper: ¿soy líder de este grupo?
create or replace function public.es_lider_de(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grupos where id = g and lider_id = auth.uid());
$$;

-- (c) Reuniones / videollamadas por grupo.
create table if not exists public.reuniones (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos (id) on delete cascade,
  titulo       text not null,
  enlace       text not null,
  inicio       timestamptz not null,
  duracion_min int not null default 60,
  creado_por   uuid references public.perfiles (id) on delete set null,
  creado_en    timestamptz not null default now(),
  constraint reuniones_duracion_pos check (duracion_min > 0 and duracion_min <= 1440),
  constraint reuniones_enlace_https
    check (enlace ~ '^https://[^[:cntrl:][:space:]]+$' and enlace !~ '[[:cntrl:]]')
);
create index if not exists idx_reuniones_grupo  on public.reuniones (grupo_id);
create index if not exists idx_reuniones_inicio on public.reuniones (inicio);

alter table public.reuniones enable row level security;

drop policy if exists "reuniones_lectura" on public.reuniones;
create policy "reuniones_lectura" on public.reuniones for select
  to authenticated
  using (public.es_coordinacion() or public.es_miembro_de(grupo_id));

drop policy if exists "reuniones_insert" on public.reuniones;
create policy "reuniones_insert" on public.reuniones for insert
  to authenticated
  with check (creado_por = auth.uid()
              and (public.es_coordinacion() or public.es_lider_de(grupo_id)));

drop policy if exists "reuniones_update" on public.reuniones;
create policy "reuniones_update" on public.reuniones for update
  to authenticated
  using (public.es_coordinacion() or public.es_lider_de(grupo_id))
  with check (public.es_coordinacion() or public.es_lider_de(grupo_id));

drop policy if exists "reuniones_delete" on public.reuniones;
create policy "reuniones_delete" on public.reuniones for delete
  to authenticated
  using (public.es_coordinacion() or public.es_lider_de(grupo_id));

do $$ begin
  alter publication supabase_realtime add table public.reuniones;
exception when duplicate_object then null; end $$;
