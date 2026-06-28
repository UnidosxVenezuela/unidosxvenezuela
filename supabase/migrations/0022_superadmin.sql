-- ============================================================
-- 0022 — Superadmin: solo él cambia el rol de un admin
-- ============================================================
-- Un admin común gestiona usuarios normales (verifica, asigna roles no-admin),
-- pero NO puede cambiar el rol de otro admin ni crear admins. Solo el
-- superadmin (el dueño) puede tocar admins y otorgar/quitar superadmin.
-- ============================================================

alter table public.perfiles add column if not exists super_admin boolean not null default false;

-- Superadmin inicial (dueño de la plataforma).
update public.perfiles set super_admin = true
  where id = '40dcaabc-3d70-4ead-abc5-ec5f8546f1f2';

create or replace function public.proteger_campos_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_super boolean;
begin
  -- Contexto sin sesión (service_role / SQL editor): sin restricción (bootstrap).
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

  return new;
end; $$;
