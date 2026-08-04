-- ============================================================
-- 0227 — Reportería de Logística (no existía) + sello de la entrega
-- ------------------------------------------------------------
-- ANTES Logística era la única área operativa grande sin reportería: /reportes
-- tenía Alianzas (0200), SITREP (0196) y Difusión (0197), pero nada del área que
-- mueve los insumos. No había forma de responder cuánto se entrega, en cuánto
-- tiempo, con qué cobertura real ni quién sostiene la respuesta.
--
-- Y MEDIR PLAZOS ERA IMPOSIBLE: no existía ningún sello del momento de la entrega.
-- `actualizado_en` se toca en cada edición, así que restarle `creado_en` no mide el
-- plazo de entrega sino «cuándo se tocó por última vez». Se añade
-- `solicitudes_insumo.entregado_en`, lo sella un trigger EN LA TRANSICIÓN a
-- 'entregado' (no en cada UPDATE), y se hace un backfill best-effort desde
-- `actualizado_en` solo donde falta —lo histórico queda aproximado y de aquí en
-- adelante es el instante real, mismo criterio que `confirmado_en` en 0197—.
--
-- LO CUBIERTO POR TERCEROS VA SIEMPRE APARTE. `cobertura_items_caso` (0221)
-- devuelve `cubierto` y `cubierto_tercero` por separado y aquí se reportan como
-- dos cosas distintas: lo que cubrió otra ONG o un particular no es capacidad de
-- respuesta de la organización, y sumarlo daría exactamente la lectura inflada que
-- el equipo pidió evitar.
--
-- El gate usa los HELPERS (`puede_logistica()` incluye al mando del grupo desde
-- 0214) y se abre también a Alianzas, que necesita ver el rendimiento del área a la
-- que le consigue los recursos (0226).
-- Idempotente. Ejecutar tras 0226.
-- ============================================================

-- ── 1) Sello de la entrega ──
alter table public.solicitudes_insumo add column if not exists entregado_en timestamptz;

create or replace function public.sellar_entregado_insumo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo en la TRANSICIÓN a 'entregado' (o en un INSERT que ya nazca entregado).
  -- Un UPDATE cualquiera sobre una solicitud ya entregada no re-sella.
  if new.estado::text = 'entregado'
     and new.entregado_en is null
     and (tg_op = 'INSERT' or old.estado is distinct from new.estado) then
    new.entregado_en := now();
  end if;
  return new;
end $$;

-- Devuelve `trigger`, así que PostgREST no la expone como RPC; se revoca igual por
-- higiene, para que la regla «toda función SECURITY DEFINER lleva su revoke» no
-- tenga excepciones que haya que razonar caso por caso.
revoke all on function public.sellar_entregado_insumo() from public;

drop trigger if exists trg_sellar_entregado_insumo on public.solicitudes_insumo;
create trigger trg_sellar_entregado_insumo
  before insert or update of estado on public.solicitudes_insumo
  for each row execute function public.sellar_entregado_insumo();

-- Backfill best-effort: solo las ya entregadas a las que les falta el sello.
update public.solicitudes_insumo
   set entregado_en = actualizado_en
 where estado::text = 'entregado'
   and entregado_en is null;

create index if not exists idx_solins_entregado_en
  on public.solicitudes_insumo (entregado_en desc)
  where entregado_en is not null;

-- ── 2) La foto agregada del área ──
create or replace function public.resumen_logistica()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (public.puede_logistica() or public.puede_alianzas()) then
    raise exception 'Sin permiso para el reporte de Logística.' using errcode = '42501';
  end if;

  with sol as (
    select s.id, s.estado::text as estado, s.tipo::text as tipo, s.caso_id,
           s.creado_en, s.entregado_en, s.proveedor_id,
           s.escalado_alianzas, s.voluntariado_profesional
      from public.solicitudes_insumo s
  ),
  -- Cobertura real por caso, medida SOLO sobre lo derivado a Logística (0222):
  -- si Verificación repartió el desglose entre varias áreas, el rendimiento del
  -- área no puede medirse contra ítems que nunca fueron suyos.
  cob as (
    select s.id,
           c.n_items, c.n_cumplidos, c.n_terceros,
           c.total, c.cubierto, c.cubierto_tercero
      from sol s
      cross join lateral public.cobertura_items_caso(s.caso_id, 'logistica') c
     where s.caso_id is not null
  ),
  plazos as (
    select extract(epoch from (entregado_en - creado_en)) / 3600.0 as horas
      from sol
     where entregado_en is not null and entregado_en >= creado_en
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_solicitudes', (select count(*) from sol),
      'activas',           (select count(*) from sol where estado not in ('entregado', 'cancelado')),
      'entregadas',        (select count(*) from sol where estado = 'entregado'),
      'canceladas',        (select count(*) from sol where estado = 'cancelado'),
      'no_disponibles',    (select count(*) from sol where estado = 'no_disponible'),
      'con_desglose',      (select count(*) from cob where n_items > 0),
      'creadas_por_area',  (select count(*) from public.casos
                             where origen_area = 'logistica' and caso_padre_id is null),
      'proveedores_activos', (select count(distinct proveedor_id) from sol where proveedor_id is not null)
    ),

    'por_estado', coalesce((
      select jsonb_object_agg(estado, n)
        from (select estado, count(*)::bigint as n from sol group by estado) e
    ), '{}'::jsonb),

    'por_tipo', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo, 'n', n, 'entregadas', entregadas)
                       order by n desc, tipo)
        from (select tipo, count(*)::bigint as n,
                     count(*) filter (where estado = 'entregado')::bigint as entregadas
                from sol group by tipo) t
    ), '[]'::jsonb),

    -- Cobertura de ítems: cuánto de lo pedido se cubrió, y cuánto de eso lo puso
    -- un tercero. Las dos cifras van separadas a propósito.
    'cobertura_items', jsonb_build_object(
      'items_totales',     (select coalesce(sum(n_items), 0)         from cob),
      'items_cumplidos',   (select coalesce(sum(n_cumplidos), 0)     from cob),
      'items_por_tercero', (select coalesce(sum(n_terceros), 0)      from cob),
      'cantidad_pedida',   (select coalesce(sum(total), 0)           from cob),
      'cantidad_cubierta', (select coalesce(sum(cubierto), 0)        from cob),
      'cantidad_terceros', (select coalesce(sum(cubierto_tercero), 0) from cob),
      'pct_cubierto', (
        select case when coalesce(sum(total), 0) = 0 then null
               else round(sum(cubierto) / sum(total) * 100, 1) end from cob
      ),
      -- Lo cubierto por la organización, descontando terceros: la capacidad propia.
      'pct_propio', (
        select case when coalesce(sum(total), 0) = 0 then null
               else round(greatest(sum(cubierto) - sum(cubierto_tercero), 0) / sum(total) * 100, 1) end
          from cob
      )
    ),

    'plazos', jsonb_build_object(
      'medidas',       (select count(*) from plazos),
      'prom_horas',    (select round(avg(horas)::numeric, 1) from plazos),
      'mediana_horas', (select round(percentile_cont(0.5) within group (order by horas)::numeric, 1) from plazos),
      'max_horas',     (select round(max(horas)::numeric, 1) from plazos)
    ),

    -- Quién sostiene la respuesta (0225). Excluye los aportes de terceros.
    'top_proveedores', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre, 'total', total, 'n_aportes', n_aportes)
                       order by total desc)
        from (select pr.nombre, sum(a.cantidad) as total, count(*)::bigint as n_aportes
                from public.casos_item_aportes a
                join public.proveedores pr on pr.id = a.proveedor_id
               where a.origen <> 'tercero'
               group by pr.nombre
               order by sum(a.cantidad) desc
               limit 10) p
    ), '[]'::jsonb),

    -- Lo que Logística no pudo cubrir y escaló a Alianzas (0200).
    'escalados', jsonb_build_object(
      'a_alianzas',   (select count(*) from sol where escalado_alianzas),
      'voluntariado', (select count(*) from sol where voluntariado_profesional)
    ),

    -- Capacidad viva declarada por los aliados (0224): con qué se cuenta hoy.
    'capacidad', jsonb_build_object(
      'compromisos', (select count(*) from public.proveedor_capacidades where activa),
      'proveedores', (select count(distinct proveedor_id) from public.proveedor_capacidades where activa),
      'restante',    (select coalesce(sum(public.capacidad_restante(id)), 0)
                        from public.proveedor_capacidades where activa)
    )
  ) into v;

  return v;
end $$;
revoke all on function public.resumen_logistica() from public;
grant execute on function public.resumen_logistica() to authenticated;
