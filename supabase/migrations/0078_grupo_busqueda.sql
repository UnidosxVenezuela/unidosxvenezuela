-- ============================================================
-- 0078 — Grupo de Búsqueda (desaparecidos) + 2ª verificación obligatoria
-- ------------------------------------------------------------
-- · Nuevo rol 'busqueda' y grupo de sistema "Grupo de Búsqueda" (clave
--   'busqueda'). Ser miembro del grupo otorga el rol (trigger de sincronización
--   existente), así que líderes/coordinadores del grupo también quedan cubiertos.
--
-- · FRONTERA POR CATEGORÍA (dura, vía RLS):
--     - 'verificador' (grupo Verificación)  → SOLO casos que NO son Desaparecidos.
--     - 'busqueda'    (Grupo de Búsqueda)    → SOLO casos de Desaparecidos.
--   Admin ve todo; el creador ve lo suyo.
--
-- · 2ª VERIFICACIÓN OBLIGATORIA (identidad aprobada) para operar con casos:
--     - 'recopilacion' (crea/ve sus casos) y 'busqueda' (ve/verifica
--       desaparecidos) necesitan identidad aprobada. 'verificador' queda EXENTO.
--       Admin siempre exento.
--
-- · FLUJO DE SALIDA: solo los casos "Otras informaciones" (no Desaparecidos)
--   pasan a Redacción. Los Desaparecidos verificados terminan su flujo en el
--   Grupo de Búsqueda (ellos gestionan esa data).
--
-- NOTA de seguridad de enum (igual que 0062): el valor nuevo 'busqueda' solo se
-- referencia en cuerpos plpgsql (evaluados al llamar) o por comparación de
-- TEXTO. Nunca se castea el literal a rol_usuario en un contexto eager (DML,
-- CREATE POLICY): Postgres lo prohíbe en la misma transacción que lo agrega.
-- Idempotente. Ejecutar tras 0077.
-- ============================================================

-- ── 1) Enum: nuevo rol ──
alter type public.rol_usuario add value if not exists 'busqueda';

-- ── 2) Grupo de sistema "Grupo de Búsqueda" ──
insert into public.grupos (nombre, area, clave, abierto) values
  ('Grupo de Búsqueda', 'gestion_informacion', 'busqueda', false)
on conflict (clave) do update set nombre = excluded.nombre;

-- ── 3) Mapeo grupo ↔ rol (añade busqueda ↔ busqueda) ──
-- plpgsql: el cuerpo se compila al llamar, tras el commit del valor de enum.
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'     then 'recopilacion'
    when 'verificacion'      then 'verificador'
    when 'busqueda'          then 'busqueda'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'edicion_video'     then 'edicion_video'
    when 'influencers'       then 'influencers'
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
    when 'busqueda'          then 'busqueda'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'edicion_video'     then 'edicion_video'
    when 'influencers'       then 'influencers'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'logistica'         then 'gestion_acopio'
    else null end;
end $$;

-- ── 4) Helpers (seguros en esta misma migración: no castean el enum nuevo) ──
-- ¿La persona actual tiene el rol 'busqueda'? Comparación por TEXTO.
create or replace function public.es_busqueda()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'busqueda');
$$;
grant execute on function public.es_busqueda() to authenticated;

-- ¿La 2ª verificación (identidad) de la persona actual está aprobada?
create or replace function public.identidad_aprobada()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.verificaciones_identidad
    where perfil_id = auth.uid() and estado = 'aprobada'
  );
$$;
grant execute on function public.identidad_aprobada() to authenticated;

-- ── 5) RLS de casos: frontera por categoría + 2ª verificación obligatoria ──
-- SELECT
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    -- Verificación: solo lo que NO es Desaparecidos (categoría NULL cuenta como no-desaparecidos).
    or (public.tiene_rol('verificador') and categoria is distinct from 'Desaparecidos')
    -- Búsqueda: solo Desaparecidos, y con 2ª verificación aprobada.
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos')
    -- Redacción: solo casos NO-desaparecidos confirmados o ya enviados.
    or (public.tiene_rol('redaccion') and estado::text in ('confirmado','enviado_redaccion')
        and categoria is distinct from 'Desaparecidos')
    -- Creador (recopilación): sus propios casos, con 2ª verificación aprobada.
    or (creado_por = auth.uid() and public.identidad_aprobada())
  ));

-- INSERT (crear casos): recopilación con 2ª verificación aprobada, o admin.
drop policy if exists "casos_insert" on public.casos;
create policy "casos_insert" on public.casos for insert to authenticated
  with check (public.es_verificado() and creado_por = auth.uid() and (
    public.es_admin()
    or (public.tiene_rol('recopilacion') and public.identidad_aprobada())
  ));

-- UPDATE (editar datos / cambiar estado)
drop policy if exists "casos_update" on public.casos;
create policy "casos_update" on public.casos for update to authenticated
  using (
    public.es_admin()
    or (public.tiene_rol('verificador') and public.es_verificado()
        and categoria is distinct from 'Desaparecidos' and estado::text <> 'enviado_redaccion')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos')
    or (public.es_verificado() and public.tiene_rol('redaccion')
        and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and estado::text = 'en_proceso' and public.identidad_aprobada())
  )
  with check (
    public.es_admin()
    or (public.tiene_rol('verificador') and public.es_verificado()
        and categoria is distinct from 'Desaparecidos' and estado::text <> 'enviado_redaccion')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos')
    or (public.es_verificado() and public.tiene_rol('redaccion')
        and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and estado::text = 'en_proceso' and public.identidad_aprobada())
  );

-- ── 6) Solo "Otras informaciones" pasa a Redacción ──
create or replace function public.enviar_caso_redaccion(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado public.estado_caso; v_cat text;
begin
  if not (public.tiene_rol('admin') or public.tiene_rol('redaccion')) then
    raise exception 'Solo el equipo de Redacción puede hacer esto.' using errcode='42501';
  end if;
  select estado, categoria into v_estado, v_cat from public.casos where id = p_caso;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if v_estado::text <> 'confirmado' then raise exception 'Solo se envían casos confirmados.'; end if;
  if v_cat is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de Desaparecidos no pasan a Redacción; los gestiona el Grupo de Búsqueda.' using errcode='42501';
  end if;
  update public.casos set estado = 'enviado_redaccion', actualizado_en = now() where id = p_caso;
end $$;

-- ── 7) Adjuntos de casos: Búsqueda también gestiona (subir/ver) ──
drop policy if exists "adjuntos_casos" on storage.objects;
create policy "adjuntos_casos" on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.es_busqueda() or public.tiene_rol('redaccion') or public.tiene_rol('recopilacion')))
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.es_busqueda() or public.tiene_rol('recopilacion')));

-- ── 8) Registro de actividad de casos: Búsqueda también puede registrar ──
create or replace function public.registrar_evento_caso(p_caso uuid, p_accion text)
returns void language plpgsql security definer set search_path = public as $$
declare v_acc text := case p_accion when 'descarga' then 'descarga' when 'edicion' then 'edicion' else 'copia' end;
begin
  if not (public.es_verificado() and (
      public.tiene_rol('admin') or public.tiene_rol('verificador') or public.es_busqueda()
      or public.tiene_rol('recopilacion') or public.tiene_rol('redaccion'))) then
    raise exception 'No tienes permiso para registrar esta actividad.' using errcode = '42501';
  end if;
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:' || v_acc, 'casos', p_caso::text,
          jsonb_build_object('caso_id', p_caso::text));
end; $$;
grant execute on function public.registrar_evento_caso(uuid, text) to authenticated;
