-- ============================================================
-- 0024 — Aliados con doble aprobación (control 4 ojos)
-- ============================================================
-- Otorgar el rol 'lider_plataforma_aliada' (acceso a endpoints aliados)
-- requiere: 2 administradores distintos, o 1 si es superadmin.
-- Solo administradores participan. La regla vive en la BD: el rol de aliado
-- únicamente se concede desde el RPC de aprobación (no por cambio directo).
-- ============================================================

-- Helper: solo administrador (no coordinador).
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_rol() = 'admin';
$$;

-- Solicitud para promover a un perfil a líder de plataforma aliada.
create table if not exists public.solicitudes_aliado (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references public.perfiles (id) on delete cascade,
  estado      text not null default 'pendiente' check (estado in ('pendiente','aprobada')),
  creado_en   timestamptz not null default now(),
  resuelto_en timestamptz
);
-- Una sola solicitud pendiente por perfil.
create unique index if not exists uq_solic_aliado_pend
  on public.solicitudes_aliado (perfil_id) where estado = 'pendiente';

-- Ledger de aprobaciones (una por admin por solicitud).
create table if not exists public.aprobaciones_aliado (
  solicitud_id uuid not null references public.solicitudes_aliado (id) on delete cascade,
  admin_id     uuid not null references public.perfiles (id),
  creado_en    timestamptz not null default now(),
  primary key (solicitud_id, admin_id)
);

alter table public.solicitudes_aliado  enable row level security;
alter table public.aprobaciones_aliado enable row level security;

-- Solo admins ven el flujo. La escritura va exclusivamente por los RPC (SECURITY DEFINER).
drop policy if exists "solic_aliado_lect" on public.solicitudes_aliado;
create policy "solic_aliado_lect" on public.solicitudes_aliado for select
  to authenticated using (public.es_admin());
drop policy if exists "aprob_aliado_lect" on public.aprobaciones_aliado;
create policy "aprob_aliado_lect" on public.aprobaciones_aliado for select
  to authenticated using (public.es_admin());

-- Aplica la promoción si se alcanzó el umbral (1 superadmin o 2 admins).
create or replace function public._resolver_aliado(p_solicitud uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_perfil uuid; v_super boolean; v_n int;
begin
  select perfil_id into v_perfil
    from public.solicitudes_aliado where id = p_solicitud and estado = 'pendiente';
  if v_perfil is null then return; end if;

  select exists (
    select 1 from public.aprobaciones_aliado a
    join public.perfiles p on p.id = a.admin_id
    where a.solicitud_id = p_solicitud and p.super_admin
  ) into v_super;

  select count(*) into v_n from public.aprobaciones_aliado a
    join public.perfiles p on p.id = a.admin_id
    where a.solicitud_id = p_solicitud and p.rol = 'admin';

  if v_super or v_n >= 2 then
    perform set_config('app.aliado_ok', '1', true);   -- habilita la regla 4 del trigger
    update public.perfiles set rol = 'lider_plataforma_aliada', verificado = true
      where id = v_perfil;
    perform set_config('app.aliado_ok', '', true);    -- revoca el permiso de inmediato
    update public.solicitudes_aliado set estado = 'aprobada', resuelto_en = now()
      where id = p_solicitud;
  end if;
end; $$;

-- Proponer un perfil como aliado (cuenta como la 1ª aprobación del proponente).
create or replace function public.proponer_aliado(p_perfil uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_solic uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede proponer aliados.' using errcode = '42501';
  end if;
  if auth.uid() = p_perfil then
    raise exception 'No podés proponerte a vos mismo.' using errcode = '42501';
  end if;

  select id into v_solic from public.solicitudes_aliado
    where perfil_id = p_perfil and estado = 'pendiente';
  if v_solic is null then
    insert into public.solicitudes_aliado (perfil_id) values (p_perfil) returning id into v_solic;
  end if;

  insert into public.aprobaciones_aliado (solicitud_id, admin_id)
    values (v_solic, auth.uid()) on conflict do nothing;
  perform public._resolver_aliado(v_solic);
  return v_solic;
end; $$;

-- Aprobar una solicitud existente (2º admin, o superadmin).
create or replace function public.aprobar_aliado(p_solicitud uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede aprobar aliados.' using errcode = '42501';
  end if;
  insert into public.aprobaciones_aliado (solicitud_id, admin_id)
    values (p_solicitud, auth.uid()) on conflict do nothing;
  perform public._resolver_aliado(p_solicitud);
end; $$;

grant execute on function public.proponer_aliado(uuid) to authenticated;
grant execute on function public.aprobar_aliado(uuid)  to authenticated;

-- ── Regla 4 en el trigger: el rol de aliado solo se concede vía flujo aprobado ──
create or replace function public.proteger_campos_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_super boolean;
begin
  if auth.uid() is null then return new; end if;
  actor_super := coalesce((select super_admin from public.perfiles where id = auth.uid()), false);

  -- 1) Nadie cambia su propio rol/verificado salvo coordinación.
  if (new.rol is distinct from old.rol or new.verificado is distinct from old.verificado)
     and not public.es_coordinacion() then
    raise exception 'No puedes cambiar tu rol ni tu estado de verificación.';
  end if;

  -- 2) Cambiar el rol de un admin (o promover a admin) = solo superadmin.
  if (new.rol is distinct from old.rol)
     and (old.rol = 'admin' or new.rol = 'admin')
     and not actor_super then
    raise exception 'Solo un superadministrador puede cambiar el rol de un administrador.'
      using errcode = '42501';
  end if;

  -- 3) Otorgar/quitar superadmin = solo superadmin.
  if (new.super_admin is distinct from old.super_admin) and not actor_super then
    raise exception 'Solo un superadministrador puede gestionar superadministradores.'
      using errcode = '42501';
  end if;

  -- 4) Otorgar el rol de aliado: solo desde el flujo de doble aprobación.
  if new.rol = 'lider_plataforma_aliada' and (new.rol is distinct from old.rol)
     and coalesce(current_setting('app.aliado_ok', true), '') <> '1' then
    raise exception 'El rol de líder de plataforma aliada se otorga solo con doble aprobación.'
      using errcode = '42501';
  end if;

  return new;
end; $$;
