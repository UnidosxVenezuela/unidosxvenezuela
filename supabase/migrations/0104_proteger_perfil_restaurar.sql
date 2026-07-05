-- ============================================================
-- 0104 — Restaurar proteger_campos_perfil (regresión de 0103) + admin de área
-- ------------------------------------------------------------
-- La 0103 redefinió proteger_campos_perfil tomando como base una versión ANTIGUA
-- (0043) y, sin querer, revirtió dos endurecimientos posteriores:
--   · 0046 — la excepción por el flag `app.roles_contenido_ok` en la regla 1b (la
--            vía asignar_roles_contenido para la cadena de contenido).
--   · 0075 — la regla que protege los roles del ÁREA PSICOSOCIAL (confidencial):
--            solo superadmin o un coordinador psicosocial puede otorgarlos/retirarlos.
-- Aquí se reconstruye la función con TODA la lógica vigente (0075) MÁS el blindaje de
-- los roles de administración de área que introdujo la 0103 (solo admin general/super
-- concede admin_verificacion / admin_redes). Idempotente. Ejecutar tras 0103.
--
-- Enum-safety: los valores admin_verificacion/admin_redes ya existen (creados y
-- confirmados en 0103), y aquí solo se comparan por TEXTO en un cuerpo plpgsql.
-- ============================================================

create or replace function public.proteger_campos_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_super boolean;
  psico_roles public.rol_usuario[] := array['coordinador_psicosocial','apoyo_psicosocial']::public.rol_usuario[];
  new_psico public.rol_usuario[];
  old_psico public.rol_usuario[];
begin
  if auth.uid() is null then return new; end if;
  actor_super := coalesce((select super_admin from public.perfiles where id = auth.uid()), false);

  -- 1) Nadie cambia su propio rol/verificado salvo coordinación.
  if (new.rol is distinct from old.rol or new.verificado is distinct from old.verificado)
     and not public.es_coordinacion() then
    raise exception 'No puedes cambiar tu rol ni tu estado de verificación.';
  end if;

  -- 1b) roles_extra: solo coordinación, o vía asignar_roles_contenido (flag). (0046)
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

  -- 2c) Conceder/quitar un rol de ADMIN DE ÁREA (rol principal o extra) = solo admin
  -- general o superadmin (un admin de área o un coordinador no puede). (0103)
  if (new.rol is distinct from old.rol)
     and (old.rol::text in ('admin_verificacion','admin_redes')
          or new.rol::text in ('admin_verificacion','admin_redes'))
     and not (public.es_admin() or actor_super) then
    raise exception 'Solo un administrador general puede gestionar el rol de administrador de área.'
      using errcode = '42501';
  end if;
  if (new.roles_extra is distinct from old.roles_extra)
     and exists (select 1 from unnest(
           coalesce(new.roles_extra, '{}'::public.rol_usuario[])
           || coalesce(old.roles_extra, '{}'::public.rol_usuario[])) rr
         where rr::text in ('admin_verificacion','admin_redes'))
     and not (public.es_admin() or actor_super) then
    raise exception 'Solo un administrador general puede gestionar el rol de administrador de área.'
      using errcode = '42501';
  end if;

  -- 2d) Conceder/quitar roles del ÁREA PSICOSOCIAL con acceso confidencial
  --     (coordinador_psicosocial, apoyo_psicosocial) = solo superadmin o un
  --     coordinador psicosocial existente. Ni un admin puede. Cubre `rol` y
  --     `roles_extra` (incluida la vía de unirse al grupo psicosocial). (0075)
  if (new.rol is distinct from old.rol) or (new.roles_extra is distinct from old.roles_extra) then
    select coalesce(array_agg(distinct x order by x), '{}'::public.rol_usuario[]) into old_psico
      from unnest(array[old.rol] || coalesce(old.roles_extra, '{}'::public.rol_usuario[])) x
      where x = any(psico_roles);
    select coalesce(array_agg(distinct x order by x), '{}'::public.rol_usuario[]) into new_psico
      from unnest(array[new.rol] || coalesce(new.roles_extra, '{}'::public.rol_usuario[])) x
      where x = any(psico_roles);
    if new_psico is distinct from old_psico
       and not (actor_super or public.es_coord_psicosocial()) then
      raise exception 'Solo un superadministrador o un coordinador psicosocial puede otorgar o retirar roles del área psicosocial.'
        using errcode = '42501';
    end if;
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
