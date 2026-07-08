-- ============================================================
-- 0125 — Verificación de Digitalización: rol revisor + paso de revisión
-- ------------------------------------------------------------
-- Hasta ahora la digitalización NO tenía verificación: quien captura confirma
-- línea por línea y el cruce con desaparecidos (coincidencias) se dispara al
-- instante del INSERT de cada persona. Con OCR impreciso, eso genera coincidencias
-- falsas a partir de datos mal leídos. Se agrega un PASO DE REVISIÓN:
--   · Rol nuevo `verificador_digitalizacion` (grupo «Verificación de Digitalización»,
--     clave verificacion_digitalizacion) — 2ª área del flujo de Digitalización.
--   · `listados_digitalizados.estado` ∈ (por_verificar | verificado | observado),
--     default 'por_verificar'. Todo lo YA existente se da por 'verificado'
--     (grandfather: sus coincidencias ya se calcularon; no se recalculan).
--   · El cruce con desaparecidos QUEDA EN PAUSA hasta que un verificador marca el
--     listado 'verificado' (o admin). Se gatea el wrapper del trigger de personas y,
--     al verificar, la RPC `verificar_listado` corre la detección de todo el listado.
--   · El verificador VE y CORRIGE las personas de listados por_verificar/observado
--     (revisión de la información) pero NO crea listados ni edita lugares.
--
-- Diseño: NO se toca `puede_digitalizar`/`puede_ver_listado` (gatean insert/update/
-- delete de ambas tablas, storage y resolver_lugar): meter ahí al verificador le
-- daría crear listados y editar cualquier persona. Se usa un helper dedicado
-- `opera_verificacion_digitalizacion()` (rol + 2ª verificación) SOLO en las políticas
-- concretas. Como el verificador maneja datos sensibles (heridos/fallecidos/NNA)
-- EXIGE 2ª verificación de identidad, igual que el digitalizador.
--
-- Enum-safety: el valor nuevo `verificador_digitalizacion` de rol_usuario SOLO se usa
-- por comparación de TEXTO (helpers) o en cuerpos plpgsql late-bound (rol_de_grupo/
-- clave_de_rol, triggers), NUNCA con cast eager en un CREATE POLICY de esta misma
-- transacción (mismo patrón que digitalizador 0081 / buscador_nna 0093 / enlace 0090).
-- Idempotente. Ejecutar tras 0124.
-- ============================================================

-- ── 1) Rol del verificador de digitalización ──
alter type public.rol_usuario add value if not exists 'verificador_digitalizacion';

-- ── 2) Grupo de sistema «Verificación de Digitalización» ──
insert into public.grupos (nombre, area, clave, abierto) values
  ('Verificación de Digitalización', 'gestion_informacion', 'verificacion_digitalizacion', false)
on conflict (clave) do update set nombre = excluded.nombre;

-- ── 3) Mapeo grupo ↔ rol (rebase 0093; plpgsql late-bound → enum-safe) ──
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'              then 'recopilacion'
    when 'verificacion'              then 'verificador'
    when 'busqueda'                  then 'busqueda'
    when 'busqueda_nna'              then 'buscador_nna'
    when 'enlace_contacto'           then 'enlace_contacto'
    when 'digitalizacion'            then 'digitalizador'
    when 'verificacion_digitalizacion' then 'verificador_digitalizacion'
    when 'redaccion'                 then 'redaccion'
    when 'redes_sociales'            then 'redes_sociales'
    when 'diseno_grafico'            then 'diseno_grafico'
    when 'edicion_video'             then 'edicion_video'
    when 'influencers'               then 'influencers'
    when 'apoyo_psicosocial'         then 'apoyo_psicosocial'
    when 'gestion_acopio'            then 'logistica'
    else null end)::public.rol_usuario;
end $$;

create or replace function public.clave_de_rol(p_rol public.rol_usuario)
returns text language plpgsql immutable as $$
begin
  return case p_rol::text
    when 'recopilacion'                then 'gestion_casos'
    when 'verificador'                 then 'verificacion'
    when 'busqueda'                    then 'busqueda'
    when 'buscador_nna'                then 'busqueda_nna'
    when 'enlace_contacto'             then 'enlace_contacto'
    when 'digitalizador'               then 'digitalizacion'
    when 'verificador_digitalizacion'  then 'verificacion_digitalizacion'
    when 'redaccion'                   then 'redaccion'
    when 'redes_sociales'              then 'redes_sociales'
    when 'diseno_grafico'              then 'diseno_grafico'
    when 'edicion_video'               then 'edicion_video'
    when 'influencers'                 then 'influencers'
    when 'apoyo_psicosocial'           then 'apoyo_psicosocial'
    when 'logistica'                   then 'gestion_acopio'
    else null end;
end $$;

-- ── 4) Helpers del usuario actual (por TEXTO — enum-safe) ──
create or replace function public.es_verificador_digitalizacion()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'verificador_digitalizacion');
$$;
grant execute on function public.es_verificador_digitalizacion() to authenticated;

-- Opera la revisión (exige 2ª verificación de identidad, como opera_digitalizacion 0124).
create or replace function public.opera_verificacion_digitalizacion()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_verificador_digitalizacion() and public.identidad_aprobada();
$$;
grant execute on function public.opera_verificacion_digitalizacion() to authenticated;

-- ── 5) Estado de revisión del listado + traza + grandfather ──
-- add column + backfill van juntos y GUARDADOS por la existencia de la columna, para
-- que un segundo pase de la migración NO re-marque como 'verificado' listados nuevos.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'listados_digitalizados' and column_name = 'estado'
  ) then
    alter table public.listados_digitalizados add column estado text not null default 'por_verificar';
    -- Grandfather: lo que YA existía se da por verificado (sus coincidencias ya corrieron).
    update public.listados_digitalizados set estado = 'verificado';
  end if;
end $$;

alter table public.listados_digitalizados
  add column if not exists verificado_por    uuid references public.perfiles (id),
  add column if not exists verificado_en     timestamptz,
  add column if not exists nota_verificacion text;

alter table public.listados_digitalizados drop constraint if exists listados_estado_chk;
alter table public.listados_digitalizados add constraint listados_estado_chk
  check (estado in ('por_verificar', 'verificado', 'observado'));

create index if not exists idx_listados_estado on public.listados_digitalizados (estado, creado_en desc);

-- ── 6) Supervisión de grupos: el admin de Digitalización también supervisa el grupo
--       de verificación (rebase 0124) ──
create or replace function public.puede_supervisar_grupo(p_grupo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from public.grupos g where g.id = p_grupo and (
      (public.es_admin_verificacion() and g.clave in
         ('gestion_casos','verificacion','busqueda','busqueda_nna','enlace_contacto'))
      or (public.es_admin_redes() and g.clave in
         ('redaccion','redes_sociales','diseno_grafico','edicion_video','influencers'))
      or (public.es_admin_logistica() and g.clave in ('gestion_acopio'))
      or (public.es_admin_digitalizacion() and g.clave in ('digitalizacion','verificacion_digitalizacion'))
    )
  );
$$;

-- ── 7) RLS: el verificador VE listados y personas, y CORRIGE personas mientras el
--       listado esté por_verificar/observado. NO crea listados ni edita lugares. ──

-- Lecturas (rebase 0106): suma la vía del verificador.
drop policy if exists listados_select on public.listados_digitalizados;
create policy listados_select on public.listados_digitalizados for select to authenticated
  using (public.puede_ver_listado(tipo_lugar) or public.opera_verificacion_digitalizacion());

drop policy if exists personas_select on public.personas_listado;
create policy personas_select on public.personas_listado for select to authenticated
  using (
    exists (select 1 from public.listados_digitalizados l
            where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar))
    or public.opera_verificacion_digitalizacion()
  );

-- Corrección de personas (rebase 0080): rama del verificador SOLO sobre listados aún
-- en revisión (por_verificar/observado). Tras 'verificado' el listado queda bloqueado.
drop policy if exists personas_update on public.personas_listado;
create policy personas_update on public.personas_listado for update to authenticated
  using (
    exists (select 1 from public.listados_digitalizados l
            where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar))
    or (public.opera_verificacion_digitalizacion()
        and exists (select 1 from public.listados_digitalizados l
                    where l.id = listado_id and l.estado in ('por_verificar','observado')))
  )
  with check (
    exists (select 1 from public.listados_digitalizados l
            where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar))
    or (public.opera_verificacion_digitalizacion()
        and exists (select 1 from public.listados_digitalizados l
                    where l.id = listado_id and l.estado in ('por_verificar','observado')))
  );

-- Eliminar una fila espuria del OCR durante la revisión (rebase 0080).
drop policy if exists personas_delete on public.personas_listado;
create policy personas_delete on public.personas_listado for delete to authenticated
  using (
    public.es_admin() or creado_por = auth.uid()
    or exists (select 1 from public.listados_digitalizados l
               where l.id = listado_id and public.puede_ver_listado(l.tipo_lugar))
    or (public.opera_verificacion_digitalizacion()
        and exists (select 1 from public.listados_digitalizados l
                    where l.id = listado_id and l.estado in ('por_verificar','observado')))
  );

-- Storage: el verificador descarga la foto original para cotejar (rebase 0106).
drop policy if exists digitalizacion_select on storage.objects;
create policy digitalizacion_select on storage.objects for select to authenticated
  using (bucket_id = 'digitalizacion'
         and (public.puede_digitalizar() or public.opera_verificacion_digitalizacion()));

-- ── 8) Gate del cruce: la detección de coincidencias solo corre sobre listados YA
--       verificados. En captura (listado por_verificar) NO se disparan coincidencias. ──
create or replace function public.trg_coincidencias_persona()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.listados_digitalizados l
    where l.id = new.listado_id and l.estado = 'verificado'
  ) then
    perform public.detectar_coincidencias_persona(new.id);
  end if;
  return new;
end $$;
-- (el trigger trg_personas_coincidencias de 0083 sigue igual; solo cambia el wrapper.)

-- ── 9) RPC de revisión (única vía a 'verificado'/'observado'; SECURITY DEFINER) ──
-- Exige verificador (con 2ª verif) o admin. Prohíbe auto-verificación (verificador ≠
-- quien digitalizó, admin exento). Al VERIFICAR corre el cruce de todo el listado
-- (idempotente por el unique de coincidencias). Avisa al digitalizador el resultado.
create or replace function public.verificar_listado(p_listado uuid, p_estado text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_creador uuid;
  v_estado_actual text;
begin
  -- Verifica el verificador (con 2ª verif), el admin de Digitalización (supervisión de
  -- su área) o el admin general.
  if not (public.es_admin() or public.opera_verificacion_digitalizacion() or public.opera_digitalizacion()) then
    raise exception 'No tienes permiso para verificar listados.' using errcode = '42501';
  end if;
  if p_estado not in ('verificado', 'observado') then
    raise exception 'Estado de verificación no válido.';
  end if;

  select creado_por, estado into v_creador, v_estado_actual
    from public.listados_digitalizados where id = p_listado;
  if not found then
    raise exception 'Listado no encontrado.';
  end if;

  -- Sin auto-verificación: quien digitalizó no verifica su propio listado (admin exento).
  if not public.es_admin() and v_creador is not null and v_creador = auth.uid() then
    raise exception 'No puedes verificar un listado que tú mismo digitalizaste.' using errcode = '42501';
  end if;

  -- Solo desde estados aún en revisión (un listado ya verificado queda bloqueado).
  if v_estado_actual not in ('por_verificar', 'observado') then
    raise exception 'Este listado ya fue verificado.';
  end if;

  update public.listados_digitalizados set
    estado            = p_estado,
    verificado_por    = auth.uid(),
    verificado_en     = now(),
    nota_verificacion = nullif(btrim(coalesce(p_nota, '')), ''),
    actualizado_en    = now()
  where id = p_listado;

  -- Al VERIFICAR se dispara el cruce con desaparecidos (hasta ahora en pausa).
  if p_estado = 'verificado' then
    perform public.detectar_coincidencias_persona(p.id)
      from public.personas_listado p where p.listado_id = p_listado;
  end if;

  -- Avisar a quien digitalizó el resultado de la revisión.
  if v_creador is not null and v_creador <> auth.uid() then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (
      v_creador, 'digitalizacion_verificacion',
      case when p_estado = 'verificado' then 'Tu listado fue verificado'
           else 'Tu listado tiene observaciones' end,
      case when p_estado = 'verificado' then 'La revisión confirmó la información digitalizada.'
           else 'Un verificador marcó observaciones. Revisa y corrige la información.' end,
      '/digitalizacion/' || p_listado::text
    );
  end if;
end $$;
grant execute on function public.verificar_listado(uuid, text, text) to authenticated;

-- ── 10) Aviso al equipo de verificación cuando entra un listado por revisar ──
create or replace function public.trg_listado_por_verificar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'por_verificar' then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select pf.id, 'digitalizacion_por_verificar',
           'Listado por verificar',
           'Hay un listado digitalizado esperando revisión.', '/digitalizacion/' || new.id::text
    from public.perfiles pf
    where pf.rol::text = 'verificador_digitalizacion'
       or exists (select 1 from unnest(coalesce(pf.roles_extra, '{}'::public.rol_usuario[])) r
                  where r::text = 'verificador_digitalizacion');
  end if;
  return new;
end $$;
drop trigger if exists trg_listado_por_verificar on public.listados_digitalizados;
create trigger trg_listado_por_verificar after insert on public.listados_digitalizados
  for each row execute function public.trg_listado_por_verificar();
