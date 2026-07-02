-- ============================================================
-- 0055 — Reestructura: grupos como unidad de trabajo y nueva jerarquía
-- ============================================================
-- Cambios del modelo (pedidos por coordinación):
--  · Jerarquía: ADMIN (todo) → LÍDER DE GRUPO (gestiona los miembros de SU
--    grupo, nunca a admins u otros líderes) → COORDINADOR (pertenece a un grupo,
--    SIN poderes de gestión). es_coordinacion() pasa a significar SOLO admin.
--  · Los grupos solo los ven sus miembros (y el admin). Ya NO hay auto-unirse
--    ni solicitudes de acceso: a la gente la agregan admin o el líder.
--  · Las tareas viven dentro de cada grupo: solo las ven sus miembros (y
--    asignado/creador); las crean admin o el líder del grupo.
--  · Flujo de casos acortado: Verificación → Confirmados → ENVIADO A REDACCIÓN
--    (nuevo estado y rol 'envio_redaccion'; sin asignación de casos).
--  · Casos con ADJUNTOS (tabla casos_adjuntos; archivos en el bucket 'adjuntos').
--  · 8 grupos de sistema con 'clave'; la membresía SINCRONIZA roles_extra
--    automáticamente (agregar a "Verificación" da el rol verificador, etc.).
-- Idempotente. Ejecutar tras 0054.
-- ============================================================

alter type public.rol_usuario add value if not exists 'envio_redaccion';
alter type public.estado_caso add value if not exists 'enviado_redaccion';

-- 1) es_coordinacion(): ahora SOLO admin (el coordinador deja de ser mando).
--    Esto recorre en cascada todas las políticas que la usan.
create or replace function public.es_coordinacion()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return public.tiene_rol('admin'); end $$;

-- Crear tareas: admin o líder de grupo (el coordinador ya no).
create or replace function public.puede_crear_tareas()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin return public.tiene_rol('admin') or public.tiene_rol('lider_grupo'); end $$;

-- 2) Grupos de sistema (clave estable para la app).
alter table public.grupos add column if not exists clave text unique;
insert into public.grupos (nombre, area, clave, abierto) values
  ('Gestión de Casos',   'gestion_informacion', 'gestion_casos',     false),
  ('Verificación',       'gestion_informacion', 'verificacion',      false),
  ('Envío a Redacción',  'gestion_informacion', 'envio_redaccion',   false),
  ('Redacción',          'marketing',           'redaccion',         false),
  ('Diseño Gráfico',     'diseno',              'diseno_grafico',    false),
  ('Redes Sociales',     'marketing',           'redes_sociales',    false),
  ('Apoyo Psicosocial',  'salud',               'apoyo_psicosocial', false),
  ('Gestión de Acopio',  'logistica',           'gestion_acopio',    false)
on conflict (clave) do update set nombre = excluded.nombre;

-- ¿Objetivo gestionable por un líder? (nunca admins ni otros líderes)
create or replace function public.es_gestionable_por_lider(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.perfiles pf where pf.id = p and (
      pf.rol::text in ('admin','lider_grupo') or pf.super_admin
      or exists (select 1 from unnest(coalesce(pf.roles_extra,'{}'::public.rol_usuario[])) r
                 where r::text in ('admin','lider_grupo'))
    )
  );
$$;

-- 3) Visibilidad y membresía de grupos: SOLO miembros / líder / admin.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='grupos' loop
    execute format('drop policy if exists %I on public.grupos', p.policyname); end loop;
  for p in select policyname from pg_policies where schemaname='public' and tablename='miembros_grupo' loop
    execute format('drop policy if exists %I on public.miembros_grupo', p.policyname); end loop;
end $$;

create policy "grupos_select" on public.grupos for select to authenticated
  using (public.es_admin() or lider_id = auth.uid() or public.es_miembro_de(id));
create policy "grupos_write" on public.grupos for all to authenticated
  using (public.es_admin() or lider_id = auth.uid())
  with check (public.es_admin() or lider_id = auth.uid());

create policy "miembros_select" on public.miembros_grupo for select to authenticated
  using (public.es_admin() or perfil_id = auth.uid() or public.es_miembro_de(grupo_id)
         or exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()));
-- Alta: admin a cualquiera; el líder de ESE grupo, solo a no-mandos.
create policy "miembros_insert" on public.miembros_grupo for insert to authenticated
  with check (public.es_admin()
    or (exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
        and public.es_gestionable_por_lider(perfil_id)));
-- Baja: admin; el líder de ese grupo (no a mandos); o salirse uno mismo.
create policy "miembros_delete" on public.miembros_grupo for delete to authenticated
  using (public.es_admin() or perfil_id = auth.uid()
    or (exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())
        and public.es_gestionable_por_lider(perfil_id)));

-- Cerrar las solicitudes de acceso (el flujo se elimina de la app).
drop policy if exists "solacc_insert" on public.solicitudes_acceso;

-- 4) Tareas: viven dentro del grupo (solo miembros las ven).
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='tareas' loop
    execute format('drop policy if exists %I on public.tareas', p.policyname); end loop;
end $$;
create policy "tareas_select" on public.tareas for select to authenticated
  using (public.es_admin() or asignado_a = auth.uid() or creado_por = auth.uid()
         or (grupo_id is not null and public.es_miembro_de(grupo_id))
         or (grupo_id is not null and exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())));
create policy "tareas_insert" on public.tareas for insert to authenticated
  with check (public.es_verificado() and creado_por = auth.uid()
    and (public.es_admin()
         or (grupo_id is not null and exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()))));
create policy "tareas_update" on public.tareas for update to authenticated
  using (public.es_admin() or asignado_a = auth.uid() or creado_por = auth.uid()
         or (grupo_id is not null and exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())))
  with check (true);
create policy "tareas_delete" on public.tareas for delete to authenticated
  using (public.es_admin() or creado_por = auth.uid()
         or (grupo_id is not null and exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid())));

-- 5) Casos: lectura por función; sin asignación; nuevo paso "enviado a redacción".
--    Gestión de casos (recopilación) ve SOLO los suyos.
create or replace function public.puede_ver_caso(p_creador uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.tiene_rol('admin') or public.tiene_rol('verificador')
      or public.tiene_rol('envio_redaccion') or p_creador = auth.uid();
end $$;
grant execute on function public.puede_ver_caso(uuid) to authenticated;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='casos' loop
    execute format('drop policy if exists %I on public.casos', p.policyname); end loop;
end $$;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and public.puede_ver_caso(creado_por));
create policy "casos_insert" on public.casos for insert to authenticated
  with check (public.es_verificado() and creado_por = auth.uid()
    and (public.tiene_rol('recopilacion') or public.tiene_rol('verificador') or public.tiene_rol('admin')));
create policy "casos_update" on public.casos for update to authenticated
  using (public.puede_verificar()) with check (public.puede_verificar());
create policy "casos_delete" on public.casos for delete to authenticated
  using (public.es_admin());

-- Paso a "enviado a redacción": SOLO el grupo de envío (o admin), y solo desde confirmado.
create or replace function public.enviar_caso_redaccion(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_caso;
begin
  if not (public.tiene_rol('admin') or public.tiene_rol('envio_redaccion')) then
    raise exception 'Solo el equipo de Envío a Redacción puede hacer esto.' using errcode='42501';
  end if;
  select estado into v_estado from public.casos where id = p_caso;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if v_estado::text <> 'confirmado' then raise exception 'Solo se envían casos confirmados.'; end if;
  update public.casos set estado = 'enviado_redaccion', actualizado_en = now() where id = p_caso;
end $$;
grant execute on function public.enviar_caso_redaccion(uuid) to authenticated;

-- Adjuntos de casos (archivos en el bucket privado 'adjuntos', carpeta casos/<id>).
create table if not exists public.casos_adjuntos (
  id         uuid primary key default gen_random_uuid(),
  caso_id    uuid not null references public.casos (id) on delete cascade,
  url        text not null,           -- ruta en el bucket 'adjuntos'
  nombre     text not null,
  mime       text,
  creado_por uuid references public.perfiles (id) on delete set null,
  creado_en  timestamptz not null default now()
);
create index if not exists idx_casos_adj on public.casos_adjuntos (caso_id);
alter table public.casos_adjuntos enable row level security;
drop policy if exists "cadj_select" on public.casos_adjuntos;
create policy "cadj_select" on public.casos_adjuntos for select to authenticated
  using (exists (select 1 from public.casos c where c.id = caso_id and public.puede_ver_caso(c.creado_por)));
drop policy if exists "cadj_insert" on public.casos_adjuntos;
create policy "cadj_insert" on public.casos_adjuntos for insert to authenticated
  with check (creado_por = auth.uid()
    and exists (select 1 from public.casos c where c.id = caso_id and public.puede_ver_caso(c.creado_por)));
drop policy if exists "cadj_delete" on public.casos_adjuntos;
create policy "cadj_delete" on public.casos_adjuntos for delete to authenticated
  using (creado_por = auth.uid() or public.es_admin());

-- 6) Membresía ↔ roles: agregar a un grupo de sistema otorga su rol; quitar lo revoca.
-- plpgsql (parseo diferido): referencia valores de enum agregados en esta misma migración.
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'     then 'recopilacion'
    when 'verificacion'      then 'verificador'
    when 'envio_redaccion'   then 'envio_redaccion'
    when 'redaccion'         then 'redaccion'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'redes_sociales'    then 'redes_sociales'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'gestion_acopio'    then 'logistica'
    else null end)::public.rol_usuario;
end $$;

create or replace function public.sincronizar_rol_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_clave text; v_rol public.rol_usuario; v_fila record;
begin
  v_fila := coalesce(new, old);
  select clave into v_clave from public.grupos where id = v_fila.grupo_id;
  v_rol := public.rol_de_grupo(v_clave);
  if v_rol is null then return v_fila; end if;
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
  return v_fila;
end $$;
drop trigger if exists trg_sincronizar_rol_grupo on public.miembros_grupo;
create trigger trg_sincronizar_rol_grupo
  after insert or delete on public.miembros_grupo
  for each row execute function public.sincronizar_rol_grupo();
