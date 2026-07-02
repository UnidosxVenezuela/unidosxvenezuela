-- ============================================================
-- 0059 — Consolidación de roles y sincronización rol ↔ grupo
-- ============================================================
-- · 'envio_redaccion' se FUSIONA en 'redaccion' (un solo rol para el grupo
--   Redacción, que maneja la sección Envío a Redacción).
-- · 'diseno_grafico' y 'edicion_video' se UNIFICAN en 'redes_sociales', que
--   pasa a llamarse "Diseño y Redes Sociales" (rol y grupo).
-- · Sincronización BIDIRECCIONAL: asignar un rol funcional agrega al grupo
--   correspondiente; quitarlo lo saca (y la membresía sigue otorgando el rol).
-- · El COORDINADOR PSICOSOCIAL agrega/quita gente de Apoyo Psicosocial en su
--   grupo (autoridad del área bajo admin), nunca a mandos ni a otros coord.
-- Idempotente. Ejecutar tras 0058.
-- ============================================================

-- ── 1) Migrar roles existentes ──
update public.perfiles set rol = 'redaccion' where rol::text = 'envio_redaccion';
update public.perfiles set rol = 'redes_sociales' where rol::text in ('diseno_grafico','edicion_video');
update public.perfiles set roles_extra = (
  select coalesce(array_agg(distinct r2), '{}'::public.rol_usuario[]) from (
    select (case when x::text = 'envio_redaccion' then 'redaccion'
                 when x::text in ('diseno_grafico','edicion_video') then 'redes_sociales'
                 else x::text end)::public.rol_usuario as r2
    from unnest(coalesce(roles_extra, '{}'::public.rol_usuario[])) x
  ) s where r2::text <> rol::text
) where roles_extra is not null and roles_extra <> '{}';

-- ── 2) Grupos: renombrar y fusionar Diseño Gráfico → Diseño y Redes Sociales ──
update public.grupos set nombre = 'Diseño y Redes Sociales' where clave = 'redes_sociales';
do $$
declare v_dis uuid; v_rs uuid; v_miembros uuid[];
begin
  select id into v_dis from public.grupos where clave = 'diseno_grafico';
  select id into v_rs  from public.grupos where clave = 'redes_sociales';
  if v_dis is not null and v_rs is not null then
    select coalesce(array_agg(perfil_id), '{}') into v_miembros from public.miembros_grupo where grupo_id = v_dis;
    delete from public.grupos where id = v_dis;
    insert into public.miembros_grupo (grupo_id, perfil_id)
      select v_rs, m from unnest(v_miembros) m on conflict do nothing;
  end if;
end $$;

-- ── 3) Mapeo grupo→rol actualizado ──
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'     then 'recopilacion'
    when 'verificacion'      then 'verificador'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'gestion_acopio'    then 'logistica'
    else null end)::public.rol_usuario;
end $$;

create or replace function public.clave_de_rol(p_rol public.rol_usuario)
returns text language plpgsql immutable as $$
begin
  return case p_rol::text
    when 'recopilacion'      then 'gestion_casos'
    when 'verificador'       then 'verificacion'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'logistica'         then 'gestion_acopio'
    else null end;
end $$;

-- ── 4) Permisos que usaban 'envio_redaccion' → 'redaccion' ──
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.tiene_rol('admin') or public.tiene_rol('verificador')
    or (public.tiene_rol('redaccion') and estado::text in ('confirmado','enviado_redaccion'))
    or creado_por = auth.uid()));

create or replace function public.enviar_caso_redaccion(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_caso;
begin
  if not (public.tiene_rol('admin') or public.tiene_rol('redaccion')) then
    raise exception 'Solo el equipo de Redacción puede hacer esto.' using errcode='42501';
  end if;
  select estado into v_estado from public.casos where id = p_caso;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if v_estado::text <> 'confirmado' then raise exception 'Solo se envían casos confirmados.'; end if;
  update public.casos set estado = 'enviado_redaccion', actualizado_en = now() where id = p_caso;
end $$;

drop policy if exists "adjuntos_casos" on storage.objects;
create policy "adjuntos_casos" on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.tiene_rol('redaccion') or public.tiene_rol('recopilacion')))
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.tiene_rol('recopilacion')));

create or replace function public.puede_pipeline()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.es_verificado() and (public.tiene_rol('admin')
    or public.tiene_rol('redaccion') or public.tiene_rol('redes_sociales'));
end $$;

-- ── 5) Sincronización rol → grupo (bidireccional, con guarda anti-recursión) ──
create or replace function public.sincronizar_rol_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_clave text; v_rol public.rol_usuario; v_fila record;
begin
  if coalesce(current_setting('app.sync_en_curso', true), '') = '1' then
    return coalesce(new, old);
  end if;
  v_fila := coalesce(new, old);
  select clave into v_clave from public.grupos where id = v_fila.grupo_id;
  v_rol := public.rol_de_grupo(v_clave);
  if v_rol is null then return v_fila; end if;
  perform set_config('app.sync_en_curso', '1', true);
  perform set_config('app.roles_contenido_ok', '1', true);
  if tg_op = 'INSERT' then
    update public.perfiles
      set roles_extra = (select array(select distinct x from unnest(coalesce(roles_extra,'{}'::public.rol_usuario[]) || array[v_rol]) x))
      where id = v_fila.perfil_id and rol <> v_rol;
  else
    update public.perfiles
      set roles_extra = (select coalesce(array(select x from unnest(coalesce(roles_extra,'{}'::public.rol_usuario[])) x where x <> v_rol), '{}'::public.rol_usuario[]))
      where id = v_fila.perfil_id;
  end if;
  perform set_config('app.roles_contenido_ok', '', true);
  perform set_config('app.sync_en_curso', '', true);
  return v_fila;
end $$;

-- Al cambiar rol/roles_extra en perfiles, ajustar las membresías de grupos.
create or replace function public.sincronizar_grupo_por_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_usuario; v_clave text; v_gid uuid;
  v_antes public.rol_usuario[]; v_ahora public.rol_usuario[];
begin
  if coalesce(current_setting('app.sync_en_curso', true), '') = '1' then return new; end if;
  v_antes := array[old.rol] || coalesce(old.roles_extra, '{}'::public.rol_usuario[]);
  v_ahora := array[new.rol] || coalesce(new.roles_extra, '{}'::public.rol_usuario[]);
  perform set_config('app.sync_en_curso', '1', true);
  -- Roles ganados → agregar al grupo correspondiente.
  foreach v_rol in array v_ahora loop
    if not (v_rol = any(v_antes)) then
      v_clave := public.clave_de_rol(v_rol);
      if v_clave is not null then
        select id into v_gid from public.grupos where clave = v_clave;
        if v_gid is not null then
          insert into public.miembros_grupo (grupo_id, perfil_id) values (v_gid, new.id) on conflict do nothing;
        end if;
      end if;
    end if;
  end loop;
  -- Roles perdidos → salir del grupo correspondiente.
  foreach v_rol in array v_antes loop
    if not (v_rol = any(v_ahora)) then
      v_clave := public.clave_de_rol(v_rol);
      if v_clave is not null then
        delete from public.miembros_grupo m using public.grupos g
          where g.clave = v_clave and m.grupo_id = g.id and m.perfil_id = new.id;
      end if;
    end if;
  end loop;
  perform set_config('app.sync_en_curso', '', true);
  return new;
end $$;
drop trigger if exists trg_sincronizar_grupo_por_rol on public.perfiles;
create trigger trg_sincronizar_grupo_por_rol
  after update of rol, roles_extra on public.perfiles
  for each row execute function public.sincronizar_grupo_por_rol();

-- ── 6) Coordinador Psicosocial gestiona la membresía de SU grupo ──
create or replace function public.gestionable_por_coord_psico(g uuid, p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_coord_psicosocial()
     and exists (select 1 from public.grupos gr where gr.id = g and gr.clave = 'apoyo_psicosocial')
     and public.es_gestionable_por_lider(p)
     and not exists (select 1 from public.perfiles pf where pf.id = p and (
           pf.rol::text = 'coordinador_psicosocial'
           or exists (select 1 from unnest(coalesce(pf.roles_extra,'{}'::public.rol_usuario[])) r
                      where r::text = 'coordinador_psicosocial')));
$$;

drop policy if exists "miembros_insert" on public.miembros_grupo;
create policy "miembros_insert" on public.miembros_grupo for insert to authenticated
  with check (public.es_admin()
    or (exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
        and public.es_gestionable_por_lider(perfil_id))
    or public.gestionable_por_coord_psico(grupo_id, perfil_id));
drop policy if exists "miembros_delete" on public.miembros_grupo;
create policy "miembros_delete" on public.miembros_grupo for delete to authenticated
  using (public.es_admin() or perfil_id = auth.uid()
    or (exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
        and public.es_gestionable_por_lider(perfil_id))
    or public.gestionable_por_coord_psico(grupo_id, perfil_id));
