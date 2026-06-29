-- ============================================================
-- 0028 — Vetar (banear) miembros de un grupo
-- ============================================================
-- El líder del grupo o la coordinación (admin/coordinador) pueden vetar a
-- una persona de un grupo: se la quita y no puede volver a unirse hasta
-- que la desveten. Reusa puede_fijar_en_grupo() (líder o coordinación).
-- ============================================================

create table if not exists public.miembros_baneados (
  grupo_id    uuid not null references public.grupos (id) on delete cascade,
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  baneado_por uuid references public.perfiles (id),
  motivo      text,
  creado_en   timestamptz not null default now(),
  primary key (grupo_id, perfil_id)
);

alter table public.miembros_baneados enable row level security;

drop policy if exists "ban_lectura" on public.miembros_baneados;
create policy "ban_lectura" on public.miembros_baneados for select to authenticated
  using (public.puede_fijar_en_grupo(grupo_id));

drop policy if exists "ban_insert" on public.miembros_baneados;
create policy "ban_insert" on public.miembros_baneados for insert to authenticated
  with check (public.puede_fijar_en_grupo(grupo_id) and baneado_por = auth.uid());

drop policy if exists "ban_delete" on public.miembros_baneados;
create policy "ban_delete" on public.miembros_baneados for delete to authenticated
  using (public.puede_fijar_en_grupo(grupo_id));

-- No se puede (re)agregar a alguien vetado.
create or replace function public.bloquear_baneado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.miembros_baneados b
             where b.grupo_id = new.grupo_id and b.perfil_id = new.perfil_id) then
    raise exception 'Esta persona está vetada de este grupo.' using errcode = '42501';
  end if;
  return new;
end; $$;

drop trigger if exists trg_bloquear_baneado on public.miembros_grupo;
create trigger trg_bloquear_baneado before insert on public.miembros_grupo
  for each row execute function public.bloquear_baneado();
