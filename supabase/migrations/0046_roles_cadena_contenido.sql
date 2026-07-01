-- ============================================================
-- 0046 — Coordinadores y líderes asignan roles de la cadena de contenido
-- ============================================================
-- Para facilitar sumar gente al flujo de trabajo: coordinación (como siempre) y
-- ahora también los LÍDERES DE GRUPO pueden dar roles ADICIONALES de la cadena
-- de contenido (recopilación, verificación, redacción, diseño, video, redes) a
-- VOLUNTARIOS o a SÍ MISMOS — nunca a otros coordinadores/líderes/admins, y solo
-- roles de esa cadena (no coordinador/admin/aliado).
--
-- Se implementa con una función SECURITY DEFINER que valida el permiso y
-- actualiza roles_extra (salteando la RLS de perfiles). Habilita un flag de
-- sesión que el trigger proteger_campos_perfil reconoce (patrón de 'aliado').
-- Idempotente.
-- ============================================================

-- ¿Rol de la cadena de contenido?
create or replace function public.es_rol_cadena_contenido(r public.rol_usuario)
returns boolean language sql immutable as $$
  select r in ('recopilacion','verificador','redaccion','diseno_grafico','edicion_video','redes_sociales');
$$;

-- ¿El perfil objetivo es "asignable" por un líder? (no es mando) — o es uno mismo.
create or replace function public.es_perfil_asignable(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p = auth.uid() or not exists (
    select 1 from public.perfiles pf
    where pf.id = p
      and ( pf.rol in ('admin','coordinador','lider_grupo','lider_plataforma_aliada')
         or pf.roles_extra && array['admin','coordinador','lider_grupo','lider_plataforma_aliada']::public.rol_usuario[] )
  );
$$;

-- Asigna los roles de contenido: reemplaza SOLO la parte de contenido de
-- roles_extra y preserva cualquier otro rol adicional que ya tuviera.
create or replace function public.asignar_roles_contenido(p_perfil uuid, p_roles public.rol_usuario[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_contenido public.rol_usuario[];
  v_preservar public.rol_usuario[];
begin
  if auth.uid() is null then raise exception 'No autenticado.' using errcode='42501'; end if;

  -- Autorización: coordinación (a cualquiera) o líder (solo a asignables).
  if public.es_coordinacion() then
    null;
  elsif public.tiene_rol('lider_grupo') then
    if not public.es_perfil_asignable(p_perfil) then
      raise exception 'Un líder solo asigna roles a voluntarios o a sí mismo, no a otros coordinadores o líderes.'
        using errcode='42501';
    end if;
  else
    raise exception 'No tienes permiso para asignar roles.' using errcode='42501';
  end if;

  -- Entrada: solo roles de la cadena de contenido, sin duplicados.
  select coalesce(array_agg(distinct x order by x), '{}'::public.rol_usuario[]) into v_contenido
  from unnest(coalesce(p_roles, '{}'::public.rol_usuario[])) as x
  where public.es_rol_cadena_contenido(x);

  -- Preserva los roles adicionales que NO son de contenido.
  select coalesce(array_agg(x order by x), '{}'::public.rol_usuario[]) into v_preservar
  from unnest((select coalesce(roles_extra, '{}'::public.rol_usuario[]) from public.perfiles where id = p_perfil)) as x
  where not public.es_rol_cadena_contenido(x);

  perform set_config('app.roles_contenido_ok', '1', true);   -- habilita el trigger
  update public.perfiles set roles_extra = v_preservar || v_contenido where id = p_perfil;
  perform set_config('app.roles_contenido_ok', '', true);    -- revoca de inmediato
end; $$;

revoke all on function public.asignar_roles_contenido(uuid, public.rol_usuario[]) from public;
grant execute on function public.asignar_roles_contenido(uuid, public.rol_usuario[]) to authenticated;

-- El trigger permite el cambio de roles_extra si es coordinación O si viene de
-- asignar_roles_contenido (flag de sesión). El resto de reglas queda igual.
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

  -- 1b) roles_extra: solo coordinación, o vía asignar_roles_contenido (flag).
  if (new.roles_extra is distinct from old.roles_extra)
     and not public.es_coordinacion()
     and coalesce(current_setting('app.roles_contenido_ok', true), '') <> '1' then
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
