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

\echo '== TODOS LOS TESTS DE RLS PASARON =='
