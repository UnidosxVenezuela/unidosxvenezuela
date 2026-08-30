-- Pruebas de 0244 — los recordatorios del Gestor de Casos.
--
-- Lo que hay que dejar clavado:
--   · que avisa a quien tiene que actuar, y no a quien no;
--   · que agrupa —UN aviso por persona, no uno por caso—, que es la diferencia con 0091 y
--     la razón de que la campana siga sirviendo cuando alguien lleva diez casos vencidos;
--   · que el anti-spam funciona: la segunda corrida seguida no manda nada.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql y de pruebas_gestor_0239.sql.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_rec (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_rec (nombre) values (nom); end if;
end $$;

-- ── Semilla: dos casos vencidos de la MISMA gestora, y uno sin gestor ──
set session_replication_role = replica;

insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                          req_tipo, req_cantidad, req_urgencia, pais, gestor_id,
                          proxima_revision, creado_en)
values
  ('f6000000-0000-4000-8000-00000000000a','Vencido uno','desc', null, true,'confirmado',
   'aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE',
   'aaaa9999-9999-4999-8999-999999999999', now() - interval '2 hours', now() - interval '5 days'),
  ('f6000000-0000-4000-8000-00000000000b','Vencido dos','desc', null, true,'confirmado',
   'aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE',
   'aaaa9999-9999-4999-8999-999999999999', now() - interval '3 hours', now() - interval '5 days'),
  -- Sin gestor y con más de 24 h: entra en el aviso de «sin responsable».
  ('f6000000-0000-4000-8000-00000000000c','Huérfano','desc', null, true,'confirmado',
   'aaaa0000-0000-4000-8000-00000000000a','alimentos','10','baja','VE',
   null, null, now() - interval '3 days'),
  -- Al día: no debe generar nada.
  ('f6000000-0000-4000-8000-00000000000d','Al día','desc', null, true,'confirmado',
   'aaaa0000-0000-4000-8000-00000000000a','alimentos','10','baja','VE',
   'aaaa9999-9999-4999-8999-999999999999', now() + interval '2 days', now() - interval '5 days')
on conflict (id) do nothing;

-- Una petición de información vencida, dirigida a Logística por área.
insert into public.casos_solicitudes_info
  (id, caso_id, dato, area, vence_en, solicitada_por, solicitante_sello, estado)
values ('eeee0000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-00000000000a',
        'El acta firmada','logistica', now() - interval '4 hours',
        'aaaa9999-9999-4999-8999-999999999999','Gina Gestora','abierta')
on conflict (id) do nothing;

-- Se limpia el buzón de los implicados para poder contar sin ruido de otras suites.
delete from public.notificaciones
 where destinatario_id in ('aaaa9999-9999-4999-8999-999999999999',
                           'aaaa3333-3333-4333-8333-333333333333',
                           'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

set session_replication_role = origin;

-- ═══ T1 — LO QUE IMPORTA: agrupa. Dos casos vencidos, UN aviso ═══
do $$
declare v_total int; v_n int; v_titulo text;
begin
  select public.recordar_gestion_casos() into v_total;
  perform pg_temp.ok('T1 el job manda avisos', v_total > 0);

  select count(*) into v_n from public.notificaciones
   where destinatario_id = 'aaaa9999-9999-4999-8999-999999999999' and tipo = 'gestion_vencida';
  perform pg_temp.ok('T1 con dos casos vencidos la gestora recibe UNO solo', v_n = 1);

  select titulo into v_titulo from public.notificaciones
   where destinatario_id = 'aaaa9999-9999-4999-8999-999999999999' and tipo = 'gestion_vencida';
  perform pg_temp.ok('T1 y el aviso dice cuántos son', v_titulo like '%2 casos%');
end $$;

-- ═══ T2 — La petición vencida le llega a quien la debe traer ═══
do $$
declare v_n int;
begin
  select count(*) into v_n from public.notificaciones
   where destinatario_id = 'aaaa3333-3333-4333-8333-333333333333' and tipo = 'info_vencida';
  perform pg_temp.ok('T2 a Logística le avisan del dato que debe', v_n = 1);

  -- Y no le llega a quien no opera esa área.
  select count(*) into v_n from public.notificaciones
   where destinatario_id = 'aaaa7777-7777-4777-8777-777777777777' and tipo = 'info_vencida';
  perform pg_temp.ok('T2 y a quien no opera el área, no', v_n = 0);
end $$;

-- ═══ T3 — El caso sin responsable llega al mando ═══
do $$
declare v_n int;
begin
  select count(*) into v_n from public.notificaciones
   where destinatario_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and tipo = 'casos_sin_gestor';
  perform pg_temp.ok('T3 el líder de Verificación se entera de los casos sin gestor', v_n = 1);
end $$;

-- ═══ T4 — ANTI-SPAM: la segunda corrida seguida no manda nada ═══
-- Es lo que evita que el job horario convierta la campana en ruido.
do $$
declare v_total int; v_n int;
begin
  select public.recordar_gestion_casos() into v_total;
  perform pg_temp.ok('T4 la segunda corrida no manda nada', v_total = 0);

  select count(*) into v_n from public.notificaciones
   where destinatario_id = 'aaaa9999-9999-4999-8999-999999999999' and tipo = 'gestion_vencida';
  perform pg_temp.ok('T4 y la gestora sigue con un solo aviso', v_n = 1);
end $$;

-- ═══ T5 — El sello quedó puesto ═══
do $$
declare v_sello timestamptz; v_nulo timestamptz;
begin
  select recordatorio_gestion_en into v_sello from public.casos
   where id = 'f6000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T5 el caso vencido queda sellado', v_sello is not null);

  -- El caso al día no se toca: no vencía, así que no había nada que avisar ni que sellar.
  select recordatorio_gestion_en into v_nulo from public.casos
   where id = 'f6000000-0000-4000-8000-00000000000d';
  perform pg_temp.ok('T5 y el caso al día no se sella', v_nulo is null);
end $$;

-- ═══ T6 — Pasadas las 11 horas vuelve a avisar ═══
do $$
declare v_total int; v_n int;
begin
  set session_replication_role = replica;
  update public.casos set recordatorio_gestion_en = now() - interval '12 hours'
   where id in ('f6000000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-00000000000b');
  set session_replication_role = origin;

  select public.recordar_gestion_casos() into v_total;
  perform pg_temp.ok('T6 pasadas 11 h vuelve a avisar', v_total > 0);

  select count(*) into v_n from public.notificaciones
   where destinatario_id = 'aaaa9999-9999-4999-8999-999999999999' and tipo = 'gestion_vencida';
  perform pg_temp.ok('T6 y ahora la gestora tiene dos avisos', v_n = 2);
end $$;

-- ═══ T7 — Desaparecidos, fuera también del recordatorio ═══
do $$
declare v_n int;
begin
  set session_replication_role = replica;
  update public.casos
     set gestor_id = 'aaaa9999-9999-4999-8999-999999999999',
         proxima_revision = now() - interval '5 hours',
         recordatorio_gestion_en = null
   where id = 'f2000000-0000-4000-8000-00000000000c';   -- el de Desaparecidos (0239)
  update public.casos set recordatorio_gestion_en = now()
   where id in ('f6000000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-00000000000b');
  delete from public.notificaciones
   where destinatario_id = 'aaaa9999-9999-4999-8999-999999999999' and tipo = 'gestion_vencida';
  set session_replication_role = origin;

  perform public.recordar_gestion_casos();
  select count(*) into v_n from public.notificaciones
   where destinatario_id = 'aaaa9999-9999-4999-8999-999999999999' and tipo = 'gestion_vencida';
  perform pg_temp.ok('T7 un caso de Desaparecidos no genera recordatorio', v_n = 0);
end $$;

-- ═══ T8 — ACL ═══
do $$
declare v_f text := 'public.recordar_gestion_casos()';
begin
  perform pg_temp.ok('T8 PUBLIC no ejecuta el job',
    not has_function_privilege('public', v_f, 'execute'));
  perform pg_temp.ok('T8 anon tampoco',
    not has_function_privilege('anon', v_f, 'execute'));
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_rec;
  if v_n > 0 then
    raise exception 'PRUEBAS DE RECORDATORIOS (0244) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DE RECORDATORIOS (0244) PASARON ==';
end $$;
