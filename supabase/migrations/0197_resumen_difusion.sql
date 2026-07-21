-- ============================================================
-- 0197 — Analítica del pipeline de difusión: confirmado_en + RPC resumen_difusion()
-- ------------------------------------------------------------
-- Redes/Redacción no tenían medición del pipeline de difusión: cuántas piezas se
-- publican por canal, cuánto tarda una solicitud desde que se CONFIRMA hasta que se
-- PUBLICA, y cuántas confirmadas siguen sin publicar (la cola). Este corte lo da la
-- RPC `resumen_difusion()` (gate Redacción/Redes/admin, como la policy de 0190).
--
-- Para el «plazo desde confirmación» hacía falta un sello temporal de la confirmación
-- (no existía: el historial 0178 no registra cambios de estado). Se agrega
-- `casos.confirmado_en`, lo sella un trigger al pasar a un estado confirmado (mismo
-- molde que `sellar_comprometida_ofrecimiento`, 0193) y se hace un backfill
-- best-effort desde `creado_en` para las ya confirmadas (tiempo desde el ingreso;
-- de aquí en adelante es el instante real de confirmación). Idempotente. Tras 0196.
-- ============================================================

alter table public.casos add column if not exists confirmado_en timestamptz;

-- Sella la confirmación al entrar (por primera vez) a un estado ya verificado.
create or replace function public.sellar_confirmado_caso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado::text in ('confirmado', 'enviado_redaccion', 'resuelto')
     and new.confirmado_en is null
     and (tg_op = 'INSERT' or old.estado is distinct from new.estado) then
    new.confirmado_en := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_sellar_confirmado_caso on public.casos;
create trigger trg_sellar_confirmado_caso
  before insert or update of estado on public.casos
  for each row execute function public.sellar_confirmado_caso();

-- Backfill best-effort de las ya confirmadas (idempotente: solo las que faltan).
update public.casos
   set confirmado_en = creado_en
 where estado::text in ('confirmado', 'enviado_redaccion', 'resuelto')
   and confirmado_en is null;

-- ── RPC: analítica del pipeline de difusión ──
create or replace function public.resumen_difusion()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion')) then
    raise exception 'Sin permiso para la analítica de difusión.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- Publicaciones por canal (piezas publicadas y pendientes por red).
    'por_canal', coalesce((
      select jsonb_agg(jsonb_build_object('canal', canal, 'publicadas', publicadas, 'pendientes', pendientes)
                       order by publicadas desc, canal)
      from (
        select canal,
               count(*) filter (where estado_canal = 'publicado')::bigint as publicadas,
               count(*) filter (where estado_canal = 'pendiente')::bigint as pendientes
        from public.casos_publicaciones
        group by canal
      ) c), '[]'::jsonb),

    -- Cola: confirmadas aún sin publicar (backlog) + antigüedad de la espera.
    'pendientes', jsonb_build_object(
      'total', (select count(*) from public.casos c
                where c.categoria is distinct from 'Desaparecidos'
                  and c.estado::text in ('confirmado', 'enviado_redaccion')
                  and c.publicado_en is null),
      'espera_prom_horas', (select round(avg(extract(epoch from (now() - confirmado_en)) / 3600.0)::numeric, 1)
                from public.casos c
                where c.categoria is distinct from 'Desaparecidos'
                  and c.estado::text in ('confirmado', 'enviado_redaccion')
                  and c.publicado_en is null and c.confirmado_en is not null),
      'espera_max_horas', (select round((max(extract(epoch from (now() - confirmado_en))) / 3600.0)::numeric, 1)
                from public.casos c
                where c.categoria is distinct from 'Desaparecidos'
                  and c.estado::text in ('confirmado', 'enviado_redaccion')
                  and c.publicado_en is null and c.confirmado_en is not null)),

    -- Plazo de publicación (confirmación → publicado), sobre las ya publicadas.
    'plazo', jsonb_build_object(
      'publicadas', (select count(*) from public.casos c
                where c.categoria is distinct from 'Desaparecidos' and c.publicado_en is not null),
      'prom_horas', (select round(avg(extract(epoch from (publicado_en - confirmado_en)) / 3600.0)::numeric, 1)
                from public.casos c
                where c.categoria is distinct from 'Desaparecidos'
                  and c.publicado_en is not null and c.confirmado_en is not null
                  and c.publicado_en >= c.confirmado_en),
      'mediana_horas', (select round((percentile_cont(0.5) within group (
                          order by extract(epoch from (publicado_en - confirmado_en)) / 3600.0))::numeric, 1)
                from public.casos c
                where c.categoria is distinct from 'Desaparecidos'
                  and c.publicado_en is not null and c.confirmado_en is not null
                  and c.publicado_en >= c.confirmado_en)),

    -- KPIs de cabecera.
    'kpis', jsonb_build_object(
      'publicadas', (select count(*) from public.casos c
                where c.categoria is distinct from 'Desaparecidos' and c.publicado_en is not null),
      'piezas_por_canal', (select count(*) from public.casos_publicaciones where estado_canal = 'publicado'),
      'canales_activos', (select count(distinct canal) from public.casos_publicaciones where estado_canal = 'publicado'),
      'sin_publicar', (select count(*) from public.casos c
                where c.categoria is distinct from 'Desaparecidos'
                  and c.estado::text in ('confirmado', 'enviado_redaccion')
                  and c.publicado_en is null))
  ) into v;

  return v;
end $$;

revoke all on function public.resumen_difusion() from public;
grant execute on function public.resumen_difusion() to authenticated;
