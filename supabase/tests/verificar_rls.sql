-- ============================================================
-- Pruebas de RLS (seguridad). Sin pgTAP: aserciones en plpgsql que
-- abortan (exit != 0) si algo falla. Todo corre en transacciones que
-- se revierten (no deja datos).
--
-- Requisito: que exista al menos un admin verificado (toma uno como
-- "actor" y lo degrada DENTRO de la transacción para simular usuarios).
-- Correr:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/verificar_rls.sql
-- ============================================================
\set ON_ERROR_STOP on

select id as admin from public.perfiles where rol = 'admin' and verificado
  order by creado_en limit 1 \gset

\echo '== Test 1: un no-coordinador NO puede subir su propio rol =='
begin;
  update public.perfiles set rol = 'voluntario' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  begin
    begin
      update public.perfiles set rol = 'admin'
        where id = (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
      raise exception 'FALLO: un no-coordinador logró ponerse rol=admin';
    exception
      when others then
        if sqlerrm like 'FALLO:%' then raise; end if;  -- re-lanza el fallo real
    end;  -- cualquier otro error (el trigger) = comportamiento esperado
  end $$;
rollback;

\echo '== Test 2: un voluntario NO puede crear tareas =='
begin;
  update public.perfiles set rol = 'voluntario' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    begin
      insert into public.tareas (titulo, creado_por) values ('x', v_uid);
      raise exception 'FALLO: un voluntario logró crear una tarea';
    exception
      when others then
        if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 3: un usuario NO verificado no ve grupos =='
begin;
  insert into public.grupos (nombre, area) values ('GRUPO _TEST_RLS', 'salud');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111')::text, true);
  do $$
  declare n int;
  begin
    select count(*) into n from public.grupos;
    if n <> 0 then raise exception 'FALLO: un no verificado vio % grupos (esperado 0)', n; end if;
  end $$;
rollback;

\echo '== Test 4: un no verificado no puede tomar una tarea abierta =='
begin;
  insert into public.tareas (titulo, estado, creado_por) values ('TAREA _TEST_RLS', 'pendiente', :'admin');
  update public.perfiles set rol = 'voluntario', verificado = false where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  begin
    begin
      perform public.tomar_tarea((select id from public.tareas where titulo = 'TAREA _TEST_RLS'));
      raise exception 'FALLO: un no verificado logró tomar una tarea';
    exception
      when others then
        if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

-- ══ Modelo por función (0055–0058) ══

\echo '== Test 5: un voluntario NO puede crear grupos (solo admin) =='
begin;
  update public.perfiles set rol = 'voluntario' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    begin
      insert into public.grupos (nombre, area, lider_id) values ('_TEST_pirata', 'salud', v_uid);
      raise exception 'FALLO: un voluntario creó un grupo autonombrándose líder';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 6: un verificado NO ve grupos de los que no es miembro =='
begin;
  insert into public.grupos (nombre, area) values ('_TEST_ajeno', 'salud');
  update public.perfiles set rol = 'voluntario', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int;
  begin
    select count(*) into n from public.grupos where nombre = '_TEST_ajeno';
    if n <> 0 then raise exception 'FALLO: un no-miembro vio un grupo ajeno'; end if;
  end $$;
rollback;

\echo '== Test 7: Gestión de casos (recopilación) ve SOLO sus casos =='
begin;
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_mio', 'en_proceso', :'admin');
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_ajeno', 'en_proceso', null);
  update public.perfiles set rol = 'voluntario', roles_extra = '{recopilacion}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_mio int; n_ajeno int;
  begin
    select count(*) into n_mio from public.casos where titulo = '_TEST_mio';
    select count(*) into n_ajeno from public.casos where titulo = '_TEST_ajeno';
    if n_mio <> 1 then raise exception 'FALLO: recopilación no ve su propio caso'; end if;
    if n_ajeno <> 0 then raise exception 'FALLO: recopilación ve casos ajenos'; end if;
  end $$;
rollback;

\echo '== Test 8: envio_redaccion ve confirmados pero NO en_proceso ajenos =='
begin;
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_conf', 'confirmado', null);
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_proc', 'en_proceso', null);
  update public.perfiles set rol = 'voluntario', roles_extra = '{envio_redaccion}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_conf int; n_proc int;
  begin
    select count(*) into n_conf from public.casos where titulo = '_TEST_conf';
    select count(*) into n_proc from public.casos where titulo = '_TEST_proc';
    if n_conf <> 1 then raise exception 'FALLO: envío no ve un caso confirmado'; end if;
    if n_proc <> 0 then raise exception 'FALLO: envío ve casos en proceso ajenos'; end if;
  end $$;
rollback;

\echo '== Test 9: un coordinador NO puede actualizar casos =='
begin;
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_upd', 'en_proceso', null);
  update public.perfiles set rol = 'coordinador', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int;
  begin
    update public.casos set notas = 'hack' where titulo = '_TEST_upd';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: un coordinador actualizó un caso'; end if;
  end $$;
rollback;

\echo '== Test 10: el coordinador miembro SÍ fija anuncios en su grupo =='
begin;
  insert into public.grupos (nombre, area) values ('_TEST_pub', 'salud');
  insert into public.miembros_grupo (grupo_id, perfil_id)
    select id, :'admin' from public.grupos where nombre = '_TEST_pub';
  update public.perfiles set rol = 'coordinador', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    insert into public.mensajes_fijados (grupo_id, autor_id, contenido)
      select id, v_uid, 'anuncio de prueba' from public.grupos where nombre = '_TEST_pub';
  end $$;
rollback;

\echo '== Test 11: lo enviado a Redacción es inmutable para el verificador =='
begin;
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_env', 'confirmado', null);
  update public.casos set estado = 'enviado_redaccion' where titulo = '_TEST_env';
  update public.perfiles set rol = 'voluntario', roles_extra = '{verificador}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int;
  begin
    update public.casos set estado = 'en_proceso' where titulo = '_TEST_env';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: un verificador regresó un caso ya enviado a Redacción'; end if;
  end $$;
rollback;

\echo '== TODOS LOS TESTS DE RLS PASARON =='
