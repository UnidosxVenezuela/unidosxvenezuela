-- ============================================================
-- 0058 — Correcciones de la revisión de código (seguridad y consistencia)
-- ============================================================
-- 1) Storage 'adjuntos': políticas viejas (0015, cast ::uuid) rompían las rutas
--    casos/… y la política 0053 dejaba el bucket abierto a cualquier autenticado.
--    Se limpian TODAS y se recrean: verificados; la carpeta casos/ solo para
--    los roles del flujo de casos.
-- 2) grupos: crear solo ADMIN (0055 dejó un hueco por el que cualquiera se
--    autonombraba líder); actualizar admin o líder; borrar solo admin.
-- 3) casos: el coordinador ya no verifica (puede_verificar sin 'coordinador');
--    lo enviado a Redacción queda inmutable salvo admin; envio_redaccion solo
--    lee confirmados/enviados; logística y pipeline también sin coordinador.
-- 4) tareas_update con WITH CHECK real (no true).
-- 5) Al ELIMINAR un grupo de sistema, revocar el rol sincronizado de sus
--    miembros (el trigger de miembros no ve la clave tras el CASCADE).
-- Idempotente. Ejecutar tras 0057.
-- ============================================================

-- ── 1) Storage: limpiar y recrear políticas de los 4 buckets ──
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    execute format('drop policy if exists %I on storage.objects', p.policyname); end loop;
end $$;

-- avatares (público): lectura pública; cada quien escribe SOLO su carpeta.
create policy "avatares_select" on storage.objects for select using (bucket_id = 'avatares');
create policy "avatares_write" on storage.objects for all to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- contenido (público): lectura pública; escritura de verificados.
create policy "contenido_select" on storage.objects for select using (bucket_id = 'contenido');
create policy "contenido_write" on storage.objects for all to authenticated
  using (bucket_id = 'contenido' and public.es_verificado())
  with check (bucket_id = 'contenido' and public.es_verificado());

-- grupos (privado): solo verificados.
create policy "grupos_storage" on storage.objects for all to authenticated
  using (bucket_id = 'grupos' and public.es_verificado())
  with check (bucket_id = 'grupos' and public.es_verificado());

-- adjuntos (privado): verificados, PERO la carpeta casos/ solo el flujo de casos.
create policy "adjuntos_tareas" on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and public.es_verificado()
         and (storage.foldername(name))[1] <> 'casos')
  with check (bucket_id = 'adjuntos' and public.es_verificado()
         and (storage.foldername(name))[1] <> 'casos');
create policy "adjuntos_casos" on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.tiene_rol('envio_redaccion') or public.tiene_rol('recopilacion')))
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.tiene_rol('recopilacion')));

-- ── 2) Grupos: crear solo admin; actualizar admin/líder; borrar solo admin ──
drop policy if exists "grupos_write" on public.grupos;
create policy "grupos_insert" on public.grupos for insert to authenticated
  with check (public.es_admin());
create policy "grupos_update" on public.grupos for update to authenticated
  using (public.es_admin() or lider_id = auth.uid())
  with check (public.es_admin() or lider_id = auth.uid());
create policy "grupos_delete" on public.grupos for delete to authenticated
  using (public.es_admin());

-- ── 3) Funciones de permiso sin 'coordinador' + reglas de casos ──
create or replace function public.puede_verificar()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return public.es_verificado() and (public.tiene_rol('admin') or public.tiene_rol('verificador')); end $$;

create or replace function public.puede_ver_casos()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return public.es_verificado() and (public.tiene_rol('admin') or public.tiene_rol('verificador') or public.tiene_rol('recopilacion')); end $$;

create or replace function public.puede_logistica()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return public.tiene_rol('admin') or public.tiene_rol('logistica'); end $$;

create or replace function public.puede_pipeline()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.es_verificado() and (public.tiene_rol('admin')
    or public.tiene_rol('redaccion') or public.tiene_rol('diseno_grafico')
    or public.tiene_rol('edicion_video') or public.tiene_rol('redes_sociales'));
end $$;

-- Lectura de casos: envio_redaccion SOLO confirmados/enviados; recopilación los suyos.
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.tiene_rol('admin') or public.tiene_rol('verificador')
    or (public.tiene_rol('envio_redaccion') and estado::text in ('confirmado','enviado_redaccion'))
    or creado_por = auth.uid()));

-- Actualizar casos: admin/verificador; lo ENVIADO queda inmutable salvo admin y
-- nadie pone 'enviado_redaccion' a mano (eso es del RPC enviar_caso_redaccion).
drop policy if exists "casos_update" on public.casos;
create policy "casos_update" on public.casos for update to authenticated
  using (public.puede_verificar() and (estado::text <> 'enviado_redaccion' or public.es_admin()))
  with check (public.puede_verificar() and (estado::text <> 'enviado_redaccion' or public.es_admin()));

-- ── 4) tareas_update: WITH CHECK real (la fila resultante sigue autorizada) ──
drop policy if exists "tareas_update" on public.tareas;
create policy "tareas_update" on public.tareas for update to authenticated
  using (public.es_admin() or asignado_a = auth.uid() or creado_por = auth.uid()
         or (grupo_id is not null and exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())))
  with check (public.es_admin() or asignado_a = auth.uid() or creado_por = auth.uid()
         or (grupo_id is not null and exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())));

-- ── 5) Al eliminar un grupo de sistema, revocar el rol de sus miembros ──
create or replace function public.revocar_roles_al_borrar_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_usuario;
begin
  v_rol := public.rol_de_grupo(old.clave);
  if v_rol is not null then
    perform set_config('app.roles_contenido_ok', '1', true);
    update public.perfiles p
      set roles_extra = (select coalesce(array(select x from unnest(coalesce(p.roles_extra,'{}'::public.rol_usuario[])) x where x <> v_rol), '{}'::public.rol_usuario[]))
      where exists (select 1 from public.miembros_grupo m where m.grupo_id = old.id and m.perfil_id = p.id);
    perform set_config('app.roles_contenido_ok', '', true);
  end if;
  return old;
end $$;
drop trigger if exists trg_revocar_roles_grupo on public.grupos;
create trigger trg_revocar_roles_grupo
  before delete on public.grupos
  for each row execute function public.revocar_roles_al_borrar_grupo();
