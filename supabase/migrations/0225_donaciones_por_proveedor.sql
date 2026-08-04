-- ============================================================
-- 0225 — Historial y estadísticas de lo aportado por cada proveedor
-- ------------------------------------------------------------
-- ANTES: había CUATRO registros distintos de «quién da» —`proveedores`,
-- `oportunidades` (el CRM de Alianzas), `oportunidades_donacion` y `afiliados`— y
-- ninguno enlazado entre sí. Peor aún, las dos tablas donde se anota lo que
-- efectivamente entró identifican al donante por TEXTO LIBRE y sin clave ajena:
-- `donaciones.donante` (0050) y `movimientos_acopio.donante` (0069). Por eso hoy
-- la pregunta «¿cuánto nos ha aportado esta empresa?» no tiene respuesta posible:
-- no hay forma de sumar dos filas y saber que hablan del mismo donante.
--
-- AHORA: `proveedores.id` es la clave canónica del donante (0224 ya la enlazó con
-- el CRM de Alianzas por `proveedores.oportunidad_id`), y tanto `donaciones` como
-- `movimientos_acopio` pueden apuntar a ella. Sobre esa base, la RPC
-- `historial_proveedor()` devuelve en un solo viaje la ficha estadística que
-- Logística necesita para decidir a quién pedir: cuánto ha aportado, desde cuándo,
-- de qué tipos, cómo evoluciona por mes, y qué relación hay entre lo que prometió
-- (capacidades de 0224) y lo que realmente entregó.
--
-- DE DÓNDE SALEN LOS NÚMEROS. Las estadísticas se calculan sobre
-- `casos_item_aportes` (0221), que es el único registro numérico y estructurado de
-- lo entregado, NO sobre `donaciones` —que nadie llena de forma estructurada: en
-- toda la app no existe ningún `crearDonacion`—. `donaciones` se mantiene y se
-- enlaza para no perder lo ya anotado, pero se reporta aparte y se etiqueta como
-- lo que es: un registro declarativo.
--
-- LO DE TERCEROS NUNCA CUENTA COMO APORTE DE UN PROVEEDOR. Los aportes con
-- `origen='tercero'` son de otra ONG o de un particular ajeno (0221) y se excluyen
-- de todas las sumas: atribuirlos a un proveedor nuestro falsearía justo la
-- estadística que se quiere usar para decidir.
-- Idempotente. Ejecutar tras 0224.
-- ============================================================

-- ── 1) La clave canónica del donante en los dos registros de entrada ──
-- Columnas NULLABLE: lo histórico conserva su `donante` de texto y sigue leyéndose
-- igual. Enlazar es opcional y progresivo, no una migración de datos a ciegas
-- (parsear los textos existentes para adivinar el proveedor daría falsos positivos).

alter table public.donaciones
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;

create index if not exists idx_donaciones_proveedor
  on public.donaciones (proveedor_id, creado_en desc)
  where proveedor_id is not null;

do $$
begin
  if to_regclass('public.movimientos_acopio') is not null then
    alter table public.movimientos_acopio
      add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;
    create index if not exists idx_movimientos_proveedor
      on public.movimientos_acopio (proveedor_id, creado_en desc)
      where proveedor_id is not null;
  end if;
end $$;

-- ── 2) Ficha estadística de un proveedor ──
-- Molde: `resumen_alianzas()` (0200) — un solo `jsonb_build_object` en un viaje,
-- gate propio, `revoke`/`grant`. Gate de las dos áreas: Alianzas la usa para saber
-- a quién ha convencido y Logística para saber con quién puede contar.
create or replace function public.historial_proveedor(p_proveedor uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (public.puede_logistica() or public.puede_alianzas()) then
    raise exception 'Sin permiso para el historial del proveedor.' using errcode = '42501';
  end if;

  if p_proveedor is null or not exists (select 1 from public.proveedores where id = p_proveedor) then
    raise exception 'El proveedor indicado no existe.' using errcode = '22023';
  end if;

  with aportes as (
    -- Lo REALMENTE entregado por este proveedor. `origen <> 'tercero'` es
    -- redundante con el filtro por `proveedor_id` (un aporte de tercero no lleva
    -- proveedor), pero se deja explícito para que la intención sobreviva a
    -- cualquier cambio futuro del modelo de orígenes.
    select a.id, a.cantidad, a.creado_en, a.capacidad_id,
           i.tipo::text as tipo, i.unidad, i.descripcion, i.caso_id
      from public.casos_item_aportes a
      join public.casos_items i on i.id = a.item_id
     where a.proveedor_id = p_proveedor
       and a.origen <> 'tercero'
  )
  select jsonb_build_object(
    'proveedor', (
      select jsonb_build_object(
        'id', pr.id, 'nombre', pr.nombre, 'tipo', pr.tipo,
        'activo', coalesce(pr.activo, true),
        'oportunidad_id', pr.oportunidad_id,
        'desde', pr.creado_en
      ) from public.proveedores pr where pr.id = p_proveedor
    ),

    'kpis', jsonb_build_object(
      'total_aportado',   (select coalesce(sum(cantidad), 0)          from aportes),
      'n_aportes',        (select count(*)::bigint                    from aportes),
      'n_casos',          (select count(distinct caso_id)::bigint     from aportes),
      'tipos_distintos',  (select count(distinct tipo)::bigint        from aportes),
      'primera',          (select min(creado_en)                      from aportes),
      'ultima',           (select max(creado_en)                      from aportes),
      -- Días desde la última contribución: el dato que dice si la relación sigue viva.
      'dias_sin_aportar', (select case when max(creado_en) is null then null
                                  else floor(extract(epoch from (now() - max(creado_en))) / 86400.0)::int end
                             from aportes)
    ),

    -- Peso por tipo de insumo: en qué es fuerte este proveedor.
    'por_tipo', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo, 'total', total, 'n', n)
                       order by total desc, tipo)
        from (select tipo, sum(cantidad) as total, count(*)::bigint as n
                from aportes group by tipo) t
    ), '[]'::jsonb),

    -- Evolución mes a mes (los últimos 12), para ver si crece o se apaga.
    'por_mes', coalesce((
      select jsonb_agg(jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'total', total, 'n', n)
                       order by mes)
        from (select date_trunc('month', creado_en) as mes, sum(cantidad) as total, count(*)::bigint as n
                from aportes
               where creado_en >= date_trunc('month', now()) - interval '11 months'
               group by date_trunc('month', creado_en)) m
    ), '[]'::jsonb),

    -- Lo prometido (0224) frente a lo entregado, capacidad por capacidad.
    'capacidad_vs_entregado', coalesce((
      select jsonb_agg(jsonb_build_object(
               'capacidad_id',  c.id,
               'descripcion',   c.descripcion,
               'tipo',          c.tipo::text,
               'unidad',        c.unidad,
               'periodicidad',  c.periodicidad,
               'comprometido',  c.cantidad,
               'entregado',     coalesce((select sum(a.cantidad) from aportes a where a.capacidad_id = c.id), 0),
               'restante',      public.capacidad_restante(c.id),
               'activa',        c.activa
             ) order by c.creado_en)
        from public.proveedor_capacidades c
       where c.proveedor_id = p_proveedor
    ), '[]'::jsonb),

    -- Últimas contribuciones, con el caso al que fueron a parar.
    'ultimos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', creado_en, 'cantidad', cantidad, 'unidad', unidad,
               'tipo', tipo, 'descripcion', descripcion, 'caso_id', caso_id
             ) order by creado_en desc)
        from (select * from aportes order by creado_en desc limit 20) u
    ), '[]'::jsonb),

    -- Registro declarativo aparte: lo anotado a mano en `donaciones`. Se reporta
    -- separado a propósito para no mezclar lo prometido con lo entregado.
    'donaciones_declaradas', jsonb_build_object(
      'n',     (select count(*)::bigint from public.donaciones where proveedor_id = p_proveedor),
      'monto', (select coalesce(sum(monto), 0) from public.donaciones
                 where proveedor_id = p_proveedor and tipo = 'dinero'),
      'por_estado', coalesce((
        select jsonb_object_agg(estado, n)
          from (select estado::text as estado, count(*)::bigint as n
                  from public.donaciones where proveedor_id = p_proveedor group by estado) d
      ), '{}'::jsonb)
    )
  ) into v;

  return v;
end $$;
revoke all on function public.historial_proveedor(uuid) from public;
grant execute on function public.historial_proveedor(uuid) to authenticated;

-- ── 3) Ranking de proveedores por lo aportado ──
-- Para que Logística no tenga que abrir uno a uno: quién sostiene de verdad la
-- respuesta. Mismo criterio de exclusión de terceros.
create or replace function public.ranking_proveedores(p_limite int default 20)
returns table (
  proveedor_id uuid,
  nombre       text,
  total        numeric,
  n_aportes    bigint,
  n_casos      bigint,
  ultima       timestamptz,
  activo       boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.puede_logistica() or public.puede_alianzas()) then
    return;   -- retorno vacío, no excepción (molde `seguimiento_casos`, 0209)
  end if;

  return query
    select pr.id, pr.nombre,
           coalesce(sum(a.cantidad), 0)              as total,
           count(a.id)::bigint                       as n_aportes,
           count(distinct i.caso_id)::bigint         as n_casos,
           max(a.creado_en)                          as ultima,
           coalesce(pr.activo, true)                 as activo
      from public.proveedores pr
      left join public.casos_item_aportes a
             on a.proveedor_id = pr.id and a.origen <> 'tercero'
      left join public.casos_items i on i.id = a.item_id
     group by pr.id, pr.nombre, pr.activo
     having count(a.id) > 0
     order by coalesce(sum(a.cantidad), 0) desc, pr.nombre
     limit greatest(1, least(coalesce(p_limite, 20), 100));
end $$;
revoke all on function public.ranking_proveedores(int) from public;
grant execute on function public.ranking_proveedores(int) to authenticated;
