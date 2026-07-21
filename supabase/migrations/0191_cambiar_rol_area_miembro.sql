-- ============================================================
-- 0191 — El líder/coordinador de un grupo cambia el ROL DE ÁREA de sus miembros
-- ------------------------------------------------------------
-- Pedido: los líderes y coordinadores necesitan poder pasar a un VOLUNTARIO
-- (miembro sin el rol operativo) al ROL DE SU ÁREA, para que opere. Hasta hoy
-- eso solo lo hacía administración (Admin → Usuarios) o la RPC de contenido.
--
-- Esta migración añade una RPC acotada `cambiar_rol_area_miembro` que otorga o
-- retira ÚNICAMENTE el rol funcional que otorga el grupo (`rol_de_grupo(clave)`)
-- a un miembro del grupo, con estas barreras (la RLS sigue siendo la verdad):
--   · Solo puede llamarla admin general, el LÍDER del grupo o un COORDINADOR del
--     grupo (es_lider_de_grupo / es_coordinador_de_grupo, 0089).
--   · El objetivo debe ser MIEMBRO del grupo y GESTIONABLE (no un admin ni otro
--     mando; salvo que opere un admin general) — `es_gestionable_por_lider`.
--   · Solo toca `roles_extra` (nunca el rol BASE, ni `verificado`, ni super).
--   · NUNCA otorga roles sensibles (psicosocial confidencial, admin, admin de
--     área, aliado): esos conservan su propio flujo. Además el guard
--     `proteger_campos_perfil` sigue siendo un backstop duro para todos ellos.
--
-- Para atravesar la regla 1b del guard (roles_extra solo por coordinación) se
-- recrea `proteger_campos_perfil` TAL CUAL 0140 añadiendo únicamente un flag de
-- bypass `app.rol_area_ok` en la regla 1b (análogo a `app.roles_contenido_ok`).
-- El resto de reglas (2b admin, 2c admin de área, 2d psicosocial, 3 super, 4
-- aliado, 1c area_registro) quedan intactas y siguen bloqueando aunque el flag
-- esté puesto.
--
-- Además la RPC pone `app.sync_en_curso='1'` para que el trigger recíproco
-- `sincronizar_grupo_por_rol` (0059) NO altere la membresía: al QUITAR el rol el
-- miembro NO sale del grupo (queda como voluntario), coherente con 0154.
-- Idempotente. Ejecutar tras 0190.
-- ============================================================

-- ── 1) Guard: 0140 + flag de bypass app.rol_area_ok en la regla 1b ──
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

  -- 1b) roles_extra: solo coordinación, o vía asignar_roles_contenido
  --     (flag app.roles_contenido_ok, 0046), o vía cambiar_rol_area_miembro
  --     (flag app.rol_area_ok: líder/coordinador de un grupo otorga el rol de su
  --     área a un miembro gestionable, 0191). Las reglas 2b/2c/2d/4 de abajo
  --     siguen bloqueando roles sensibles aunque el flag esté puesto.
  if (new.roles_extra is distinct from old.roles_extra)
     and not public.es_coordinacion()
     and coalesce(current_setting('app.roles_contenido_ok', true), '') <> '1'
     and coalesce(current_setting('app.rol_area_ok', true), '') <> '1' then
    raise exception 'No puedes cambiar tus roles.';
  end if;

  -- 1c) area_registro es una señal de ruteo y de ALCANCE del admin de área: solo
  --     coordinación/admin general puede cambiarla (evita que un usuario se
  --     auto-asigne a un área para caer bajo su admin de área). Los admin de área
  --     legítimos operan por service_role (auth.uid() null → bypass arriba). (0140)
  if (new.area_registro is distinct from old.area_registro)
     and not public.es_coordinacion() then
    raise exception 'No puedes cambiar tu área de registro.';
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
  -- general o superadmin (un admin de área o un coordinador no puede). (0103 + 0119 + 0124)
  if (new.rol is distinct from old.rol)
     and (old.rol::text in ('admin_verificacion','admin_redes','admin_logistica','admin_digitalizacion')
          or new.rol::text in ('admin_verificacion','admin_redes','admin_logistica','admin_digitalizacion'))
     and not (public.es_admin() or actor_super) then
    raise exception 'Solo un administrador general puede gestionar el rol de administrador de área.'
      using errcode = '42501';
  end if;
  if (new.roles_extra is distinct from old.roles_extra)
     and exists (select 1 from unnest(
           coalesce(new.roles_extra, '{}'::public.rol_usuario[])
           || coalesce(old.roles_extra, '{}'::public.rol_usuario[])) rr
         where rr::text in ('admin_verificacion','admin_redes','admin_logistica','admin_digitalizacion'))
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

-- ── 2) RPC: otorgar/quitar el rol de área del grupo a un miembro ──
create or replace function public.cambiar_rol_area_miembro(p_grupo uuid, p_perfil uuid, p_otorgar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clave     text;
  v_rol       public.rol_usuario;
  v_base      public.rol_usuario;
  v_roles     public.rol_usuario[];
  -- Roles que NO se otorgan por esta vía: cada uno tiene su propio flujo/blindaje.
  v_sensibles text[] := array['admin','admin_verificacion','admin_redes','admin_logistica',
                              'admin_digitalizacion','coordinador_psicosocial','apoyo_psicosocial',
                              'lider_plataforma_aliada'];
begin
  if auth.uid() is null then raise exception 'No autenticado.' using errcode = '42501'; end if;

  -- Autorización: admin general, o el líder/coordinador de ESE grupo.
  if not (public.es_admin() or public.es_lider_de_grupo(p_grupo) or public.es_coordinador_de_grupo(p_grupo)) then
    raise exception 'Solo administración, el líder o un coordinador del grupo pueden cambiar el rol de un miembro.'
      using errcode = '42501';
  end if;

  -- El objetivo debe ser miembro del grupo.
  if not exists (select 1 from public.miembros_grupo m where m.grupo_id = p_grupo and m.perfil_id = p_perfil) then
    raise exception 'Esa persona no es miembro del grupo.' using errcode = '42501';
  end if;

  -- No tocar a otros mandos (admin, líder, super) salvo que opere un admin general.
  if not public.es_admin() and not public.es_gestionable_por_lider(p_perfil) then
    raise exception 'No puedes cambiar el rol de esa persona.' using errcode = '42501';
  end if;

  -- Rol funcional que otorga el grupo (solo grupos de sistema con rol).
  select clave into v_clave from public.grupos where id = p_grupo;
  v_rol := public.rol_de_grupo(v_clave);
  if v_rol is null then
    raise exception 'Ese grupo no otorga un rol asignable a sus miembros.' using errcode = '42501';
  end if;

  -- Roles sensibles se gestionan por su propio flujo, no desde el grupo.
  if v_rol::text = any(v_sensibles) then
    raise exception 'Ese rol se gestiona por su propio flujo, no desde el grupo.' using errcode = '42501';
  end if;

  -- Nunca se toca el rol BASE (perfiles.rol): solo roles_extra. Si ya lo tiene como
  -- rol base (lo asignó administración), no hay nada que cambiar por esta vía.
  select rol, coalesce(roles_extra, '{}'::public.rol_usuario[]) into v_base, v_roles
    from public.perfiles where id = p_perfil;
  if v_base = v_rol then return; end if;

  if p_otorgar then
    if not (v_rol = any(v_roles)) then v_roles := v_roles || v_rol; end if;
  else
    select coalesce(array_agg(x order by x), '{}'::public.rol_usuario[]) into v_roles
      from unnest(v_roles) x where x <> v_rol;
  end if;

  -- app.sync_en_curso: no cascar membresía (al quitar el rol el miembro NO sale
  -- del grupo, queda como voluntario). app.rol_area_ok: habilita la regla 1b.
  perform set_config('app.sync_en_curso', '1', true);
  perform set_config('app.rol_area_ok', '1', true);
  update public.perfiles set roles_extra = v_roles where id = p_perfil;
  perform set_config('app.rol_area_ok', '', true);
  perform set_config('app.sync_en_curso', '', true);
end; $$;

grant execute on function public.cambiar_rol_area_miembro(uuid, uuid, boolean) to authenticated;
