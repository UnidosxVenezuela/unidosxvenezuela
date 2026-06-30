-- ============================================================
-- 0043 — Habilidades del perfil + múltiples roles por usuario
--
-- * habilidades: lista de fortalezas que el propio usuario edita (visibles como
--   su rol, para que coordinación sepa en qué puede ayudar).
-- * roles_extra: roles adicionales (además del principal). Un verificador puede
--   trabajar también como redactor, etc. Las funciones de permisos pasan a mirar
--   el CONJUNTO de roles (principal + extra). El admin conserva acceso total.
--
-- Idempotente. RLS sigue siendo la fuente de verdad: los cambios de rol/roles
-- siguen protegidos contra auto-escalada (trigger proteger_campos_perfil).
-- ============================================================

alter table public.perfiles add column if not exists roles_extra public.rol_usuario[] not null default '{}';
alter table public.perfiles add column if not exists habilidades text[] not null default '{}';

-- Conjunto de roles del usuario actual (principal + extra).
create or replace function public.mis_roles()
returns public.rol_usuario[]
language sql stable security definer set search_path = public as $$
  select array[rol] || coalesce(roles_extra, '{}'::public.rol_usuario[])
  from public.perfiles where id = auth.uid();
$$;
grant execute on function public.mis_roles() to authenticated;

-- ¿El usuario actual tiene este rol (principal o extra)?
create or replace function public.tiene_rol(r public.rol_usuario)
returns boolean language sql stable security definer set search_path = public as $$
  select r = any(public.mis_roles());
$$;
grant execute on function public.tiene_rol(public.rol_usuario) to authenticated;

-- ── Funciones de permisos: ahora miran el conjunto de roles ──
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tiene_rol('admin');
$$;

create or replace function public.es_coordinacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tiene_rol('admin') or public.tiene_rol('coordinador');
$$;

create or replace function public.puede_crear_tareas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tiene_rol('admin') or public.tiene_rol('coordinador') or public.tiene_rol('lider_grupo');
$$;

create or replace function public.puede_ver_casos()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificado() and (
    public.tiene_rol('admin') or public.tiene_rol('coordinador')
    or public.tiene_rol('verificador') or public.tiene_rol('recopilacion'));
$$;

create or replace function public.puede_verificar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificado() and (
    public.tiene_rol('admin') or public.tiene_rol('coordinador') or public.tiene_rol('verificador'));
$$;

create or replace function public.puede_pipeline()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificado() and (
    public.tiene_rol('admin') or public.tiene_rol('coordinador')
    or public.tiene_rol('redaccion') or public.tiene_rol('diseno_grafico')
    or public.tiene_rol('edicion_video') or public.tiene_rol('redes_sociales'));
$$;

create or replace function public.puede_editar_etapa(p_etapa public.etapa_contenido)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_coordinacion() or case p_etapa
    when 'redaccion' then public.tiene_rol('redaccion')
    when 'diseno'    then public.tiene_rol('diseno_grafico')
    when 'video'     then public.tiene_rol('edicion_video')
    when 'redes'     then public.tiene_rol('redes_sociales')
    else false
  end;
$$;

-- ── Proteger roles_extra contra auto-escalada (igual que rol) ──
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

  -- 1b) Los roles adicionales (roles_extra) solo los cambia coordinación.
  if (new.roles_extra is distinct from old.roles_extra) and not public.es_coordinacion() then
    raise exception 'No puedes cambiar tus roles.';
  end if;

  -- 2) Cambiar el rol de un admin (o promover a admin) = solo superadmin.
  if (new.rol is distinct from old.rol)
     and (old.rol = 'admin' or new.rol = 'admin')
     and not actor_super then
    raise exception 'Solo un superadministrador puede cambiar el rol de un administrador.'
      using errcode = '42501';
  end if;

  -- 2b) Conceder/quitar 'admin' como rol extra = solo superadmin.
  if (new.roles_extra is distinct from old.roles_extra)
     and ('admin' = any(coalesce(new.roles_extra, '{}'::public.rol_usuario[]))
          or 'admin' = any(coalesce(old.roles_extra, '{}'::public.rol_usuario[])))
     and not actor_super then
    raise exception 'Solo un superadministrador puede conceder el rol de administrador.'
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
