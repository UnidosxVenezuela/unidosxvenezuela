-- ============================================================
-- 0093 — Búsqueda Fase 5: rol Buscador NNA + blindaje de menores
-- ------------------------------------------------------------
-- El manual del equipo separa a los "verificadores generales" (nuestros
-- buscadores de adultos) de los "verificadores especiales", que atienden a los
-- MENORES (NNA). Aquí creamos ese rol especializado — `buscador_nna` — y blindamos
-- la separación:
--   · Buscador (rol 'busqueda')  → ve/toma/trabaja SOLO casos de ADULTOS (es_nna=false).
--   · Buscador NNA ('buscador_nna') → ve/toma/trabaja SOLO casos de MENORES (es_nna=true).
--   · El buscador general NUNCA ve un caso de menor (RLS de fila); tampoco puede tomarlo.
--   · El mando (líder/coordinador de Búsqueda o Búsqueda NNA) y el admin ven todo.
--   · Reclasificar es_nna (mover un caso entre colas) queda reservado al mando/DEFINER.
--
-- Enum-safety: el valor nuevo `buscador_nna` de `rol_usuario` SOLO se usa por
-- comparación de TEXTO (es_buscador_nna) o en cuerpos plpgsql (rol_de_grupo,
-- crear/tomar), NUNCA con cast eager en un CREATE POLICY/DML de esta transacción
-- (mismo patrón que 'enlace_contacto' en 0090). Idempotente. Ejecutar tras 0092.
-- ============================================================

-- ── 1) Rol + grupo del Buscador NNA ──
alter type public.rol_usuario add value if not exists 'buscador_nna';

-- Grupo del sistema para el equipo de menores (copia el área del grupo de Búsqueda).
insert into public.grupos (nombre, area, clave, abierto)
select 'Búsqueda de Menores (NNA)', g.area, 'busqueda_nna', false
from public.grupos g where g.clave = 'busqueda'
on conflict (clave) do update set nombre = excluded.nombre;

-- Mapeo grupo ↔ rol (plpgsql: se compila al llamar, tras el commit del enum).
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'     then 'recopilacion'
    when 'verificacion'      then 'verificador'
    when 'busqueda'          then 'busqueda'
    when 'busqueda_nna'      then 'buscador_nna'
    when 'enlace_contacto'   then 'enlace_contacto'
    when 'digitalizacion'    then 'digitalizador'
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
    when 'buscador_nna'      then 'busqueda_nna'
    when 'enlace_contacto'   then 'enlace_contacto'
    when 'digitalizador'     then 'digitalizacion'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'edicion_video'     then 'edicion_video'
    when 'influencers'       then 'influencers'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'logistica'         then 'gestion_acopio'
    else null end;
end $$;

-- ¿La persona actual es Buscador NNA? (comparación por TEXTO — enum-safe)
create or replace function public.es_buscador_nna()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'buscador_nna');
$$;
grant execute on function public.es_buscador_nna() to authenticated;

-- ── 2) Mando de Búsqueda: ahora también el líder/coordinador del equipo NNA ──
create or replace function public.es_mando_busqueda()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or (
    public.identidad_aprobada() and (
      exists (select 1 from public.grupos g
              where g.clave in ('busqueda','busqueda_nna') and g.lider_id = auth.uid())
      or (public.tiene_rol('coordinador') and exists (
            select 1 from public.grupos g
            join public.miembros_grupo m on m.grupo_id = g.id
            where g.clave in ('busqueda','busqueda_nna') and m.perfil_id = auth.uid()))
    )
  );
$$;

-- ── 3) Blindaje: reclasificar es_nna queda reservado al mando/DEFINER ──
-- Mover un caso entre la cola de adultos y la de menores cambia quién puede verlo;
-- por eso solo el mando (o las funciones DEFINER con el flag) puede tocar es_nna,
-- junto con la traza y los flags de custodia/autoridad ya protegidos.
create or replace function public.busqueda_casos_blindaje()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_flag text := current_setting('app.busqueda_mando', true);
begin
  new.numero := old.numero;
  new.codigo := old.codigo;
  if v_flag is distinct from '1' then
    new.aprobado_por := old.aprobado_por;
    new.aprobado_en  := old.aprobado_en;
    new.contacto_por := old.contacto_por;
    new.contacto_en  := old.contacto_en;
    new.custodia_verificada  := old.custodia_verificada;
    new.autoridad_notificada := old.autoridad_notificada;
    if new.es_nna is distinct from old.es_nna and not public.es_mando_busqueda() then
      new.es_nna := old.es_nna;  -- solo el mando reclasifica un caso como NNA / adulto
    end if;
    if new.estado_busqueda is distinct from old.estado_busqueda
       and new.estado_busqueda in ('coincidencia_aprobada','reunificado','derivado_autoridad',
                                   'descartado','encontrado_fallecido')
       and not public.es_mando_busqueda() then
      raise exception 'Solo el mando de Búsqueda puede llevar el caso a ese estado.'
        using errcode = '42501';
    end if;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

-- ── 4) RLS de busqueda_casos: separación estricta adultos / menores ──
-- Buscador general → solo adultos; Buscador NNA → solo menores; mando/admin → todo;
-- Enlace → su cola (no-NNA aprobados / los que él cerró; su rama NNA llega en Fase 6).
drop policy if exists "busqueda_casos_select" on public.busqueda_casos;
create policy "busqueda_casos_select" on public.busqueda_casos for select to authenticated
  using (
    public.es_admin()
    or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada() and es_nna = false)
    or (public.es_buscador_nna() and public.identidad_aprobada() and es_nna = true)
    or (public.es_enlace() and public.identidad_aprobada() and es_nna = false
        and (estado_busqueda = 'coincidencia_aprobada' or contacto_por = auth.uid()))
  );

drop policy if exists "busqueda_casos_insert" on public.busqueda_casos;
create policy "busqueda_casos_insert" on public.busqueda_casos for insert to authenticated
  with check (
    estado_busqueda = 'activo' and (
      public.es_admin() or public.es_mando_busqueda()
      or (public.es_busqueda() and public.identidad_aprobada() and es_nna = false)
      or (public.es_buscador_nna() and public.identidad_aprobada() and es_nna = true)
    )
  );

drop policy if exists "busqueda_casos_update" on public.busqueda_casos;
create policy "busqueda_casos_update" on public.busqueda_casos for update to authenticated
  using (
    public.es_admin() or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada() and es_nna = false)
    or (public.es_buscador_nna() and public.identidad_aprobada() and es_nna = true)
  )
  with check (
    public.es_admin() or public.es_mando_busqueda()
    or (public.es_busqueda() and public.identidad_aprobada() and es_nna = false
        and estado_busqueda in ('activo','en_revision','coincidencia_pendiente'))
    or (public.es_buscador_nna() and public.identidad_aprobada() and es_nna = true
        and estado_busqueda in ('activo','en_revision','coincidencia_pendiente'))
  );

-- ── 5) Intake atómico: gatea el registro de menores al Buscador NNA / mando ──
create or replace function public.crear_caso_busqueda(
  p_titulo           text,
  p_descripcion      text default null,
  p_edad             int  default null,
  p_sexo             text default null,
  p_ultima_ubicacion text default null,
  p_es_nna           boolean default false,
  p_reporta_nombre   text default null,
  p_reporta_telefono text default null,
  p_fuente           text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_caso uuid; v_nna boolean := coalesce(p_es_nna, false);
begin
  if v_nna then
    if not (public.es_admin() or public.es_mando_busqueda()
            or (public.es_buscador_nna() and public.identidad_aprobada())) then
      raise exception 'Solo un Buscador NNA (o el mando) puede registrar un caso de menor.' using errcode = '42501';
    end if;
  else
    if not (public.es_admin() or public.es_mando_busqueda()
            or (public.es_busqueda() and public.identidad_aprobada())) then
      raise exception 'No tienes permiso para registrar un caso de búsqueda.' using errcode = '42501';
    end if;
  end if;
  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'El nombre de la persona es obligatorio.';
  end if;

  insert into public.casos (titulo, descripcion, categoria, fuente, estado, creado_por)
  values (btrim(p_titulo), nullif(btrim(p_descripcion), ''), 'Desaparecidos',
          nullif(btrim(p_fuente), ''), 'en_proceso', auth.uid())
  returning id into v_caso;

  insert into public.busqueda_casos (
    caso_id, edad, sexo, ultima_ubicacion, es_nna,
    reporta_nombre, reporta_telefono, fuente_verifico
  ) values (
    v_caso, p_edad, nullif(btrim(p_sexo), ''), nullif(btrim(p_ultima_ubicacion), ''),
    v_nna, nullif(btrim(p_reporta_nombre), ''),
    nullif(btrim(p_reporta_telefono), ''), nullif(btrim(p_fuente), '')
  );

  return v_caso;
end $$;
grant execute on function public.crear_caso_busqueda(text, text, int, text, text, boolean, text, text, text) to authenticated;

-- ── 6) Tomar un caso: un buscador general NO puede tomar un caso de menor ──
create or replace function public.tomar_caso_busqueda(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_nna boolean;
begin
  select es_nna into v_nna from public.busqueda_casos where caso_id = p_caso;
  if not found then raise exception 'Ficha de búsqueda no encontrada.'; end if;
  if v_nna then
    if not (public.es_admin() or public.es_mando_busqueda()
            or (public.es_buscador_nna() and public.identidad_aprobada())) then
      raise exception 'Solo un Buscador NNA (o el mando) puede tomar un caso de menor.' using errcode = '42501';
    end if;
  else
    if not (public.es_admin() or public.es_mando_busqueda()
            or (public.es_busqueda() and public.identidad_aprobada())) then
      raise exception 'No tienes permiso para tomar este caso.' using errcode = '42501';
    end if;
  end if;
  update public.casos set asignado_a = auth.uid(), actualizado_en = now() where id = p_caso;
end $$;
grant execute on function public.tomar_caso_busqueda(uuid) to authenticated;

-- ── 7) El resumen agregado también lo puede pedir el Buscador NNA ──
create or replace function public.resumen_busqueda()
returns table (
  total                 bigint,
  activos               bigint,
  en_revision           bigint,
  coincidencia_pendiente bigint,
  coincidencia_aprobada bigint,
  reunificados          bigint,
  derivados_autoridad   bigint,
  encontrado_fallecido  bigint,
  descartados           bigint,
  sin_asignar           bigint,
  nna                   bigint,
  vencidos              bigint,
  nuevos_7d             bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_admin() or public.es_mando_busqueda()
          or (public.es_busqueda() and public.identidad_aprobada())
          or (public.es_buscador_nna() and public.identidad_aprobada())) then
    raise exception 'Sin permiso para ver el resumen de búsqueda.' using errcode = '42501';
  end if;
  return query
  select
    count(*)::bigint,
    count(*) filter (where b.estado_busqueda = 'activo')::bigint,
    count(*) filter (where b.estado_busqueda = 'en_revision')::bigint,
    count(*) filter (where b.estado_busqueda = 'coincidencia_pendiente')::bigint,
    count(*) filter (where b.estado_busqueda = 'coincidencia_aprobada')::bigint,
    count(*) filter (where b.estado_busqueda = 'reunificado')::bigint,
    count(*) filter (where b.estado_busqueda = 'derivado_autoridad')::bigint,
    count(*) filter (where b.estado_busqueda = 'encontrado_fallecido')::bigint,
    count(*) filter (where b.estado_busqueda = 'descartado')::bigint,
    count(*) filter (where c.asignado_a is null
                       and b.estado_busqueda in ('activo','en_revision','coincidencia_pendiente'))::bigint,
    count(*) filter (where b.es_nna)::bigint,
    count(*) filter (where b.estado_busqueda in ('activo','en_revision')
                       and b.proxima_revision <= now())::bigint,
    count(*) filter (where b.creado_en > now() - interval '7 days')::bigint
  from public.busqueda_casos b
  join public.casos c on c.id = b.caso_id;
end $$;
grant execute on function public.resumen_busqueda() to authenticated;

-- ── 8) Frontera de `casos`: la separación NNA también en la fila del CASO ──
-- Sin esto, el buscador general vería el NOMBRE del menor (casos.titulo) aunque no
-- vea la ficha `busqueda_casos`. Un subquery normal en la policy iría filtrado por
-- la RLS de busqueda_casos (y no serviría), así que se usa un helper DEFINER que
-- lee es_nna saltando la RLS.
create or replace function public.caso_busqueda_es_nna(p_caso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select b.es_nna from public.busqueda_casos b where b.caso_id = p_caso), false);
$$;
grant execute on function public.caso_busqueda_es_nna(uuid) to authenticated;

-- SELECT: Búsqueda solo Desaparecidos, separando adultos (buscador general) de
-- menores (Buscador NNA); el mando ve ambos. Las demás ramas se conservan de 0078.
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or (public.tiene_rol('verificador') and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.tiene_rol('redaccion') and estado::text in ('confirmado','enviado_redaccion')
        and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and public.identidad_aprobada())
  ));

-- UPDATE: misma separación adultos/menores en la rama de Búsqueda.
drop policy if exists "casos_update" on public.casos;
create policy "casos_update" on public.casos for update to authenticated
  using (
    public.es_admin()
    or (public.tiene_rol('verificador') and public.es_verificado()
        and categoria is distinct from 'Desaparecidos' and estado::text <> 'enviado_redaccion')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_verificado() and public.tiene_rol('redaccion')
        and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and estado::text = 'en_proceso' and public.identidad_aprobada())
  )
  with check (
    public.es_admin()
    or (public.tiene_rol('verificador') and public.es_verificado()
        and categoria is distinct from 'Desaparecidos' and estado::text <> 'enviado_redaccion')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_verificado() and public.tiene_rol('redaccion')
        and estado::text in ('confirmado','enviado_redaccion') and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and estado::text = 'en_proceso' and public.identidad_aprobada())
  );

-- Adjuntos de casos y registro de actividad: el equipo NNA también gestiona.
drop policy if exists "adjuntos_casos" on storage.objects;
create policy "adjuntos_casos" on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.es_busqueda() or public.es_buscador_nna()
              or public.tiene_rol('redaccion') or public.tiene_rol('recopilacion')))
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = 'casos'
         and (public.tiene_rol('admin') or public.tiene_rol('verificador')
              or public.es_busqueda() or public.es_buscador_nna() or public.tiene_rol('recopilacion')));

create or replace function public.registrar_evento_caso(p_caso uuid, p_accion text)
returns void language plpgsql security definer set search_path = public as $$
declare v_acc text := case p_accion when 'descarga' then 'descarga' when 'edicion' then 'edicion' else 'copia' end;
begin
  if not (public.es_verificado() and (
      public.tiene_rol('admin') or public.tiene_rol('verificador') or public.es_busqueda()
      or public.es_buscador_nna() or public.tiene_rol('recopilacion') or public.tiene_rol('redaccion'))) then
    raise exception 'No tienes permiso para registrar esta actividad.' using errcode = '42501';
  end if;
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:' || v_acc, 'casos', p_caso::text,
          jsonb_build_object('caso_id', p_caso::text));
end; $$;
grant execute on function public.registrar_evento_caso(uuid, text) to authenticated;
