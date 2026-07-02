-- ============================================================
-- 0057 — Ajustes: observador fuera, Redacción unificada, casos por función
-- ============================================================
-- · Se retira el rol OBSERVADOR (los existentes pasan a voluntario).
-- · El grupo "Envío a Redacción" se FUSIONA con "Redacción": sus miembros son
--   los mismos; el grupo Redacción otorga la función de envío (rol
--   envio_redaccion) y su sección /envio-redaccion.
-- · Crear casos: SOLO Gestión de Casos (recopilación) y admin — Verificación ya no.
-- · Videollamadas: también las programa el COORDINADOR de su grupo.
-- · Se eliminan los grupos obsoletos (los que no son de sistema, sin clave).
-- Idempotente. Ejecutar tras 0056.
-- ============================================================

-- 1) Observador → voluntario (el rol queda deprecado en la app).
update public.perfiles set rol = 'voluntario' where rol::text = 'observador';

-- 2) Redacción unificada: el grupo 'redaccion' otorga la función de envío.
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'     then 'recopilacion'
    when 'verificacion'      then 'verificador'
    when 'redaccion'         then 'envio_redaccion'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'redes_sociales'    then 'redes_sociales'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'gestion_acopio'    then 'logistica'
    else null end)::public.rol_usuario;
end $$;

do $$
declare v_envio uuid; v_red uuid; v_miembros uuid[];
begin
  select id into v_envio from public.grupos where clave = 'envio_redaccion';
  select id into v_red   from public.grupos where clave = 'redaccion';
  if v_envio is not null and v_red is not null then
    select coalesce(array_agg(perfil_id), '{}') into v_miembros
      from public.miembros_grupo where grupo_id = v_envio;
    delete from public.grupos where id = v_envio;  -- (el trigger limpia roles)
    insert into public.miembros_grupo (grupo_id, perfil_id)
      select v_red, m from unnest(v_miembros) m
      on conflict do nothing;                      -- (el trigger otorga envio_redaccion)
  end if;
  -- A los miembros actuales de Redacción, otorgarles la función de envío.
  perform set_config('app.roles_contenido_ok', '1', true);
  update public.perfiles p
    set roles_extra = (select array(select distinct x from unnest(coalesce(p.roles_extra,'{}'::public.rol_usuario[]) || array['envio_redaccion'::public.rol_usuario]) x))
    where p.rol::text <> 'envio_redaccion'
      and exists (select 1 from public.miembros_grupo m where m.grupo_id = v_red and m.perfil_id = p.id);
  perform set_config('app.roles_contenido_ok', '', true);
end $$;

-- 3) Eliminar grupos obsoletos (los que no son de sistema).
delete from public.grupos where clave is null;

-- 4) Crear casos: solo Gestión de Casos (recopilación) o admin.
drop policy if exists "casos_insert" on public.casos;
create policy "casos_insert" on public.casos for insert to authenticated
  with check (public.es_verificado() and creado_por = auth.uid()
    and (public.tiene_rol('recopilacion') or public.tiene_rol('admin')));

-- 5) Videollamadas: publicar en el grupo (admin, líder o coordinador miembro).
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='reuniones' loop
    execute format('drop policy if exists %I on public.reuniones', p.policyname); end loop;
end $$;
create policy "reuniones_select" on public.reuniones for select to authenticated
  using (public.es_admin() or public.es_miembro_de(grupo_id)
         or exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()));
create policy "reuniones_insert" on public.reuniones for insert to authenticated
  with check (creado_por = auth.uid() and public.puede_publicar_en_grupo(grupo_id));
create policy "reuniones_delete" on public.reuniones for delete to authenticated
  using (public.es_admin() or creado_por = auth.uid()
         or exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()));
