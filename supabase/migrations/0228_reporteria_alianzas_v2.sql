-- ============================================================
-- 0228 — La reportería de Alianzas mide todo el departamento, no solo el CRM
-- ------------------------------------------------------------
-- ANTES `resumen_alianzas()` (0200, con el gate ampliado en 0226) solo miraba la
-- tabla `oportunidades`: cuántas empresas, por estado, rubro y score. Se quedaba
-- corta en cuatro frentes que sí existen y nadie estaba midiendo:
--   · AFILIACIÓN — la tabla `afiliados` (0198) es un tercio del departamento y
--     tenía CERO cobertura en el reporte.
--   · ESCALADO — `escalado_alianzas` y `voluntariado_profesional` (0200) tienen sus
--     índices parciales creados desde entonces y nadie los consultaba: es
--     justamente el trabajo que Logística le pasa al departamento.
--   · CORREO — el registro de envíos de 0217, que es la actividad de contacto real.
--   · CAPACIDAD — lo comprometido por los aliados en 0224 frente a lo entregado,
--     que es la medida de si una alianza sirvió de algo.
--
-- AHORA se añaden esas cuatro claves más `por_origen` y `transporte`, conservando
-- LAS CUATRO ANTERIORES intactas para no romper la página ni el CSV existentes.
--
-- FIRMA SIN ARGUMENTOS, a propósito: `create or replace` conserva
-- `resumen_alianzas()`. Añadirle `p_desde`/`p_hasta` obligaría a `drop function`,
-- reemitir `revoke`/`grant` y tocar `lib/export/alianzas.ts`. Se mantiene el gate
-- que 0226 dejó (Alianzas o Logística, por la consulta cruzada).
--
-- Los tipos de `lib/export/alianzas.ts` son todos opcionales y la página usa
-- `?? 0`, así que añadir claves no rompe nada aunque el TS no se actualice.
-- Idempotente. Ejecutar tras 0227.
-- ============================================================

create or replace function public.resumen_alianzas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (public.puede_alianzas() or public.puede_logistica()) then
    raise exception 'Sin permiso para el reporte de Alianzas.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- ── Las cuatro claves de 0200, sin tocar ──
    'kpis', jsonb_build_object(
      'total_empresas',      (select count(*) from public.oportunidades),
      'verificadas',         (select count(*) from public.oportunidades where estado in ('verificado', 'enviado')),
      'enviadas_logistica',  (select count(*) from public.oportunidades where estado = 'enviado'),
      'en_investigacion',    (select count(*) from public.oportunidades where estado = 'investigacion'),
      'con_capacidad',       (select count(*) from public.oportunidades where volumen is not null or capacidades is not null),
      'prom_dias_verificado', (
        select round(avg(extract(epoch from (verificado_en - creado_en)) / 86400.0)::numeric, 1)
        from public.oportunidades where verificado_en is not null
      ),
      -- Añadidos al bloque de indicadores (la página los pinta con `?? 0`).
      'afiliados',           (select count(*) from public.afiliados),
      'aliados_productivos', (select count(distinct a.proveedor_id)
                                from public.casos_item_aportes a
                               where a.proveedor_id is not null and a.origen <> 'tercero')
    ),

    'por_estado', coalesce((
      select jsonb_object_agg(estado, n) from (
        select estado, count(*)::bigint as n from public.oportunidades group by estado
      ) s), '{}'::jsonb),

    'por_rubro', coalesce((
      select jsonb_object_agg(rubro, n) from (
        select coalesce(nullif(trim(rubro), ''), 'Sin especificar') as rubro, count(*)::bigint as n
        from public.oportunidades group by coalesce(nullif(trim(rubro), ''), 'Sin especificar')
      ) r), '{}'::jsonb),

    'por_score', coalesce((
      select jsonb_object_agg(score, n) from (
        select coalesce(score_confiabilidad::text, 'sin') as score, count(*)::bigint as n
        from public.oportunidades group by coalesce(score_confiabilidad::text, 'sin')
      ) sc), '{}'::jsonb),

    -- ── Afiliación: el tercio del departamento que no se medía ──
    'afiliados', jsonb_build_object(
      'total',      (select count(*) from public.afiliados),
      'activos',    (select count(*) from public.afiliados where estado = 'activo'),
      'con_cuenta', (select count(*) from public.afiliados where perfil_id is not null),
      'por_tipo', coalesce((
        select jsonb_object_agg(tipo, n)
          from (select tipo, count(*)::bigint as n from public.afiliados group by tipo) t
      ), '{}'::jsonb),
      'por_cargo', coalesce((
        select jsonb_agg(jsonb_build_object('cargo', cargo, 'n', n) order by n desc, cargo)
          from (select coalesce(nullif(trim(cargo), ''), 'Sin especificar') as cargo, count(*)::bigint as n
                  from public.afiliados
                 group by coalesce(nullif(trim(cargo), ''), 'Sin especificar')
                 order by count(*) desc
                 limit 15) c
      ), '[]'::jsonb)
    ),

    -- ── Escalado: lo que Logística no pudo cubrir y pasó al departamento ──
    'escalado', jsonb_build_object(
      'a_alianzas',          (select count(*) from public.solicitudes_insumo where escalado_alianzas),
      'voluntariado',        (select count(*) from public.solicitudes_insumo where voluntariado_profesional),
      'escalado_pendiente',  (select count(*) from public.solicitudes_insumo
                               where escalado_alianzas and estado::text not in ('entregado', 'cancelado')),
      'escalado_resuelto',   (select count(*) from public.solicitudes_insumo
                               where escalado_alianzas and estado::text = 'entregado')
    ),

    -- ── De dónde vienen las empresas (prospección activa vs. captación entrante) ──
    'por_origen', coalesce((
      select jsonb_object_agg(origen, n)
        from (select coalesce(origen, 'sin_especificar') as origen, count(*)::bigint as n
                from public.oportunidades group by coalesce(origen, 'sin_especificar')) o
    ), '{}'::jsonb),

    'transporte', jsonb_build_object(
      'con_transporte', (select count(*) from public.oportunidades where transporte),
      'sin_transporte', (select count(*) from public.oportunidades where not transporte)
    ),

    -- ── Correo institucional (0217): la actividad de contacto real ──
    'correos', jsonb_build_object(
      'total',    (select count(*) from public.correo_envios),
      'enviados', (select count(*) from public.correo_envios where estado = 'enviado'),
      'fallidos', (select count(*) from public.correo_envios where estado = 'fallido'),
      'ultimo',   (select max(enviado_en) from public.correo_envios where estado = 'enviado'),
      'por_plantilla', coalesce((
        select jsonb_agg(jsonb_build_object('plantilla', nombre, 'n', n) order by n desc, nombre)
          from (select coalesce(p.nombre, 'Sin plantilla') as nombre, count(*)::bigint as n
                  from public.correo_envios e
                  left join public.correo_plantillas p on p.id = e.plantilla_id
                 group by coalesce(p.nombre, 'Sin plantilla')) pl
      ), '[]'::jsonb)
    ),

    -- ── Capacidad comprometida (0224) frente a lo realmente entregado (0221) ──
    -- La medida de si una alianza sirvió: prometer no es entregar.
    'capacidad', jsonb_build_object(
      'compromisos',  (select count(*) from public.proveedor_capacidades where activa),
      'proveedores',  (select count(distinct proveedor_id) from public.proveedor_capacidades where activa),
      'comprometido', (select coalesce(sum(cantidad), 0) from public.proveedor_capacidades where activa),
      'restante',     (select coalesce(sum(public.capacidad_restante(id)), 0)
                         from public.proveedor_capacidades where activa),
      'entregado',    (select coalesce(sum(a.cantidad), 0)
                         from public.casos_item_aportes a
                        where a.capacidad_id is not null and a.origen <> 'tercero'),
      'recurrentes',  (select count(*) from public.proveedor_capacidades
                        where activa and periodicidad <> 'unica'),
      'puntuales',    (select count(*) from public.proveedor_capacidades
                        where activa and periodicidad = 'unica')
    )
  ) into v;

  return v;
end $$;
revoke all on function public.resumen_alianzas() from public;
grant execute on function public.resumen_alianzas() to authenticated;
