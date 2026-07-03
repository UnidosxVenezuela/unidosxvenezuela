-- ============================================================
-- 0075 — Auditoría: blindaje de Storage, confidencialidad psicosocial
--        y tablón restringido a administración
-- ============================================================
-- Surge de la auditoría de seguridad. IDEMPOTENTE. Tres bloques independientes:
--   1) Storage — cerrar los buckets privados (grupos/adjuntos) por membresía o
--      visibilidad de la tarea, y evitar sobre-escritura/borrado ajeno en los
--      buckets públicos-de-lectura (contenido). Regresión introducida en 0058.
--   2) Psicosocial — otorgar los roles que dan acceso a los casos/bitácora
--      confidenciales (coordinador_psicosocial, apoyo_psicosocial) queda
--      reservado al dueño (superadmin) o a un coordinador psicosocial existente;
--      ni siquiera un admin puede auto-asignárselos (ni por rol, ni por
--      roles_extra, ni uniéndose al grupo psicosocial).
--   3) Tablón — lectura y escritura solo para administración (coincide con la UI,
--      que ya redirige a los no-admin).
-- ============================================================

-- ------------------------------------------------------------
-- Helper: uuid seguro desde el primer segmento de la ruta de un objeto.
-- Devuelve null si no tiene forma de uuid (evita que un cast inválido aborte la
-- consulta). Las funciones es_miembro_de(null)/puede_ver_tarea(null) dan false.
-- ------------------------------------------------------------
create or replace function public.carpeta_uuid(p text)
returns uuid language sql immutable as $$
  select case
    when p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then p::uuid else null end;
$$;

-- ============================================================
-- 1) STORAGE — buckets privados por membresía/tarea; integridad en públicos
-- ============================================================

-- ---- grupos (privado): ruta = <grupo_id>/<archivo> ----
-- Lectura y alta: coordinación o miembro del grupo. Modificar/borrar: quien lo
-- subió (owner) o coordinación (moderación).
drop policy if exists "grupos_storage" on storage.objects;
drop policy if exists "grupos_all"     on storage.objects;
drop policy if exists "grupos_select"  on storage.objects;
drop policy if exists "grupos_insert"  on storage.objects;
drop policy if exists "grupos_update"  on storage.objects;
drop policy if exists "grupos_delete"  on storage.objects;

create policy "grupos_select" on storage.objects for select to authenticated
  using ( bucket_id = 'grupos' and (
    public.es_coordinacion()
    or public.es_miembro_de(public.carpeta_uuid((storage.foldername(name))[1]))
  ));
create policy "grupos_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'grupos' and public.es_verificado() and (
    public.es_coordinacion()
    or public.es_miembro_de(public.carpeta_uuid((storage.foldername(name))[1]))
  ));
create policy "grupos_update" on storage.objects for update to authenticated
  using      ( bucket_id = 'grupos' and (public.es_coordinacion() or owner = auth.uid()) )
  with check ( bucket_id = 'grupos' and (public.es_coordinacion() or owner = auth.uid()) );
create policy "grupos_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'grupos' and (public.es_coordinacion() or owner = auth.uid()) );

-- ---- adjuntos (privado): tareas <tarea_id>/… ; casos casos/<caso_id>/… ----
drop policy if exists "adjuntos_tareas"        on storage.objects;
drop policy if exists "adjuntos_all"           on storage.objects;
drop policy if exists "adjuntos_casos"         on storage.objects;
drop policy if exists "adjuntos_tareas_select" on storage.objects;
drop policy if exists "adjuntos_tareas_insert" on storage.objects;
drop policy if exists "adjuntos_tareas_update" on storage.objects;
drop policy if exists "adjuntos_tareas_delete" on storage.objects;

-- Tareas: la carpeta es el id de la tarea → visibilidad real de la tarea.
create policy "adjuntos_tareas_select" on storage.objects for select to authenticated
  using ( bucket_id = 'adjuntos' and (storage.foldername(name))[1] <> 'casos'
          and public.puede_ver_tarea(public.carpeta_uuid((storage.foldername(name))[1])) );
create policy "adjuntos_tareas_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'adjuntos' and (storage.foldername(name))[1] <> 'casos'
          and public.es_verificado()
          and public.puede_ver_tarea(public.carpeta_uuid((storage.foldername(name))[1])) );
create policy "adjuntos_tareas_update" on storage.objects for update to authenticated
  using      ( bucket_id = 'adjuntos' and (storage.foldername(name))[1] <> 'casos'
          and (public.es_coordinacion() or owner = auth.uid()) )
  with check ( bucket_id = 'adjuntos' and (storage.foldername(name))[1] <> 'casos'
          and (public.es_coordinacion() or owner = auth.uid()) );
create policy "adjuntos_tareas_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'adjuntos' and (storage.foldername(name))[1] <> 'casos'
          and (public.es_coordinacion() or owner = auth.uid()) );

-- Casos: solo el flujo de casos (roles vigentes tras la fusión envio_redaccion→redaccion).
create policy "adjuntos_casos" on storage.objects for all to authenticated
  using ( bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
          and ( public.tiene_rol('admin') or public.tiene_rol('verificador')
             or public.tiene_rol('recopilacion') or public.tiene_rol('redaccion') ) )
  with check ( bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
          and ( public.tiene_rol('admin') or public.tiene_rol('verificador')
             or public.tiene_rol('recopilacion') ) );

-- ---- contenido (público de lectura): integridad de escritura ----
-- La lectura pública se mantiene (contenido_select). Solo evitamos que un
-- verificado sobreescriba/borre piezas ajenas: modificar/borrar = owner o coord.
drop policy if exists "contenido_write"  on storage.objects;
drop policy if exists "contenido_insert" on storage.objects;
drop policy if exists "contenido_update" on storage.objects;
drop policy if exists "contenido_delete" on storage.objects;

create policy "contenido_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'contenido' and public.es_verificado() );
create policy "contenido_update" on storage.objects for update to authenticated
  using      ( bucket_id = 'contenido' and (public.es_coordinacion() or owner = auth.uid()) )
  with check ( bucket_id = 'contenido' and (public.es_coordinacion() or owner = auth.uid()) );
create policy "contenido_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'contenido' and (public.es_coordinacion() or owner = auth.uid()) );

-- ============================================================
-- 2) PSICOSOCIAL — blindar el otorgamiento de roles con acceso confidencial
-- ============================================================
-- Reemplaza proteger_campos_perfil AÑADIENDO la regla 2c. Un cambio en el
-- conjunto de roles psicosociales (en `rol` o en `roles_extra`) exige superadmin
-- o coordinador psicosocial existente. Como el trigger de sincronización
-- grupo→rol escribe roles_extra y pasa por aquí, también cubre "unirse al grupo
-- psicosocial". El resto de reglas queda idéntico a 0046.
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

  -- 2c) Conceder/quitar roles del ÁREA PSICOSOCIAL con acceso confidencial
  --     (coordinador_psicosocial, apoyo_psicosocial) = solo superadmin o un
  --     coordinador psicosocial existente. Ni un admin puede (regla: el admin ve
  --     agregados, no el contenido). Cubre `rol` y `roles_extra`, y por lo tanto
  --     también la vía de unirse al grupo psicosocial (el trigger de sync escribe
  --     roles_extra y pasa por aquí; no lo exime el flag app.roles_contenido_ok).
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

-- ============================================================
-- 3) TABLÓN — lectura y escritura solo para administración
-- ============================================================
-- La UI ya trata el tablón como solo-admin (la página redirige a los no-admin y
-- el menú solo lo muestra a admin). Alineamos los datos: es_coordinacion() = admin.
drop policy if exists "pub_lectura"                on public.publicaciones;
create policy "pub_lectura" on public.publicaciones for select to authenticated
  using ( public.es_coordinacion() );

drop policy if exists "pub_insert"                 on public.publicaciones;
create policy "pub_insert" on public.publicaciones for insert to authenticated
  with check ( autor_id = auth.uid() and public.es_coordinacion() );

drop policy if exists "pub_update_propia_o_coord"  on public.publicaciones;
create policy "pub_update_propia_o_coord" on public.publicaciones for update to authenticated
  using ( public.es_coordinacion() );

drop policy if exists "pub_delete_propia_o_coord"  on public.publicaciones;
create policy "pub_delete_propia_o_coord" on public.publicaciones for delete to authenticated
  using ( public.es_coordinacion() );

drop policy if exists "compub_lectura"             on public.comentarios_publicacion;
create policy "compub_lectura" on public.comentarios_publicacion for select to authenticated
  using ( public.es_coordinacion() );

drop policy if exists "compub_insert"              on public.comentarios_publicacion;
create policy "compub_insert" on public.comentarios_publicacion for insert to authenticated
  with check ( autor_id = auth.uid() and public.es_coordinacion() );

-- El tablón es interno de administración: la notificación de "nueva publicación"
-- pasa a avisar a los OTROS administradores (los miembros de grupo ya no leen el
-- tablón, así que no tiene sentido notificarles).
create or replace function public.notificar_publicacion_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'tablon', 'Nueva publicación en el tablón',
         left(new.contenido, 140), '/tablon'
  from public.perfiles p
  where p.id <> new.autor_id
    and ( p.rol = 'admin'
       or 'admin' = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) );
  return new;
end; $$;
