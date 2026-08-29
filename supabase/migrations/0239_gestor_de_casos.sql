-- ============================================================
-- 0239 — Gestor Integral de Casos · Fase 1: el dueño y el reloj
-- ------------------------------------------------------------
-- Responde a la propuesta organizacional del 19/08/2026. El análisis completo, con lo que
-- ya existía y lo que no, está en docs/PLAN-GESTOR-DE-CASOS.md.
--
-- LO QUE FALTABA DE VERDAD no era «coordinar áreas» —eso existe desde 0177, con derivación
--   selectiva por ítem desde 0222— sino QUÉ TOCA AHORA, QUIÉN RESPONDE Y PARA CUÁNDO. Eso
--   no se guardaba en ningún campo, y sin ello el «principio de control» de la propuesta
--   (un responsable, una próxima acción y una fecha vigente) no se puede ni medir ni exigir.
--
-- POR QUÉ UNA COLUMNA NUEVA Y NO `asignado_a`, que es la trampa evidente:
--   `casos.asignado_a` significa «quién está VERIFICANDO esto ahora», y el propio flujo lo
--   pone a NULL al devolver el caso por falta de información (0142). El gestor tiene que
--   seguir siendo dueño mientras el caso está en Logística, en Alianzas o esperando una
--   respuesta. Reutilizar esa columna habría hecho que el dueño desapareciera justo en el
--   momento en que más falta hace.
--
-- DECISIONES TOMADAS POR LA ORGANIZACIÓN:
--   1. DESAPARECIDOS NO ENTRA. Búsqueda tiene su propio circuito y su propia
--      `proxima_revision` (0091); meterlo aquí duplicaría el seguimiento. La frontera se
--      escribe en cada gate, no se deja al criterio de la interfaz.
--   2. EL GESTOR LO ASIGNA EL LÍDER O ADMINISTRACIÓN. Ni automático ni «tomar»: el reparto
--      es una decisión de mando. `puede_asignar_gestor()` = admin o mando de Verificación
--      (líder o coordinador del grupo, molde exacto de 0147).
--
-- ENUM-SAFETY: `gestor_casos` se añade a `rol_usuario` y se usa en la MISMA migración por
--   comparación de TEXTO (`r::text = 'gestor_casos'`), nunca como literal de enum —molde
--   exacto de 0129 con `captacion`—. Un literal de enum recién creado revienta al
--   planificarse; el texto no.
--
-- ESCRITURA solo por RPC. `casos_update` NO se toca: es la policy más peleada del
--   repositorio y abrirle una rama al gestor para que pueda fijar una fecha sería pagar un
--   riesgo enorme por un campo de texto. Tres RPC `security definer` hacen el trabajo con
--   su propio gate, y la tabla no cambia de reglas.
--
-- LECTURA: `casos_select` gana UNA rama, de la misma forma exacta que la de `verificador`
--   (`rol and categoria is distinct from 'Desaparecidos'`). No es una clase de acceso
--   nueva: es el mismo alcance que ya tiene Verificación, para un rol que por definición
--   necesita el expediente entero. El resto de la policy queda VERBATIM de 0180.
--
-- PLAZO POR DEFECTO según urgencia y no fijo: una crítica y una baja no se revisan con el
--   mismo reloj, y el dato ya está en `req_urgencia`. 24 h / 48 h / 72 h / 7 días.
--
-- Idempotente. Ejecutar tras 0238.
-- ============================================================

-- ═══ (1) El rol ═══
alter type public.rol_usuario add value if not exists 'gestor_casos';

-- ═══ (2) Helpers ═══
-- Comparación por TEXTO a propósito (ver ENUM-SAFETY en la cabecera).
create or replace function public.es_gestor_casos()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'gestor_casos');
$$;
grant execute on function public.es_gestor_casos() to authenticated;

comment on function public.es_gestor_casos() is
  'Rol Gestor Integral de Casos (0239). Compara por texto, no por literal de enum: molde 0129.';

-- Quién reparte los casos. Decisión de la organización: el líder o administración.
create or replace function public.puede_asignar_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or public.es_mando_verificacion();
$$;
grant execute on function public.puede_asignar_gestor() to authenticated;

-- Plazo por defecto de la próxima revisión, según la urgencia declarada del caso.
create or replace function public.plazo_seguimiento(p_urgencia text)
returns interval language plpgsql immutable as $$
begin
  return case lower(coalesce(p_urgencia, ''))
    when 'critica' then interval '24 hours'
    when 'alta'    then interval '48 hours'
    when 'media'   then interval '72 hours'
    else                interval '7 days'
  end;
end $$;
grant execute on function public.plazo_seguimiento(text) to authenticated;

-- ═══ (3) Las columnas ═══
alter table public.casos add column if not exists gestor_id uuid references public.perfiles(id) on delete set null;
alter table public.casos add column if not exists gestor_asignado_en timestamptz;
alter table public.casos add column if not exists proxima_accion text;
alter table public.casos add column if not exists proxima_revision timestamptz;
alter table public.casos add column if not exists area_siguiente text;

do $$
begin
  alter table public.casos drop constraint if exists casos_area_siguiente_chk;
  -- Mismo juego que `casos_derivaciones.area` (0177) más las dos internas: la próxima
  -- acción puede perfectamente quedarse en casa.
  alter table public.casos add constraint casos_area_siguiente_chk
    check (area_siguiente is null or area_siguiente in
      ('logistica','redes','donaciones','alianzas','coordinacion','otra','verificacion','recopilacion'));
end $$;

create index if not exists idx_casos_gestor on public.casos (gestor_id, proxima_revision);
-- Índice parcial para el reporte que más se va a mirar: lo que no tiene dueño.
create index if not exists idx_casos_sin_gestor on public.casos (creado_en desc)
  where gestor_id is null;

comment on column public.casos.gestor_id is
  'Gestor Integral de Casos (0239): dueño transversal del caso hasta su cierre. NO es `asignado_a`, que significa quién lo verifica ahora y se vacía al devolver el caso por falta de información (0142).';
comment on column public.casos.proxima_accion is
  'Qué toca ahora, en una frase. Con `proxima_revision` forman el principio de control de la propuesta: un responsable, una próxima acción y una fecha vigente.';

-- ═══ (4) Lectura: casos_select con UNA rama nueva ═══
-- El resto es VERBATIM de 0180. La rama del gestor tiene la misma forma que la de
-- `verificador`, así que no abre una clase de acceso nueva — y deja fuera Desaparecidos,
-- que es la decisión 1 de la organización.
drop policy if exists "casos_select" on public.casos;
create policy "casos_select" on public.casos for select to authenticated
  using (public.es_verificado() and (
    public.es_admin()
    or public.opera_verificacion()
    or (public.tiene_rol('verificador') and categoria is distinct from 'Desaparecidos')
    or (public.es_gestor_casos() and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_recopilacion() and categoria is distinct from 'Desaparecidos')
    or (public.es_mando_busqueda() and categoria = 'Desaparecidos')
    or (public.es_busqueda() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and not public.caso_busqueda_es_nna(id))
    or (public.es_buscador_nna() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_es_nna(id))
    or (public.es_enlace() and public.identidad_aprobada() and categoria = 'Desaparecidos'
        and public.caso_busqueda_etapa_enlace(id))
    or (public.puede_logistica() and estado::text in ('confirmado','enviado_redaccion','resuelto')
        and categoria is distinct from 'Desaparecidos')
    or (creado_por = auth.uid() and public.identidad_aprobada())
  ));

-- ═══ (5) Asignar gestor ═══
drop function if exists public.asignar_gestor_caso(uuid, uuid);
create function public.asignar_gestor_caso(p_caso uuid, p_gestor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso record; v_ok boolean; v_nombre text;
begin
  if not public.puede_asignar_gestor() then
    raise exception 'El gestor lo asigna el líder de Verificación o administración.' using errcode = '42501';
  end if;

  select id, categoria, titulo, gestor_id, req_urgencia into v_caso
    from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Esa solicitud no existe.' using errcode = '22023';
  end if;
  -- Decisión 1: Desaparecidos no entra en este circuito.
  if v_caso.categoria is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de Desaparecidos siguen el circuito de Búsqueda, no el de gestión.'
      using errcode = '22023';
  end if;

  -- Que el destinatario pueda de verdad hacer el trabajo. Asignarle un caso a quien no lo
  -- puede abrir es crear un caso huérfano que además parece atendido.
  select exists (
    select 1 from public.perfiles p
     where p.id = p_gestor and p.verificado
       and (p.rol::text in ('gestor_casos','admin')
            or exists (select 1 from unnest(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) r
                        where r::text in ('gestor_casos','admin')))
  ) into v_ok;
  if not v_ok then
    raise exception 'Esa persona no tiene el rol de Gestor de Casos (o no está verificada).'
      using errcode = '22023';
  end if;

  update public.casos
     set gestor_id = p_gestor,
         gestor_asignado_en = now(),
         -- Al entrar el dueño arranca el reloj, si nadie lo había puesto. Un caso con
         -- gestor y sin fecha es exactamente el agujero que esto viene a tapar.
         proxima_revision = coalesce(proxima_revision, now() + public.plazo_seguimiento(req_urgencia::text)),
         actualizado_en = now()
   where id = p_caso;

  select coalesce(nullif(btrim(titulo), ''), 'una solicitud') into v_nombre
    from public.casos where id = p_caso;

  if p_gestor is distinct from auth.uid() then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    values (p_gestor, 'gestor_asignado', 'Te asignaron una solicitud para gestionar',
            left(v_nombre, 140), '/casos?caso=' || p_caso);
  end if;

  perform public.registrar_auditoria('caso_gestor_asignado', 'casos', p_caso::text,
    jsonb_build_object('gestor', p_gestor, 'anterior', v_caso.gestor_id));
end $$;

revoke all on function public.asignar_gestor_caso(uuid, uuid) from public;
grant execute on function public.asignar_gestor_caso(uuid, uuid) to authenticated;

-- ═══ (6) Quitar gestor ═══
drop function if exists public.quitar_gestor_caso(uuid, text);
create function public.quitar_gestor_caso(p_caso uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_anterior uuid;
begin
  if not public.puede_asignar_gestor() then
    raise exception 'El gestor lo asigna el líder de Verificación o administración.' using errcode = '42501';
  end if;
  select gestor_id into v_anterior from public.casos where id = p_caso;

  update public.casos
     set gestor_id = null, gestor_asignado_en = null, actualizado_en = now()
   where id = p_caso;

  perform public.registrar_auditoria('caso_gestor_retirado', 'casos', p_caso::text,
    jsonb_build_object('anterior', v_anterior, 'motivo', left(coalesce(p_motivo, ''), 500)));
end $$;

revoke all on function public.quitar_gestor_caso(uuid, text) from public;
grant execute on function public.quitar_gestor_caso(uuid, text) to authenticated;

-- ═══ (7) Fijar la próxima acción y su fecha ═══
-- Esto lo hace el GESTOR DEL CASO —es su trabajo—, y también el mando y administración.
-- No cualquier gestor sobre cualquier caso: el dueño es uno.
drop function if exists public.fijar_seguimiento_caso(uuid, text, timestamptz, text);
create function public.fijar_seguimiento_caso(
  p_caso    uuid,
  p_accion  text,
  p_proxima timestamptz default null,
  p_area    text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_caso record; v_accion text := nullif(btrim(coalesce(p_accion, '')), '');
begin
  select id, categoria, gestor_id, req_urgencia into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Esa solicitud no existe.' using errcode = '22023';
  end if;
  if v_caso.categoria is not distinct from 'Desaparecidos' then
    raise exception 'Los casos de Desaparecidos siguen el circuito de Búsqueda.' using errcode = '22023';
  end if;
  if not (public.es_admin() or public.es_mando_verificacion()
          or (v_caso.gestor_id is not null and v_caso.gestor_id = auth.uid())) then
    raise exception 'Solo el gestor del caso, su líder o administración fijan la próxima acción.'
      using errcode = '42501';
  end if;
  if v_accion is null then
    raise exception 'Escribe qué es lo próximo que hay que hacer.' using errcode = '22023';
  end if;
  if p_area is not null and p_area not in
     ('logistica','redes','donaciones','alianzas','coordinacion','otra','verificacion','recopilacion') then
    raise exception 'Área no válida.' using errcode = '22023';
  end if;

  update public.casos
     set proxima_accion   = left(v_accion, 500),
         -- Sin fecha explícita, la que toque por urgencia. Nunca se queda sin reloj.
         proxima_revision = coalesce(p_proxima, now() + public.plazo_seguimiento(req_urgencia::text)),
         area_siguiente   = p_area,
         actualizado_en   = now()
   where id = p_caso;

  perform public.registrar_auditoria('caso_seguimiento_fijado', 'casos', p_caso::text,
    jsonb_build_object('area', p_area, 'proxima', coalesce(p_proxima, now())));
end $$;

revoke all on function public.fijar_seguimiento_caso(uuid, text, timestamptz, text) from public;
grant execute on function public.fijar_seguimiento_caso(uuid, text, timestamptz, text) to authenticated;

-- ═══ (8) Los reportes de control ═══
-- La propuesta pide cuatro: sin responsable, vencidos, bloqueados y próximos a cierre.
-- Aquí van TRES de verdad más «por cerrar», y conviene decir por qué falta el cuarto:
-- «BLOQUEADO» no se puede calcular todavía. Un caso está bloqueado cuando espera un dato
-- que alguien pidió y no llega, y esa solicitud de información estructurada es la Fase 2
-- (hoy `info_requerida` es una columna de texto, sin responsable ni fecha). Inventarle una
-- definición débil ahora —«lleva N días sin tocarse»— daría un reporte que nadie mira a la
-- segunda semana, que es peor que no tenerlo.
--
-- Una situación por caso y en este orden: sin dueño es más grave que vencido, y vencido
-- más que sin próxima acción. Así el reporte se lee de arriba abajo y se actúa.
drop function if exists public.casos_gestion_control(text);
create function public.casos_gestion_control(p_situacion text default null)
returns table (
  id               uuid,
  numero           bigint,
  titulo           text,
  categoria        text,
  estado           text,
  urgencia         text,
  pais             text,
  gestor_id        uuid,
  gestor_nombre    text,
  proxima_accion   text,
  proxima_revision timestamptz,
  area_siguiente   text,
  situacion        text,
  actualizado_en   timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_admin() or public.es_mando_verificacion() or public.es_gestor_casos()) then
    return;
  end if;

  return query
  with base as (
    select c.id, c.numero, c.titulo, c.categoria, c.estado::text as estado,
           c.req_urgencia::text as urgencia, c.pais, c.gestor_id,
           c.proxima_accion, c.proxima_revision, c.area_siguiente, c.actualizado_en,
           case
             when c.gestor_id is null then 'sin_gestor'
             when c.proxima_revision is not null and c.proxima_revision < now() then 'vencido'
             when c.proxima_accion is null then 'sin_proxima'
             when coalesce((select ci.pct_items from public.cobertura_items_caso(c.id) ci), 0) >= 100
               then 'por_cerrar'
             else 'al_dia'
           end as situacion
      from public.casos c
     where c.categoria is distinct from 'Desaparecidos'      -- decisión 1 de la organización
       and c.estado::text not in ('resuelto', 'desestimado', 'falso')
  )
  select b.id, b.numero, b.titulo, b.categoria, b.estado, b.urgencia, b.pais,
         b.gestor_id,
         (select coalesce(nullif(btrim(p.nombre_completo), ''), 'Sin nombre')
            from public.perfiles p where p.id = b.gestor_id),
         b.proxima_accion, b.proxima_revision, b.area_siguiente, b.situacion, b.actualizado_en
    from base b
   where (p_situacion is null and b.situacion <> 'al_dia')
      or b.situacion = p_situacion
   order by case b.situacion
              when 'sin_gestor'  then 0
              when 'vencido'     then 1
              when 'sin_proxima' then 2
              when 'por_cerrar'  then 3
              else 4 end,
            b.proxima_revision nulls first,
            b.actualizado_en desc
   limit 300;
end $$;

revoke all on function public.casos_gestion_control(text) from public;
grant execute on function public.casos_gestion_control(text) to authenticated;

comment on function public.casos_gestion_control(text) is
  'Reportes de control del Gestor de Casos (0239): sin_gestor, vencido, sin_proxima y por_cerrar. Sin argumento devuelve todo lo que necesita atención. «Bloqueado» no está: exige la solicitud de información estructurada de la Fase 2.';

-- ═══ (9) Mis casos ═══
-- La bandeja del gestor: lo suyo, con lo más vencido delante.
drop function if exists public.mis_casos_gestion();
create function public.mis_casos_gestion()
returns table (
  id               uuid,
  numero           bigint,
  titulo           text,
  categoria        text,
  estado           text,
  urgencia         text,
  pais             text,
  proxima_accion   text,
  proxima_revision timestamptz,
  area_siguiente   text,
  vencido          boolean,
  actualizado_en   timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.es_verificado() then
    return;
  end if;

  return query
    select c.id, c.numero, c.titulo, c.categoria, c.estado::text, c.req_urgencia::text, c.pais,
           c.proxima_accion, c.proxima_revision, c.area_siguiente,
           (c.proxima_revision is not null and c.proxima_revision < now()),
           c.actualizado_en
      from public.casos c
     where c.gestor_id = auth.uid()
       and c.categoria is distinct from 'Desaparecidos'
       and c.estado::text not in ('resuelto', 'desestimado', 'falso')
     order by c.proxima_revision nulls first, c.actualizado_en desc
     limit 300;
end $$;

revoke all on function public.mis_casos_gestion() from public;
grant execute on function public.mis_casos_gestion() to authenticated;
