-- ============================================================
-- 0244 — Gestor Integral de Casos · Fase 4: el reloj avisa solo
-- ------------------------------------------------------------
-- LO QUE FALTABA: la Fase 1 (0239) puso una fecha de seguimiento en cada caso y la Fase 2
--   (0240) una fecha límite en cada petición de información. Las dos se ven en el tablero
--   de Control… si alguien lo abre. Un reloj que solo suena cuando vas a mirarlo no es un
--   reloj: es un calendario.
--
--   Esta migración cierra el circuito. Los tres reportes de control que EXIGEN que alguien
--   actúe —fecha vencida, petición sin llegar, caso sin responsable— pasan a buscar a esa
--   persona en vez de esperarla.
--
-- MOLDE 0091 (recordatorios de Búsqueda), con tres precedentes en el repo (0091, 0176,
--   0205): una función que solo INSERTA en `notificaciones` —el webhook per-row ya manda el
--   push y alimenta la campana, así que llamar a /api/push aquí sería enviarlo dos veces— y
--   sella un `ultimo_recordatorio` como anti-spam. El agendado con pg_cron es best-effort:
--   si la extensión no está (el Postgres pelado del CI, por ejemplo), la migración NO falla
--   y deja escrito el comando para agendarlo a mano.
--
-- UN AVISO POR PERSONA, NO UNO POR CASO. Es la diferencia con 0091 y es deliberada: un
--   gestor con diez casos vencidos recibiría diez notificaciones, y a la segunda tanda
--   silencia la campana — con lo que el aviso deja de existir justo para quien más lo
--   necesita. Aquí se agrupa: «se te vencieron 3 casos», con enlace a su bandeja.
--
-- CADA 11 HORAS Y NO CADA HORA. El job corre cada hora, pero un caso concreto no vuelve a
--   contar hasta pasadas 11 (mismo criterio que 0091). Así el aviso llega dos veces al día
--   como mucho, y lo que suma es lo NUEVO que se venció desde entonces.
--
-- UNA SOLA COLUMNA PARA DOS AVISOS: `recordatorio_gestion_en` sirve al aviso de «fecha
--   vencida» y al de «sin responsable» porque son excluyentes — el primero exige gestor y
--   el segundo exige que no lo haya—. Dos columnas para lo mismo habrían sido una
--   invitación a que se desincronizaran.
--
-- Idempotente. Ejecutar tras 0243.
-- ============================================================

-- ═══ (1) Los sellos anti-spam ═══
alter table public.casos add column if not exists recordatorio_gestion_en timestamptz;
alter table public.casos_solicitudes_info add column if not exists ultimo_recordatorio timestamptz;

comment on column public.casos.recordatorio_gestion_en is
  'Última vez que se avisó por este caso (0244), sea por fecha de seguimiento vencida o por falta de gestor. Los dos casos son excluyentes, así que comparten columna.';

-- Los índices que usa el job. Parciales: solo interesa lo que puede vencer.
create index if not exists idx_casos_recordatorio on public.casos (proxima_revision)
  where proxima_revision is not null;
create index if not exists idx_csi_recordatorio on public.casos_solicitudes_info (vence_en)
  where estado = 'abierta';

-- ═══ (2) El job ═══
create or replace function public.recordar_gestion_casos()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_total int := 0;
  v_n     int;
begin
  -- ── (a) Fecha de seguimiento vencida → a su gestor, agrupado ──
  with vencidos as (
    select c.id, c.gestor_id
      from public.casos c
     where c.gestor_id is not null
       and c.categoria is distinct from 'Desaparecidos'
       and c.estado::text not in ('resuelto', 'desestimado', 'falso')
       and c.proxima_revision is not null
       and c.proxima_revision <= now()
       and (c.recordatorio_gestion_en is null
            or c.recordatorio_gestion_en < now() - interval '11 hours')
  ), por_gestor as (
    select gestor_id, count(*)::int as n from vencidos group by gestor_id
  ), avisados as (
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select g.gestor_id, 'gestion_vencida',
           case when g.n = 1 then 'Se te venció la fecha de un caso'
                else 'Se te vencieron ' || g.n || ' casos' end,
           'Ábrelos, registra el avance y fija la siguiente fecha.',
           '/gestion-casos'
      from por_gestor g
    returning 1
  )
  select count(*)::int into v_n from avisados;
  v_total := v_total + coalesce(v_n, 0);

  -- Se sella repitiendo la condición (molde 0091): la CTE no se puede reutilizar aquí.
  update public.casos c set recordatorio_gestion_en = now()
   where c.gestor_id is not null
     and c.categoria is distinct from 'Desaparecidos'
     and c.estado::text not in ('resuelto', 'desestimado', 'falso')
     and c.proxima_revision is not null
     and c.proxima_revision <= now()
     and (c.recordatorio_gestion_en is null
          or c.recordatorio_gestion_en < now() - interval '11 hours');

  -- ── (b) Petición de información vencida → a quien la debe traer ──
  -- Si la petición nombra persona, va a esa persona. Si solo nombra área, va a quien opera
  -- esa área: es exactamente el mismo reparto que hizo `pedir_info_caso` al enviarla.
  with vencidas as (
    select s.id, s.responsable_id, s.area
      from public.casos_solicitudes_info s
     where s.estado = 'abierta'
       and s.vence_en <= now()
       and (s.ultimo_recordatorio is null
            or s.ultimo_recordatorio < now() - interval '11 hours')
  ), destinos as (
    select v.id, v.responsable_id as destinatario
      from vencidas v where v.responsable_id is not null
    union all
    select v.id, p.id
      from vencidas v
      join public.perfiles p on p.verificado
     where v.responsable_id is null
       and v.area is not null
       and exists (select 1 from unnest(public.roles_area_derivacion(v.area)) r
                    where r = p.rol or r = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[])))
  ), por_persona as (
    select destinatario, count(distinct id)::int as n from destinos group by destinatario
  ), avisados as (
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select d.destinatario, 'info_vencida',
           case when d.n = 1 then 'Te esperan un dato que ya venció'
                else 'Te esperan ' || d.n || ' datos que ya vencieron' end,
           'Cada uno tiene un caso parado detrás. Respóndelos desde «Me piden».',
           '/gestion-casos?vista=piden'
      from por_persona d
    returning 1
  )
  select count(*)::int into v_n from avisados;
  v_total := v_total + coalesce(v_n, 0);

  update public.casos_solicitudes_info s set ultimo_recordatorio = now()
   where s.estado = 'abierta'
     and s.vence_en <= now()
     and (s.ultimo_recordatorio is null
          or s.ultimo_recordatorio < now() - interval '11 hours');

  -- ── (c) Casos sin responsable → al mando de Verificación y a administración ──
  -- Con 24 h de gracia: un caso recién creado no tiene por qué tener gestor todavía, y
  -- avisar al minuto convierte el aviso en ruido desde el primer día.
  with huerfanos as (
    select c.id from public.casos c
     where c.gestor_id is null
       and c.categoria is distinct from 'Desaparecidos'
       and c.estado::text not in ('resuelto', 'desestimado', 'falso')
       and c.creado_en < now() - interval '24 hours'
       and (c.recordatorio_gestion_en is null
            or c.recordatorio_gestion_en < now() - interval '11 hours')
  ), cuenta as (
    select count(*)::int as n from huerfanos
  ), mandos as (
    -- Quien reparte: el líder y los coordinadores del grupo, más administración. Espejo
    -- de `puede_asignar_gestor()` (0241), que no se puede usar aquí porque mira la sesión.
    select g.lider_id as id from public.grupos g
     where g.clave = 'verificacion' and g.lider_id is not null
    union
    select m.perfil_id from public.miembros_grupo m
      join public.grupos g on g.id = m.grupo_id
     where g.clave = 'verificacion' and m.rol_en_grupo = 'coordinador'
    union
    select p.id from public.perfiles p
     where p.verificado and (p.rol::text = 'admin' or p.super_admin)
  ), avisados as (
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select m.id, 'casos_sin_gestor',
           case when c.n = 1 then 'Hay una solicitud sin responsable'
                else 'Hay ' || c.n || ' solicitudes sin responsable' end,
           'Mientras no tengan gestor, nadie responde por ellas. Repártelas desde Control.',
           '/gestion-casos?vista=control&situacion=sin_gestor'
      from cuenta c, mandos m
     where c.n > 0 and m.id is not null
    returning 1
  )
  select count(*)::int into v_n from avisados;
  v_total := v_total + coalesce(v_n, 0);

  update public.casos c set recordatorio_gestion_en = now()
   where c.gestor_id is null
     and c.categoria is distinct from 'Desaparecidos'
     and c.estado::text not in ('resuelto', 'desestimado', 'falso')
     and c.creado_en < now() - interval '24 hours'
     and (c.recordatorio_gestion_en is null
          or c.recordatorio_gestion_en < now() - interval '11 hours');

  return v_total;
end $$;

revoke all on function public.recordar_gestion_casos() from public;
grant execute on function public.recordar_gestion_casos() to authenticated;

comment on function public.recordar_gestion_casos() is
  'Recordatorios del Gestor de Casos (0244): fecha de seguimiento vencida, petición de información sin llegar y casos sin responsable. UN aviso por persona y no uno por caso —diez notificaciones seguidas enseñan a silenciar la campana—, con anti-spam de 11 h. Solo inserta en notificaciones: el webhook per-row ya manda el push.';

-- ═══ (3) Agendado horario con pg_cron (best-effort, molde 0091) ═══
-- El minuto 41 y no el 0: 0091 y 0205 ya corren en punto, y amontonar tres jobs en el mismo
-- minuto de cada hora es pedir un pico innecesario.
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'gestion-casos-recordatorios') then
    perform cron.unschedule('gestion-casos-recordatorios');
  end if;
  perform cron.schedule('gestion-casos-recordatorios', '41 * * * *',
                        'select public.recordar_gestion_casos();');
exception when others then
  raise notice 'pg_cron no disponible o no se pudo agendar (%). Habilita la extensión y agenda el job manualmente: select cron.schedule(''gestion-casos-recordatorios'', ''41 * * * *'', ''select public.recordar_gestion_casos();'');', sqlerrm;
end $$;
