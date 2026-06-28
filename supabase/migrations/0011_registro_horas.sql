-- ============================================================
-- 0011 — Engagement: registro de horas de voluntariado
-- ============================================================
create table if not exists public.registro_horas (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  tarea_id    uuid references public.tareas (id) on delete set null,
  horas       numeric(6,2) not null check (horas > 0 and horas <= 24),
  descripcion text,
  fecha       date not null default current_date,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_horas_perfil on public.registro_horas (perfil_id);
create index if not exists idx_horas_fecha  on public.registro_horas (fecha);

alter table public.registro_horas enable row level security;

drop policy if exists "horas_lectura_propia_o_coord" on public.registro_horas;
create policy "horas_lectura_propia_o_coord" on public.registro_horas for select
  to authenticated using (perfil_id = auth.uid() or public.es_coordinacion());

drop policy if exists "horas_insert_propia" on public.registro_horas;
create policy "horas_insert_propia" on public.registro_horas for insert
  to authenticated with check (perfil_id = auth.uid());

drop policy if exists "horas_update_propia_o_coord" on public.registro_horas;
create policy "horas_update_propia_o_coord" on public.registro_horas for update
  to authenticated
  using (perfil_id = auth.uid() or public.es_coordinacion())
  with check (perfil_id = auth.uid() or public.es_coordinacion());

drop policy if exists "horas_delete_propia_o_coord" on public.registro_horas;
create policy "horas_delete_propia_o_coord" on public.registro_horas for delete
  to authenticated using (perfil_id = auth.uid() or public.es_coordinacion());

-- Tope de 24h por (perfil, día): evita inflar el contador comunitario.
create or replace function public.validar_tope_horas_diario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_suma numeric;
begin
  select coalesce(sum(horas), 0) into v_suma
  from public.registro_horas
  where perfil_id = new.perfil_id and fecha = new.fecha
    and (tg_op = 'INSERT' or id <> new.id);
  if v_suma + new.horas > 24 then
    raise exception 'Supera el máximo de 24 horas registradas en el día (%).', new.fecha
      using errcode = '23514';
  end if;
  return new;
end; $$;

drop trigger if exists trg_tope_horas on public.registro_horas;
create trigger trg_tope_horas
  before insert or update on public.registro_horas
  for each row execute function public.validar_tope_horas_diario();

-- Contador comunitario (agregado escalar).
create or replace function public.total_horas_comunidad()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(horas), 0)::numeric from public.registro_horas;
$$;
revoke all on function public.total_horas_comunidad() from public;
grant execute on function public.total_horas_comunidad() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.registro_horas;
exception when duplicate_object then null; end $$;
