-- ============================================================
-- 0103 — Administración por ÁREA (Verificaciones / Redes Sociales)
-- ------------------------------------------------------------
-- Fase 1 (fundación): el modelo de datos, el registro con selección de área y el
-- ruteo de las solicitudes a la administración que corresponde. Los PODERES del
-- panel acotado por área llegan en la Fase 2 (esta migración no cambia el acceso
-- de nadie a ningún módulo; solo prepara el terreno de forma segura).
--
-- Se crean DOS roles de administración de área:
--   · admin_verificacion → "Administración · Verificaciones"  (grupos de gestión de
--     información: gestión de casos, verificación, búsqueda, búsqueda NNA, enlace de
--     contacto y digitalización).
--   · admin_redes        → "Administración · Redes Sociales"  (grupos de contenido:
--     redacción/envío, diseño gráfico, edición de video, community manager, influencers).
-- El admin ACTUAL sigue siendo el "admin general" (ve y administra todo) y el dueño
-- sigue como superadmin. Un admin de área NO es `es_admin()`: no obtiene ningún poder
-- de base de datos por serlo (lo suyo se acota en la app, Fase 2).
--
-- Enum-safety: los valores nuevos `admin_verificacion` / `admin_redes` de `rol_usuario`
-- SOLO se usan por comparación de TEXTO (helpers) o en cuerpos plpgsql (late-bound),
-- NUNCA con cast eager en un CREATE POLICY/DML de esta misma transacción (mismo patrón
-- que 'enlace_contacto'/'buscador_nna' en 0090/0093). Idempotente. Ejecutar tras 0102.
-- ============================================================

-- ── 1) Roles de administración de área ──
alter type public.rol_usuario add value if not exists 'admin_verificacion';
alter type public.rol_usuario add value if not exists 'admin_redes';

-- ── 2) Área a la que la persona postula al registrarse ──
-- Texto simple ('verificacion' | 'redes' | 'general'); lo escribe el trigger de alta
-- desde el metadato del registro. Se valida en la app; el CHECK evita basura.
alter table public.perfiles add column if not exists area_registro text;
do $$ begin
  alter table public.perfiles add constraint perfiles_area_registro_chk
    check (area_registro is null or area_registro in ('verificacion','redes','general'));
exception when duplicate_object then null; end $$;

-- ── 3) ¿Un PERFIL (por id) tiene este rol? (por TEXTO — enum-safe) ──
-- Análogo a tiene_rol() pero para un perfil arbitrario (lo usa el ruteo de avisos y,
-- en la Fase 2, el acotado del panel). SECURITY DEFINER: solo lee rol/roles_extra.
create or replace function public.perfil_tiene_rol(p_id uuid, p_rol text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = p_id
      and (p.rol::text = p_rol
           or exists (select 1 from unnest(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) rr
                      where rr::text = p_rol))
  );
$$;
grant execute on function public.perfil_tiene_rol(uuid, text) to authenticated;

-- ── 4) Helpers del usuario actual (por TEXTO — enum-safe) ──
create or replace function public.es_admin_verificacion()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'admin_verificacion');
$$;
grant execute on function public.es_admin_verificacion() to authenticated;

create or replace function public.es_admin_redes()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'admin_redes');
$$;
grant execute on function public.es_admin_redes() to authenticated;

-- ── 5) El alta guarda el área elegida en el registro ──
-- Conserva EXACTAMENTE el comportamiento previo (0018) y solo suma area_registro
-- desde el metadato del signUp. Si el metadato no es un valor válido, queda NULL.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo, telefono, organizacion, motivo, area_registro)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'telefono', new.phone),
    new.raw_user_meta_data ->> 'organizacion',
    new.raw_user_meta_data ->> 'motivo',
    case when (new.raw_user_meta_data ->> 'area_registro') in ('verificacion','redes','general')
         then new.raw_user_meta_data ->> 'area_registro' else null end
  );
  return new;
end; $$;

-- ── 6) La solicitud de registro llega a la administración correspondiente ──
-- Regla: SIEMPRE avisa a los admin generales + superadmin (nada se pierde). Además,
-- si el registro indica un área, avisa también a la administración de esa área. El
-- cuerpo del aviso nombra el área para que se atienda por la vía correcta.
create or replace function public.notificar_registro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verificado = false then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'registro_nuevo',
           'Nueva solicitud de acceso',
           coalesce(nullif(new.nombre_completo, ''), 'Alguien') || ' espera verificación'
             || case new.area_registro
                  when 'verificacion' then ' · Área Verificaciones.'
                  when 'redes'        then ' · Área Redes Sociales.'
                  else '.' end,
           '/admin/usuarios'
    from public.perfiles p
    where p.rol = 'admin'
       or p.super_admin
       or 'admin' = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
       or (new.area_registro = 'verificacion' and public.perfil_tiene_rol(p.id, 'admin_verificacion'))
       or (new.area_registro = 'redes'        and public.perfil_tiene_rol(p.id, 'admin_redes'));
  end if;
  return new;
end; $$;

-- ── 7) Blindaje: conceder/quitar un rol de admin de área = solo admin general/super ──
-- Un admin de área NO puede acuñar más admins de área (ni de su área ni de otra), y un
-- coordinador tampoco. Se exige `es_admin()` (admin general) o superadmin, igual que la
-- regla que ya protege 'admin'. plpgsql late-bound → comparar por TEXTO es enum-safe.
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

  -- 2c) Conceder/quitar un rol de ADMIN DE ÁREA (rol principal o extra) = solo admin
  -- general o superadmin (un admin de área o un coordinador no puede).
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
