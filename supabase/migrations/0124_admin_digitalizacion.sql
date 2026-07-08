-- ============================================================
-- 0124 — Administración por ÁREA: Digitalización (cuarta área)
-- ------------------------------------------------------------
-- Hasta ahora «Digitalización» vivía DENTRO del área de Verificaciones: la operaba
-- el admin de Verificaciones (via opera_verificacion en puede_digitalizar) y su grupo
-- lo supervisaba es_admin_verificacion. Se separa en un ÁREA PROPIA con su admin:
--   · admin_digitalizacion → "Administración · Digitalización". Administra el grupo
--     «Digitalización» (clave digitalizacion, rol digitalizador), OPERA la captura de
--     listados y MODERA los lugares del mapa, y supervisa a su gente. Como maneja
--     datos sensibles de víctimas (heridos/fallecidos, NNA), EXIGE 2ª verificación de
--     identidad —igual que Verificaciones, a diferencia de Logística—.
-- El admin general sigue viéndolo/administrándolo todo; el admin de Digitalización NO
-- es admin general. Se replica el patrón de 0103/0119 sobre las FUNCIONES PUERTA
-- (puede_digitalizar, puede_supervisar_grupo) para heredar toda la operación con
-- cambios mínimos, moviendo Digitalización FUERA de Verificaciones.
--
-- Enum-safety: el valor nuevo `admin_digitalizacion` de rol_usuario SOLO se usa por
-- comparación de TEXTO (helpers / plpgsql late-bound / literales text), NUNCA con cast
-- eager en esta misma transacción (mismo patrón que admin_logistica en 0119).
-- Cada función se re-crea sobre su versión VIGENTE (puede_digitalizar 0106,
-- opera_verificacion 0106, puede_supervisar_grupo 0119, handle_new_user/notificar_registro/
-- proteger_campos_perfil 0119, lugares 0082, solicitudes_ayuda_mapa 0112), sumando SOLO
-- la rama de digitalización. Idempotente. Ejecutar tras 0123.
-- ============================================================

-- ── 1) Rol de administración del área Digitalización ──
alter type public.rol_usuario add value if not exists 'admin_digitalizacion';

-- ── 2) Área elegible al registrarse: se suma 'digitalizacion' al CHECK (rebase de 0119) ──
alter table public.perfiles drop constraint if exists perfiles_area_registro_chk;
alter table public.perfiles add constraint perfiles_area_registro_chk
  check (area_registro is null or area_registro in ('verificacion','redes','logistica','digitalizacion','general'));

-- ── 3) Helper del usuario actual (por TEXTO — enum-safe) ──
create or replace function public.es_admin_digitalizacion()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'admin_digitalizacion');
$$;
grant execute on function public.es_admin_digitalizacion() to authenticated;

-- Operación del área (exige 2ª verificación, como opera_verificacion 0106).
create or replace function public.opera_digitalizacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin_digitalizacion() and public.identidad_aprobada();
$$;
grant execute on function public.opera_digitalizacion() to authenticated;

-- ── 4) El alta acepta el área 'digitalizacion' (rebase de handle_new_user 0119) ──
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
    case when (new.raw_user_meta_data ->> 'area_registro') in ('verificacion','redes','logistica','digitalizacion','general')
         then new.raw_user_meta_data ->> 'area_registro' else null end,
    nullif(btrim(new.raw_user_meta_data ->> 'pais'), '')
  );
  return new;
end; $$;

-- ── 5) El aviso de registro llega también al admin de Digitalización (rebase de 0119) ──
create or replace function public.notificar_registro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verificado = false then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'registro_nuevo',
           'Nueva solicitud de acceso',
           coalesce(nullif(new.nombre_completo, ''), 'Alguien') || ' espera verificación'
             || case new.area_registro
                  when 'verificacion'   then ' · Área Verificaciones.'
                  when 'redes'          then ' · Área Redes Sociales.'
                  when 'logistica'      then ' · Área Logística y Acopio.'
                  when 'digitalizacion' then ' · Área Digitalización.'
                  else '.' end,
           '/admin/usuarios'
    from public.perfiles p
    where p.rol = 'admin'
       or p.super_admin
       or 'admin' = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
       or (new.area_registro = 'verificacion'   and public.perfil_tiene_rol(p.id, 'admin_verificacion'))
       or (new.area_registro = 'redes'          and public.perfil_tiene_rol(p.id, 'admin_redes'))
       or (new.area_registro = 'logistica'      and public.perfil_tiene_rol(p.id, 'admin_logistica'))
       or (new.area_registro = 'digitalizacion' and public.perfil_tiene_rol(p.id, 'admin_digitalizacion'));
  end if;
  return new;
end; $$;

-- ── 6) Blindaje: conceder/quitar admin_digitalizacion = solo admin general/super (rebase 0119) ──
-- Se re-crea la función VIGENTE (0119) sumando 'admin_digitalizacion' a las dos listas de
-- la regla 2c (roles de administración de área). El resto queda EXACTAMENTE igual.
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

-- ── 7) Operación: SEPARAR Digitalización de Verificaciones ──
-- puede_digitalizar deja de contar al admin de Verificaciones y cuenta al de
-- Digitalización (con su 2ª verificación). El digitalizador con identidad sigue igual.
-- Esto re-habilita al nuevo área en listados/personas/lugares(select+insert)/bucket,
-- que fluyen todos por puede_digitalizar/puede_ver_listado (0106).
create or replace function public.puede_digitalizar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.opera_digitalizacion()
      or (public.es_digitalizador() and public.identidad_aprobada());
$$;

-- ── 8) Moderación de LUGARES: el admin de Digitalización modera (además del admin) ──
drop policy if exists lugares_update on public.lugares;
create policy lugares_update on public.lugares for update to authenticated
  using (public.es_admin() or public.es_admin_digitalizacion())
  with check (public.es_admin() or public.es_admin_digitalizacion());
drop policy if exists lugares_delete on public.lugares;
create policy lugares_delete on public.lugares for delete to authenticated
  using (public.es_admin() or public.es_admin_digitalizacion());

-- ── 9) Supervisión de grupos: MOVER «digitalizacion» a su propio admin (rebase 0119) ──
create or replace function public.puede_supervisar_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.grupos g where g.id = p_grupo and (
      (public.es_admin_verificacion() and g.clave in
         ('gestion_casos','verificacion','busqueda','busqueda_nna','enlace_contacto'))
      or (public.es_admin_redes() and g.clave in
         ('redaccion','redes_sociales','diseno_grafico','edicion_video','influencers'))
      or (public.es_admin_logistica() and g.clave in ('gestion_acopio'))
      or (public.es_admin_digitalizacion() and g.clave in ('digitalizacion'))
    )
  );
$$;

-- ── 10) Capa del mapa «solicitudes de ayuda»: paridad para el admin de Digitalización (rebase 0112) ──
create or replace function public.solicitudes_ayuda_mapa()
returns table (
  id uuid, titulo text, categoria text,
  lat double precision, lng double precision,
  tipo text, urgencia text, estado text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.titulo, c.categoria, c.lat, c.lng,
         c.req_tipo::text, c.req_urgencia::text, c.estado::text
  from public.casos c
  where c.es_requerimiento
    and c.lat is not null and c.lng is not null
    and c.categoria is distinct from 'Desaparecidos'
    and c.estado::text in ('confirmado', 'enviado_redaccion')
    and (public.es_admin() or public.puede_logistica() or public.tiene_rol('digitalizador')
         or public.es_admin_digitalizacion());
$$;
grant execute on function public.solicitudes_ayuda_mapa() to authenticated;
