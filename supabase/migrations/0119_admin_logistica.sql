-- ============================================================
-- 0119 — Administración por ÁREA: Logística y Acopio (tercera área)
-- ------------------------------------------------------------
-- Suma una TERCERA administración de área (junto a Verificaciones y Redes, 0103):
--   · admin_logistica → "Administración · Logística y Acopio". Administra el grupo
--     «Gestión de Acopio» (clave gestion_acopio, rol logistica) y OPERA todos los
--     centros de acopio y los insumos/solicitudes de logística, además de ver la capa
--     del mapa. A diferencia de Verificaciones, NO exige 2ª verificación (identidad):
--     el acopio/logística no maneja datos confidenciales de víctimas.
-- El admin general sigue viéndolo/administrándolo todo; el admin de Logística NO es
-- admin general. En vez de crear políticas nuevas, se replica el patrón 0106/0110
-- sobre las FUNCIONES PUERTA de logística/acopio (puede_logistica, es_lider_acopio,
-- puede_gestionar_acopio) para que el área herede toda la operación con cambios mínimos.
--
-- Enum-safety: el valor nuevo `admin_logistica` de rol_usuario SOLO se usa por
-- comparación de TEXTO (helpers / plpgsql late-bound), NUNCA con cast eager en esta
-- misma transacción (mismo patrón que admin_verificacion/admin_redes en 0103).
-- Cada función se re-crea sobre su versión VIGENTE (handle_new_user 0108,
-- notificar_registro 0103, proteger_campos_perfil 0104, puede_logistica 0058,
-- es_lider_acopio/puede_gestionar_acopio 0070, puede_supervisar_grupo 0110), sumando
-- SOLO la rama de logística. Idempotente. Ejecutar tras 0118.
-- ============================================================

-- ── 1) Rol de administración del área Logística y Acopio ──
alter type public.rol_usuario add value if not exists 'admin_logistica';

-- ── 2) Área elegible al registrarse: se suma 'logistica' al CHECK (rebase de 0103) ──
alter table public.perfiles drop constraint if exists perfiles_area_registro_chk;
alter table public.perfiles add constraint perfiles_area_registro_chk
  check (area_registro is null or area_registro in ('verificacion','redes','logistica','general'));

-- ── 3) Helper del usuario actual (por TEXTO — enum-safe) ──
create or replace function public.es_admin_logistica()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'admin_logistica');
$$;
grant execute on function public.es_admin_logistica() to authenticated;

-- ── 4) El alta acepta el área 'logistica' (rebase de handle_new_user 0108) ──
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo, telefono, organizacion, motivo, area_registro, pais)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce(new.raw_user_meta_data ->> 'telefono', new.phone),
    new.raw_user_meta_data ->> 'organizacion',
    new.raw_user_meta_data ->> 'motivo',
    case when (new.raw_user_meta_data ->> 'area_registro') in ('verificacion','redes','logistica','general')
         then new.raw_user_meta_data ->> 'area_registro' else null end,
    nullif(btrim(new.raw_user_meta_data ->> 'pais'), '')
  );
  return new;
end; $$;

-- ── 5) El aviso de registro llega también al admin de Logística (rebase de 0103) ──
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
                  when 'logistica'    then ' · Área Logística y Acopio.'
                  else '.' end,
           '/admin/usuarios'
    from public.perfiles p
    where p.rol = 'admin'
       or p.super_admin
       or 'admin' = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
       or (new.area_registro = 'verificacion' and public.perfil_tiene_rol(p.id, 'admin_verificacion'))
       or (new.area_registro = 'redes'        and public.perfil_tiene_rol(p.id, 'admin_redes'))
       or (new.area_registro = 'logistica'    and public.perfil_tiene_rol(p.id, 'admin_logistica'));
  end if;
  return new;
end; $$;

-- ── 6) Blindaje: conceder/quitar admin_logistica = solo admin general/super (rebase 0104) ──
-- Se re-crea la función VIGENTE (0104) sumando 'admin_logistica' a las dos listas de la
-- regla 2c (roles de administración de área). El resto queda EXACTAMENTE igual.
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
  -- general o superadmin (un admin de área o un coordinador no puede). (0103 + 0119)
  if (new.rol is distinct from old.rol)
     and (old.rol::text in ('admin_verificacion','admin_redes','admin_logistica')
          or new.rol::text in ('admin_verificacion','admin_redes','admin_logistica'))
     and not (public.es_admin() or actor_super) then
    raise exception 'Solo un administrador general puede gestionar el rol de administrador de área.'
      using errcode = '42501';
  end if;
  if (new.roles_extra is distinct from old.roles_extra)
     and exists (select 1 from unnest(
           coalesce(new.roles_extra, '{}'::public.rol_usuario[])
           || coalesce(old.roles_extra, '{}'::public.rol_usuario[])) rr
         where rr::text in ('admin_verificacion','admin_redes','admin_logistica'))
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

-- ── 7) Operación: el admin de Logística cuenta como logística en las puertas ──
-- Insumos / solicitudes de logística (base puede_logistica 0058).
create or replace function public.puede_logistica()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return public.tiene_rol('admin') or public.tiene_rol('logistica') or public.es_admin_logistica(); end $$;

-- Acceso a la sección de acopio (base es_lider_acopio 0070).
create or replace function public.es_lider_acopio()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.tiene_rol('logistica') or public.es_admin_logistica()
     or exists (select 1 from public.puntos_acopio where creado_por = auth.uid())
     or exists (select 1 from public.acopio_responsables where perfil_id = auth.uid());
$$;

-- Gestión (operar) de CUALQUIER centro (base puede_gestionar_acopio 0070). El admin de
-- Logística opera todos los centros, como el admin general; los demás siguen acotados a
-- los suyos (creador/responsable).
create or replace function public.puede_gestionar_acopio(p_punto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.es_admin_logistica()
     or exists (select 1 from public.puntos_acopio pa
                 where pa.id = p_punto and pa.creado_por = auth.uid())
     or exists (select 1 from public.acopio_responsables ar
                 where ar.punto_id = p_punto and ar.perfil_id = auth.uid());
$$;

-- ── 8) Supervisión de grupos: el admin de Logística supervisa «Gestión de Acopio» (rebase 0110) ──
create or replace function public.puede_supervisar_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.grupos g where g.id = p_grupo and (
      (public.es_admin_verificacion() and g.clave in
         ('gestion_casos','verificacion','busqueda','busqueda_nna','enlace_contacto','digitalizacion'))
      or (public.es_admin_redes() and g.clave in
         ('redaccion','redes_sociales','diseno_grafico','edicion_video','influencers'))
      or (public.es_admin_logistica() and g.clave in ('gestion_acopio'))
    )
  );
$$;
