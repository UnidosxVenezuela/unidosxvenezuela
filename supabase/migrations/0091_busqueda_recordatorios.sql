-- ============================================================
-- 0091 — Búsqueda Fase 4: recordatorios de seguimiento (12–24h) vía pg_cron
-- ------------------------------------------------------------
-- Cada caso activo tiene una `proxima_revision` (SLA de seguimiento). Un job horario
-- llama a `recordar_revisiones_busqueda()`, que SOLO INSERTA en `notificaciones` para
-- el buscador asignado (el Database Webhook per-row sobre `notificaciones` ya envía el
-- push y alimenta la campana — NO se llama a /api/push, evitando el doble envío que
-- señaló la revisión adversarial). Un anti-spam de 11h evita repetir el aviso.
--
-- El agendado con pg_cron es BEST-EFFORT: si la extensión no está disponible en el
-- entorno (p. ej. el CI de Postgres puro), la migración NO falla; se deja el job por
-- agendar y la función queda lista para cualquier planificador. Idempotente.
-- Ejecutar tras 0090.
-- ============================================================

-- ── Función de recordatorios: solo inserta en notificaciones + sella anti-spam ──
create or replace function public.recordar_revisiones_busqueda()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0;
begin
  with vencidas as (
    select bc.caso_id, c.asignado_a
    from public.busqueda_casos bc
    join public.casos c on c.id = bc.caso_id
    where bc.estado_busqueda in ('activo', 'en_revision')
      and bc.proxima_revision <= now()
      and (bc.ultimo_recordatorio is null or bc.ultimo_recordatorio < now() - interval '11 hours')
      and c.asignado_a is not null
  ), avisados as (
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select v.asignado_a, 'busqueda_revision', 'Caso de búsqueda por revisar',
           'Un caso de persona desaparecida que trabajas necesita seguimiento. Ábrelo y registra tu avance.',
           '/busqueda/' || v.caso_id
    from vencidas v
    returning 1
  )
  select count(*) into v_n from avisados;

  -- Sella ultimo_recordatorio en los mismos casos (anti-spam de la próxima corrida).
  update public.busqueda_casos bc
    set ultimo_recordatorio = now()
    from public.casos c
    where c.id = bc.caso_id
      and bc.estado_busqueda in ('activo', 'en_revision')
      and bc.proxima_revision <= now()
      and (bc.ultimo_recordatorio is null or bc.ultimo_recordatorio < now() - interval '11 hours')
      and c.asignado_a is not null;

  return v_n;
end $$;
grant execute on function public.recordar_revisiones_busqueda() to authenticated;
comment on function public.recordar_revisiones_busqueda() is
  'Recordatorios de seguimiento del Grupo de Búsqueda: inserta notificaciones (el webhook envía el push) y sella ultimo_recordatorio. Anti-spam de 11h.';

-- ── Agendado horario con pg_cron (best-effort) ──
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'revisiones-busqueda') then
    perform cron.unschedule('revisiones-busqueda');
  end if;
  perform cron.schedule('revisiones-busqueda', '0 * * * *', 'select public.recordar_revisiones_busqueda();');
exception when others then
  raise notice 'pg_cron no disponible o no se pudo agendar (%). Habilita la extensión y agenda el job manualmente: select cron.schedule(''revisiones-busqueda'', ''0 * * * *'', ''select public.recordar_revisiones_busqueda();'');', sqlerrm;
end $$;
