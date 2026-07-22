-- ============================================================
-- 0205 — SLA de vencimiento de tareas: aviso agendado a la persona asignada
-- ------------------------------------------------------------
-- Las tareas ya tienen `vence_en`, pero nada avisa cuando una está por vencer o ya
-- venció. Un job horario llama a `recordar_tareas_por_vencer()`, que SOLO INSERTA en
-- `notificaciones` para la persona asignada (el Database Webhook per-row sobre
-- `notificaciones` ya envía el push y alimenta la campana — no se llama a /api/push,
-- evitando el doble envío). Cubre las que vencen dentro de 24 h y las ya vencidas
-- (no completadas ni canceladas). Anti-spam de 11 h vía `ultimo_aviso_venc`.
--
-- El agendado con pg_cron es BEST-EFFORT (como 0091/0176): si la extensión no está
-- disponible, la migración NO falla; la función queda lista para cualquier planificador.
-- Idempotente.
-- ============================================================

alter table public.tareas add column if not exists ultimo_aviso_venc timestamptz;

create or replace function public.recordar_tareas_por_vencer()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0;
begin
  with proximas as (
    select t.id, t.asignado_a, t.vence_en
    from public.tareas t
    where t.asignado_a is not null
      and t.vence_en is not null
      and t.vence_en <= now() + interval '24 hours'          -- por vencer (24 h) o ya vencida
      and t.estado not in ('completada', 'cancelada')
      and (t.ultimo_aviso_venc is null or t.ultimo_aviso_venc < now() - interval '11 hours')
  ), avisados as (
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.asignado_a, 'tarea_por_vencer',
           case when p.vence_en <= now() then 'Tarea vencida' else 'Tarea por vencer' end,
           case when p.vence_en <= now()
                then 'Una tarea que tienes asignada venció. Ábrela para avanzar o actualizar su estado.'
                else 'Una tarea que tienes asignada está por vencer. Ábrela para avanzar o actualizar su estado.'
           end,
           '/tareas/' || p.id
    from proximas p
    returning 1
  )
  select count(*) into v_n from avisados;

  -- Sella ultimo_aviso_venc en las mismas tareas (anti-spam de la próxima corrida).
  update public.tareas t
    set ultimo_aviso_venc = now()
    where t.asignado_a is not null
      and t.vence_en is not null
      and t.vence_en <= now() + interval '24 hours'
      and t.estado not in ('completada', 'cancelada')
      and (t.ultimo_aviso_venc is null or t.ultimo_aviso_venc < now() - interval '11 hours');

  return v_n;
end $$;
grant execute on function public.recordar_tareas_por_vencer() to authenticated;
comment on function public.recordar_tareas_por_vencer() is
  'SLA de tareas: avisa a la persona asignada de las tareas por vencer (24 h) o vencidas (no completadas/canceladas) insertando notificaciones. Anti-spam de 11 h vía ultimo_aviso_venc.';

-- ── Agendado horario con pg_cron (best-effort, como 0091) ──
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'tareas-por-vencer') then
    perform cron.unschedule('tareas-por-vencer');
  end if;
  perform cron.schedule('tareas-por-vencer', '0 * * * *', 'select public.recordar_tareas_por_vencer();');
exception when others then
  raise notice 'pg_cron no disponible o no se pudo agendar (%). Agenda manualmente: select cron.schedule(''tareas-por-vencer'', ''0 * * * *'', ''select public.recordar_tareas_por_vencer();'');', sqlerrm;
end $$;
