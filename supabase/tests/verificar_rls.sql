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

\echo '== Test 7: Gestión de casos (recopilación con 2ª verif) ve SOLO sus casos =='
begin;
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_mio', 'en_proceso', :'admin');
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_ajeno', 'en_proceso', null);
  -- La recopilación EXIGE 2ª verificación (identidad) aprobada para ver/crear casos (0078).
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values (:'admin', 'aprobada', 'x/s.jpg', 'x/d.jpg', true)
    on conflict (perfil_id) do update set estado = 'aprobada';
  update public.perfiles set rol = 'voluntario', roles_extra = '{recopilacion}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_mio int; n_ajeno int;
  begin
    select count(*) into n_mio from public.casos where titulo = '_TEST_mio';
    select count(*) into n_ajeno from public.casos where titulo = '_TEST_ajeno';
    if n_mio <> 1 then raise exception 'FALLO: recopilación (verificada) no ve su propio caso'; end if;
    if n_ajeno <> 0 then raise exception 'FALLO: recopilación ve casos ajenos'; end if;
  end $$;
rollback;

\echo '== Test 7b: recopilación SIN 2ª verificación NO ve sus casos =='
begin;
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_mio2', 'en_proceso', :'admin');
  update public.perfiles set rol = 'voluntario', roles_extra = '{recopilacion}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int;
  begin
    select count(*) into n from public.casos where titulo = '_TEST_mio2';
    if n <> 0 then raise exception 'FALLO: recopilación sin identidad aprobada vio su caso'; end if;
  end $$;
rollback;

\echo '== Test 8: envio_redaccion ve confirmados pero NO en_proceso ajenos =='
begin;
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_conf', 'confirmado', null);
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_proc', 'en_proceso', null);
  update public.perfiles set rol = 'voluntario', roles_extra = '{redaccion}' where id = :'admin';
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

\echo '== Test 12: Verificación ve «Otras informaciones» pero NO «Desaparecidos» =='
begin;
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_otras', 'en_proceso', 'Otras informaciones', null);
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_desap', 'en_proceso', 'Desaparecidos', null);
  update public.perfiles set rol = 'voluntario', roles_extra = '{verificador}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_otras int; n_desap int;
  begin
    select count(*) into n_otras from public.casos where titulo = '_TEST_otras';
    select count(*) into n_desap from public.casos where titulo = '_TEST_desap';
    if n_otras <> 1 then raise exception 'FALLO: verificador no ve un caso de Otras informaciones'; end if;
    if n_desap <> 0 then raise exception 'FALLO: verificador vio un caso de Desaparecidos'; end if;
  end $$;
rollback;

\echo '== Test 13: Búsqueda (con 2ª verif) ve «Desaparecidos» pero NO «Otras informaciones» =='
begin;
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_desap2', 'en_proceso', 'Desaparecidos', null);
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_otras2', 'en_proceso', 'Otras informaciones', null);
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values (:'admin', 'aprobada', 'x/s.jpg', 'x/d.jpg', true)
    on conflict (perfil_id) do update set estado = 'aprobada';
  update public.perfiles set rol = 'voluntario', roles_extra = '{busqueda}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_desap int; n_otras int;
  begin
    select count(*) into n_desap from public.casos where titulo = '_TEST_desap2';
    select count(*) into n_otras from public.casos where titulo = '_TEST_otras2';
    if n_desap <> 1 then raise exception 'FALLO: búsqueda no ve un caso de Desaparecidos'; end if;
    if n_otras <> 0 then raise exception 'FALLO: búsqueda vio un caso de Otras informaciones'; end if;
  end $$;
rollback;

\echo '== Test 14: Búsqueda SIN 2ª verificación NO ve «Desaparecidos» =='
begin;
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_desap3', 'en_proceso', 'Desaparecidos', null);
  update public.perfiles set rol = 'voluntario', roles_extra = '{busqueda}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int;
  begin
    select count(*) into n from public.casos where titulo = '_TEST_desap3';
    if n <> 0 then raise exception 'FALLO: búsqueda sin identidad aprobada vio un desaparecido'; end if;
  end $$;
rollback;

-- ══ Administración por área (0103) ══

\echo '== Test 15: un admin de área NO es admin (sin escalada de privilegios) =='
begin;
  update public.perfiles set rol = 'admin_verificacion', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    if public.es_admin() then raise exception 'FALLO: admin_verificacion cuenta como es_admin()'; end if;
    if not public.es_admin_verificacion() then raise exception 'FALLO: es_admin_verificacion() falso para el rol'; end if;
    if public.es_admin_redes() then raise exception 'FALLO: admin_verificacion cuenta como admin_redes'; end if;
    -- Efecto concreto: NO puede crear grupos (poder exclusivo de admin).
    begin
      insert into public.grupos (nombre, area, lider_id) values ('_TEST_area_pirata', 'salud', v_uid);
      raise exception 'FALLO: admin_verificacion creó un grupo (poder de admin)';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 16: un no-admin general NO puede concederse rol de admin de área =='
begin;
  -- Actor = coordinador: pasa las reglas 1/1b (es_coordinacion) para aislar la regla 2c.
  update public.perfiles set rol = 'coordinador', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    begin
      update public.perfiles set roles_extra = '{admin_verificacion}' where id = v_uid;
      raise exception 'FALLO: un coordinador se concedió admin_verificacion';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 17: la solicitud de registro se rutea a la administración del área =='
begin;
  -- Un admin de área Verificaciones (destinatario esperado del ruteo).
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1','av@test.local') on conflict do nothing;
  update public.perfiles set rol = 'admin_verificacion', verificado = true where id = '00000000-0000-0000-0000-0000000000d1';
  -- Registro en el área Verificaciones (dispara handle_new_user + notificar_registro).
  insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-0000000000d2','regv@test.local',
            '{"nombre_completo":"Registro V","area_registro":"verificacion"}'::jsonb);
  -- Registro en el área Redes (NO debe avisar al admin de Verificaciones).
  insert into auth.users (id, email, raw_user_meta_data)
    values ('00000000-0000-0000-0000-0000000000d3','regr@test.local',
            '{"nombre_completo":"Registro R","area_registro":"redes"}'::jsonb);
  do $$
  declare n_v int; n_r int;
  begin
    select count(*) into n_v from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-0000000000d1'
        and tipo = 'registro_nuevo' and cuerpo like 'Registro V%';
    select count(*) into n_r from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-0000000000d1'
        and tipo = 'registro_nuevo' and cuerpo like 'Registro R%';
    if n_v <> 1 then raise exception 'FALLO: el admin de Verificaciones no recibió la solicitud de su área (n=%)', n_v; end if;
    if n_r <> 0 then raise exception 'FALLO: el admin de Verificaciones recibió una solicitud de Redes (n=%)', n_r; end if;
  end $$;
rollback;

\echo '== Test 18: coordinación NO puede otorgar un rol del área psicosocial (0075/0104) =='
begin;
  update public.perfiles set rol = 'coordinador', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    begin
      update public.perfiles set roles_extra = '{apoyo_psicosocial}' where id = v_uid;
      raise exception 'FALLO: un coordinador se concedió un rol del área psicosocial';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== TODOS LOS TESTS DE RLS PASARON =='
