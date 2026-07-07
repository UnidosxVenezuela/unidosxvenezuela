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

-- ══ Supervisión por área (0105) ══

\echo '== Test 19: Admin de Verificaciones (con 2ª verif) LEE casos/fichas de Desaparecidos =='
begin;
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_av_desap', 'en_proceso', 'Desaparecidos', null);
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values (:'admin', 'aprobada', 'x/s.jpg', 'x/d.jpg', true) on conflict (perfil_id) do update set estado = 'aprobada';
  update public.perfiles set rol = 'admin_verificacion', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_caso int; n_ficha int;
  begin
    select count(*) into n_caso from public.casos where titulo = '_TEST_av_desap';
    if n_caso <> 1 then raise exception 'FALLO: admin_verificacion no ve un caso de Desaparecidos (n=%)', n_caso; end if;
    select count(*) into n_ficha from public.busqueda_casos b
      join public.casos c on c.id = b.caso_id where c.titulo = '_TEST_av_desap';
    if n_ficha <> 1 then raise exception 'FALLO: admin_verificacion no ve la ficha de búsqueda (n=%)', n_ficha; end if;
  end $$;
rollback;

\echo '== Test 20: Admin de Redes (con 2ª verif) LEE contenido pero NO ve casos de Desaparecidos =='
begin;
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_ar_desap', 'en_proceso', 'Desaparecidos', null);
  insert into public.piezas_contenido (titulo, etapa) values ('_TEST_ar_pieza', 'redaccion');
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values (:'admin', 'aprobada', 'x/s.jpg', 'x/d.jpg', true) on conflict (perfil_id) do update set estado = 'aprobada';
  update public.perfiles set rol = 'admin_redes', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_pieza int; n_desap int;
  begin
    select count(*) into n_pieza from public.piezas_contenido where titulo = '_TEST_ar_pieza';
    if n_pieza <> 1 then raise exception 'FALLO: admin_redes no ve una pieza de contenido (n=%)', n_pieza; end if;
    select count(*) into n_desap from public.casos where titulo = '_TEST_ar_desap';
    if n_desap <> 0 then raise exception 'FALLO: admin_redes ve un caso de Desaparecidos (n=%)', n_desap; end if;
  end $$;
rollback;

-- ══ Operación por área con llave de 2ª verificación (0106) ══

\echo '== Test 21: Admin de Verificaciones SIN 2ª verificación NO ve ni muta casos =='
begin;
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_op_desap', 'en_proceso', 'Desaparecidos', null);
  delete from public.verificaciones_identidad where perfil_id = :'admin';
  update public.perfiles set rol = 'admin_verificacion', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int; n_upd int;
  begin
    select count(*) into n from public.casos where titulo = '_TEST_op_desap';
    if n <> 0 then raise exception 'FALLO: admin_verificacion SIN identidad vio un caso (n=%)', n; end if;
    update public.casos set notas = 'x' where titulo = '_TEST_op_desap';
    get diagnostics n_upd = row_count;
    if n_upd <> 0 then raise exception 'FALLO: admin_verificacion SIN identidad mutó un caso'; end if;
  end $$;
rollback;

\echo '== Test 22: Admin de Verificaciones CON 2ª verificación opera su área (mando), no otra =='
begin;
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_op_desap2', 'en_proceso', 'Desaparecidos', null);
  insert into public.piezas_contenido (titulo, etapa, creado_por) values ('_TEST_op_pieza_v', 'redaccion', null);
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values (:'admin', 'aprobada', 'x/s.jpg', 'x/d.jpg', true) on conflict (perfil_id) do update set estado = 'aprobada';
  update public.perfiles set rol = 'admin_verificacion', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int; n_upd int; n_ficha int; n_pieza int;
  begin
    select count(*) into n from public.casos where titulo = '_TEST_op_desap2';
    if n <> 1 then raise exception 'FALLO: admin_verificacion CON identidad no ve su caso (n=%)', n; end if;
    update public.casos set notas = 'ok' where titulo = '_TEST_op_desap2';
    get diagnostics n_upd = row_count;
    if n_upd <> 1 then raise exception 'FALLO: admin_verificacion (mando) no pudo editar un caso Desaparecidos'; end if;
    -- Como mando, puede llevar la ficha a un estado de cierre (pasa el trigger de blindaje).
    update public.busqueda_casos set estado_busqueda = 'descartado'
      where caso_id = (select id from public.casos where titulo = '_TEST_op_desap2');
    get diagnostics n_ficha = row_count;
    if n_ficha <> 1 then raise exception 'FALLO: admin_verificacion (mando) no pudo cerrar la ficha'; end if;
    -- Aislamiento entre áreas: NO opera contenido (es de Redes).
    update public.piezas_contenido set notas = 'hack' where titulo = '_TEST_op_pieza_v';
    get diagnostics n_pieza = row_count;
    if n_pieza <> 0 then raise exception 'FALLO: admin_verificacion editó una pieza de contenido (cross-area)'; end if;
  end $$;
rollback;

\echo '== Test 23: Admin de Redes CON 2ª verificación opera contenido, no casos de Desaparecidos =='
begin;
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_op_desap_r', 'en_proceso', 'Desaparecidos', null);
  insert into public.piezas_contenido (titulo, etapa, creado_por) values ('_TEST_op_pieza_r', 'redaccion', null);
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values (:'admin', 'aprobada', 'x/s.jpg', 'x/d.jpg', true) on conflict (perfil_id) do update set estado = 'aprobada';
  update public.perfiles set rol = 'admin_redes', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_pieza int; n_desap int; n_upd int;
  begin
    update public.piezas_contenido set notas = 'ok' where titulo = '_TEST_op_pieza_r';
    get diagnostics n_pieza = row_count;
    if n_pieza <> 1 then raise exception 'FALLO: admin_redes CON identidad no pudo editar una pieza'; end if;
    select count(*) into n_desap from public.casos where titulo = '_TEST_op_desap_r';
    if n_desap <> 0 then raise exception 'FALLO: admin_redes ve un caso de Desaparecidos (cross-area)'; end if;
    update public.casos set notas = 'hack' where titulo = '_TEST_op_desap_r';
    get diagnostics n_upd = row_count;
    if n_upd <> 0 then raise exception 'FALLO: admin_redes mutó un caso de Desaparecidos (cross-area)'; end if;
  end $$;
rollback;

-- ══ Casos: estado «pendiente» + historial para líderes/coordinadores (0107) ══

\echo '== Test 24: líder de grupo ve el historial de CASOS pero NO el resto de auditoría =='
begin;
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
    values (null, 'casos:update', 'casos', '_TEST_h_casos', '{}'::jsonb);
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
    values (null, 'cambio_rol', 'perfil', '_TEST_h_perfil', '{}'::jsonb);
  update public.perfiles set rol = 'lider_grupo', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_casos int; n_perfil int;
  begin
    select count(*) into n_casos from public.registro_auditoria where entidad_id = '_TEST_h_casos';
    if n_casos <> 1 then raise exception 'FALLO: un líder de grupo no ve el historial de casos (n=%)', n_casos; end if;
    select count(*) into n_perfil from public.registro_auditoria where entidad_id = '_TEST_h_perfil';
    if n_perfil <> 0 then raise exception 'FALLO: un líder de grupo ve auditoría que no es de casos (n=%)', n_perfil; end if;
  end $$;
rollback;

\echo '== Test 25: el creador puede editar su caso mientras está «pendiente» =='
begin;
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values (:'admin', 'aprobada', 'x/s.jpg', 'x/d.jpg', true) on conflict (perfil_id) do update set estado = 'aprobada';
  insert into public.casos (titulo, estado, categoria, creado_por) values ('_TEST_pend', 'pendiente', 'Otras informaciones', :'admin');
  update public.perfiles set rol = 'voluntario', roles_extra = '{recopilacion}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_upd int;
  begin
    update public.casos set descripcion = 'editado' where titulo = '_TEST_pend';
    get diagnostics n_upd = row_count;
    if n_upd <> 1 then raise exception 'FALLO: el creador no pudo editar su caso pendiente'; end if;
  end $$;
rollback;

-- ══ Grupos: al salir el líder, el grupo queda sin líder (trigger 0111) ══

\echo '== Test 26: quitar al líder como miembro deja grupos.lider_id en null (0111) =='
begin;
  insert into public.grupos (id, nombre, area, abierto)
    values ('00000000-0000-0000-0000-00000000dd01', '_TEST_lider_out', 'comunicaciones', false);
  insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
    values ('00000000-0000-0000-0000-00000000dd01', :'admin', 'lider');
  update public.grupos set lider_id = :'admin' where id = '00000000-0000-0000-0000-00000000dd01';
  do $$
  declare v_lider uuid;
  begin
    delete from public.miembros_grupo where grupo_id = '00000000-0000-0000-0000-00000000dd01';
    select lider_id into v_lider from public.grupos where id = '00000000-0000-0000-0000-00000000dd01';
    if v_lider is not null then raise exception 'FALLO: lider_id no se limpió al quitar al líder del grupo'; end if;
  end $$;
rollback;

\echo '== Test 27: degradar el rol del líder en el grupo deja lider_id en null (0111) =='
begin;
  insert into public.grupos (id, nombre, area, abierto)
    values ('00000000-0000-0000-0000-00000000dd02', '_TEST_lider_dem', 'comunicaciones', false);
  insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
    values ('00000000-0000-0000-0000-00000000dd02', :'admin', 'lider');
  update public.grupos set lider_id = :'admin' where id = '00000000-0000-0000-0000-00000000dd02';
  do $$
  declare v_lider uuid;
  begin
    update public.miembros_grupo set rol_en_grupo = 'miembro' where grupo_id = '00000000-0000-0000-0000-00000000dd02';
    select lider_id into v_lider from public.grupos where id = '00000000-0000-0000-0000-00000000dd02';
    if v_lider is not null then raise exception 'FALLO: lider_id no se limpió al degradar el rol del líder'; end if;
  end $$;
rollback;

-- ══ Casos «requerimiento con ubicación» + capa de mapa (0112) ══

\echo '== Test 28: el CHECK rechaza un requerimiento sin ubicación o en Desaparecidos (0112) =='
begin;
  do $$ begin
    begin
      insert into public.casos (titulo, categoria, estado, es_requerimiento)
        values ('_TEST_req_noloc', 'Otras informaciones', 'confirmado', true);
      raise exception 'FALLO: se permitió un requerimiento SIN ubicación';
    exception when check_violation then null; -- esperado
    end;
  end $$;
  do $$ begin
    begin
      insert into public.casos (titulo, categoria, estado, es_requerimiento, lat, lng)
        values ('_TEST_req_desap', 'Desaparecidos', 'en_proceso', true, 10.5, -66.9);
      raise exception 'FALLO: se permitió un requerimiento en «Desaparecidos»';
    exception when check_violation then null; -- esperado
    end;
  end $$;
rollback;

\echo '== Test 29: solicitudes_ayuda_mapa() muestra el requerimiento confirmado a logística (que NO lee casos) y oculta el no confirmado (0112) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng, req_tipo, req_urgencia)
    values ('00000000-0000-0000-0000-00000000ee01', '_TEST_req_ok', 'Otras informaciones', 'confirmado', true, 10.5, -66.9, 'agua', 'alta');
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng)
    values ('00000000-0000-0000-0000-00000000ee02', '_TEST_req_pend', 'Otras informaciones', 'pendiente', true, 10.6, -66.8);
  update public.perfiles set rol = 'logistica', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_ok int; n_pend int; n_directo int;
  begin
    select count(*) into n_ok from public.solicitudes_ayuda_mapa() where id = '00000000-0000-0000-0000-00000000ee01';
    if n_ok <> 1 then raise exception 'FALLO: logística no ve el requerimiento confirmado por la RPC (n=%)', n_ok; end if;
    select count(*) into n_pend from public.solicitudes_ayuda_mapa() where id = '00000000-0000-0000-0000-00000000ee02';
    if n_pend <> 0 then raise exception 'FALLO: la RPC devolvió un requerimiento NO confirmado'; end if;
    select count(*) into n_directo from public.casos where id = '00000000-0000-0000-0000-00000000ee01';
    if n_directo <> 0 then raise exception 'FALLO: logística leyó casos directamente saltando la RLS'; end if;
  end $$;
rollback;

\echo '== Test 30: un rol fuera de la audiencia del mapa NO ve solicitudes por la RPC (0112) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng)
    values ('00000000-0000-0000-0000-00000000ee03', '_TEST_req_vol', 'Otras informaciones', 'confirmado', true, 10.5, -66.9);
  update public.perfiles set rol = 'voluntario', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int;
  begin
    select count(*) into n from public.solicitudes_ayuda_mapa() where id = '00000000-0000-0000-0000-00000000ee03';
    if n <> 0 then raise exception 'FALLO: un rol fuera de la audiencia del mapa vio solicitudes (n=%)', n; end if;
  end $$;
rollback;

-- ══ Derivar un caso-requerimiento a Logística (0113) ══

\echo '== Test 31: la Verificación deriva un requerimiento confirmado → solicitud enlazada; no se deriva dos veces (0113) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng, req_tipo, req_urgencia)
    values ('00000000-0000-0000-0000-00000000ff01', '_TEST_deriv', 'Otras informaciones', 'confirmado', true, 10.5, -66.9, 'agua', 'alta');
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_sol uuid; r record;
  begin
    v_sol := public.derivar_caso_a_logistica('00000000-0000-0000-0000-00000000ff01');
    if v_sol is null then raise exception 'FALLO: la derivación no devolvió una solicitud'; end if;
    select tipo, urgencia, estado, caso_id, solicitado_por into r from public.solicitudes_insumo where id = v_sol;
    if r.caso_id <> '00000000-0000-0000-0000-00000000ff01' then raise exception 'FALLO: la solicitud no quedó enlazada al caso'; end if;
    if r.tipo::text <> 'agua' then raise exception 'FALLO: no arrastró el tipo (%)', r.tipo; end if;
    if r.urgencia::text <> 'alta' then raise exception 'FALLO: no arrastró la urgencia (%)', r.urgencia; end if;
    if r.estado::text <> 'solicitado' then raise exception 'FALLO: la solicitud no nació «solicitado»'; end if;
    if r.solicitado_por <> (current_setting('request.jwt.claims')::json ->> 'sub')::uuid then
      raise exception 'FALLO: no selló solicitado_por con el actor'; end if;
    begin
      perform public.derivar_caso_a_logistica('00000000-0000-0000-0000-00000000ff01');
      raise exception 'FALLO: permitió derivar el mismo caso dos veces';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if; -- re-lanza el fallo real
    end;
  end $$;
rollback;

\echo '== Test 32: no se deriva un caso NO confirmado (0113) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng)
    values ('00000000-0000-0000-0000-00000000ff02', '_TEST_deriv_pend', 'Otras informaciones', 'pendiente', true, 10.5, -66.9);
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$ begin
    begin
      perform public.derivar_caso_a_logistica('00000000-0000-0000-0000-00000000ff02');
      raise exception 'FALLO: derivó un caso NO confirmado';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 33: caso_de_solicitud() devuelve el caso de origen a Logística (0113) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng)
    values ('00000000-0000-0000-0000-00000000ff03', '_TEST_origen', 'Otras informaciones', 'confirmado', true, 10.5, -66.9);
  update public.perfiles set rol = 'logistica', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n int;
  begin
    select count(*) into n from public.caso_de_solicitud('00000000-0000-0000-0000-00000000ff03');
    if n <> 1 then raise exception 'FALLO: logística no obtuvo el caso de origen (n=%)', n; end if;
  end $$;
rollback;

-- ══ Cerrar el ciclo: entrega → caso resuelto + centro cercano (0114) ══

\echo '== Test 34: al ENTREGAR la solicitud derivada, el caso queda «resuelto» (0114) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng)
    values ('00000000-0000-0000-0000-0000000a3401', '_TEST_cierre', 'Otras informaciones', 'confirmado', true, 10.5, -66.9);
  insert into public.solicitudes_insumo (id, titulo, tipo, urgencia, estado, caso_id)
    values ('00000000-0000-0000-0000-0000000a3402', '_TEST_cierre_sol', 'agua', 'alta', 'en_ruta', '00000000-0000-0000-0000-0000000a3401');
  update public.solicitudes_insumo set estado = 'entregado' where id = '00000000-0000-0000-0000-0000000a3402';
  do $$
  declare e text;
  begin
    select estado::text into e from public.casos where id = '00000000-0000-0000-0000-0000000a3401';
    if e <> 'resuelto' then raise exception 'FALLO: el caso no quedó «resuelto» al entregar (estado=%)', e; end if;
  end $$;
rollback;

\echo '== Test 35: centros_cercanos_para_solicitud() prioriza el cercano CON stock, para Logística (0114) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng)
    values ('00000000-0000-0000-0000-0000000a3501', '_TEST_cerca', 'Otras informaciones', 'confirmado', true, 10.5, -66.9);
  insert into public.solicitudes_insumo (id, titulo, tipo, urgencia, estado, caso_id)
    values ('00000000-0000-0000-0000-0000000a3502', '_TEST_cerca_sol', 'agua', 'media', 'solicitado', '00000000-0000-0000-0000-0000000a3501');
  insert into public.puntos_acopio (id, nombre, lat, lng, creado_por)
    values ('00000000-0000-0000-0000-0000000a3503', 'Centro Cerca', 10.51, -66.91, :'admin');
  insert into public.puntos_acopio (id, nombre, lat, lng, creado_por)
    values ('00000000-0000-0000-0000-0000000a3504', 'Centro Lejos', 8.0, -62.0, :'admin');
  insert into public.inventario_acopio (punto_id, producto, categoria, cantidad)
    values ('00000000-0000-0000-0000-0000000a3503', 'Agua 5L', 'agua', 100);
  update public.perfiles set rol = 'logistica', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare primero record; n int;
  begin
    select count(*) into n from public.centros_cercanos_para_solicitud('00000000-0000-0000-0000-0000000a3502', 5);
    if n < 2 then raise exception 'FALLO: no devolvió los centros (n=%)', n; end if;
    select * into primero from public.centros_cercanos_para_solicitud('00000000-0000-0000-0000-0000000a3502', 5) limit 1;
    if primero.punto_id <> '00000000-0000-0000-0000-0000000a3503' then
      raise exception 'FALLO: el primero no es el centro cercano con stock (%)', primero.nombre; end if;
    if not primero.con_stock then raise exception 'FALLO: el primero debería tener stock'; end if;
  end $$;
rollback;

-- ══ Logística: notificaciones del ciclo + auditoría de estados (0116) ══

\echo '== Test 36: derivar avisa a Logística (0116) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000ab01', 'logi@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica', verificado = true, nombre_completo = 'Logi' where id = '00000000-0000-0000-0000-00000000ab01';
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng)
    values ('00000000-0000-0000-0000-00000000ab02', '_TEST_notif', 'Otras informaciones', 'confirmado', true, 10.5, -66.9);
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  select public.derivar_caso_a_logistica('00000000-0000-0000-0000-00000000ab02');
  reset role;  -- verificar sin RLS (las notificaciones son privadas del destinatario)
  do $$
  declare n int;
  begin
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000ab01' and tipo = 'insumo_derivado';
    if n < 1 then raise exception 'FALLO: Logística no recibió aviso de la derivación (n=%)', n; end if;
  end $$;
rollback;

\echo '== Test 37: entregar avisa al reportante y audita el cambio de estado (0116) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000ab11', 'rep@test.local') on conflict do nothing;
  update public.perfiles set nombre_completo = 'Reportante', verificado = true where id = '00000000-0000-0000-0000-00000000ab11';
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng, creado_por)
    values ('00000000-0000-0000-0000-00000000ab12', '_TEST_entrega', 'Otras informaciones', 'confirmado', true, 10.5, -66.9, '00000000-0000-0000-0000-00000000ab11');
  insert into public.solicitudes_insumo (id, titulo, tipo, urgencia, estado, caso_id)
    values ('00000000-0000-0000-0000-00000000ab13', '_TEST_entrega_sol', 'agua', 'alta', 'en_ruta', '00000000-0000-0000-0000-00000000ab12');
  update public.solicitudes_insumo set estado = 'entregado' where id = '00000000-0000-0000-0000-00000000ab13';
  do $$
  declare n_notif int; n_aud int; e text;
  begin
    select estado::text into e from public.casos where id = '00000000-0000-0000-0000-00000000ab12';
    if e <> 'resuelto' then raise exception 'FALLO: el caso no quedó resuelto (%)', e; end if;
    select count(*) into n_notif from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000ab11' and tipo = 'caso_resuelto';
    if n_notif < 1 then raise exception 'FALLO: el reportante no recibió aviso de resolución'; end if;
    select count(*) into n_aud from public.registro_auditoria
      where entidad = 'solicitudes_insumo' and entidad_id = '00000000-0000-0000-0000-00000000ab13' and accion = 'insumo:estado';
    if n_aud < 1 then raise exception 'FALLO: no se auditó el cambio de estado de la solicitud'; end if;
  end $$;
rollback;

\echo '== Test 38: no se puede reabrir una solicitud entregada (no-admin) (0116) =='
begin;
  insert into public.solicitudes_insumo (id, titulo, tipo, urgencia, estado)
    values ('00000000-0000-0000-0000-00000000ab21', '_TEST_revivir', 'agua', 'media', 'entregado');
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$ begin
    begin
      update public.solicitudes_insumo set estado = 'en_ruta' where id = '00000000-0000-0000-0000-00000000ab21';
      raise exception 'FALLO: se pudo reabrir una solicitud entregada siendo no-admin';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

-- ══ Casos: avisos del ciclo de verificación (0118) ══

\echo '== Test 39: un caso nuevo «pendiente» avisa al equipo de Verificación (0118) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000ac01', 'verif@test.local'),
    ('00000000-0000-0000-0000-00000000ac02', 'reprt@test.local') on conflict do nothing;
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true, nombre_completo = 'Verif'
    where id = '00000000-0000-0000-0000-00000000ac01';
  update public.perfiles set nombre_completo = 'Reporta' where id = '00000000-0000-0000-0000-00000000ac02';
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-00000000ac03', '_TEST_nuevo', 'Otras informaciones', 'pendiente', '00000000-0000-0000-0000-00000000ac02');
  do $$
  declare n int;
  begin
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000ac01' and tipo = 'caso_por_verificar';
    if n < 1 then raise exception 'FALLO: Verificación no recibió aviso del caso nuevo (n=%)', n; end if;
  end $$;
rollback;

\echo '== Test 40: al confirmar un caso, se avisa a quien lo reportó (0118) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000ac11', 'rep2@test.local'),
    ('00000000-0000-0000-0000-00000000ac12', 'ver2@test.local') on conflict do nothing;
  update public.perfiles set nombre_completo = 'Reporta2', verificado = true where id = '00000000-0000-0000-0000-00000000ac11';
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000ac12';
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-00000000ac13', '_TEST_veredicto', 'Otras informaciones', 'en_proceso', '00000000-0000-0000-0000-00000000ac11');
  -- El verificador confirma (actor distinto del reportante) → el reportante recibe aviso.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000ac12')::text, true);
  update public.casos set estado = 'confirmado' where id = '00000000-0000-0000-0000-00000000ac13';
  reset role;
  do $$
  declare n int;
  begin
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000ac11' and tipo = 'caso_verificado';
    if n < 1 then raise exception 'FALLO: el reportante no recibió aviso del veredicto (n=%)', n; end if;
  end $$;
rollback;

-- ══ Administración de área: Logística y Acopio (0119) ══

\echo '== Test 41: admin_logistica opera acopio/insumos y supervisa su grupo, sin ser admin general (0119) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000ad01', 'adlog@test.local') on conflict do nothing;
  update public.perfiles set rol = 'admin_logistica', roles_extra = '{}', verificado = true, nombre_completo = 'AdminLog'
    where id = '00000000-0000-0000-0000-00000000ad01';
  -- Un centro ajeno (creado por otra persona): probar que opera CUALQUIER centro por ser admin de área.
  insert into public.puntos_acopio (id, nombre, lat, lng, creado_por)
    values ('00000000-0000-0000-0000-00000000ad0f', '_TEST_centro_log', 10.5, -66.9, :'admin');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000ad01')::text, true);
  do $$
  declare g_acopio uuid; g_verif uuid;
  begin
    if not public.puede_logistica() then raise exception 'FALLO: admin_logistica no puede_logistica()'; end if;
    if not public.es_lider_acopio() then raise exception 'FALLO: admin_logistica no es_lider_acopio()'; end if;
    if not public.puede_gestionar_acopio('00000000-0000-0000-0000-00000000ad0f') then
      raise exception 'FALLO: admin_logistica no gestiona un centro ajeno'; end if;
    if public.es_admin() then raise exception 'FALLO: admin_logistica NO debe ser admin general'; end if;
    select id into g_acopio from public.grupos where clave = 'gestion_acopio' limit 1;
    if g_acopio is not null and not public.puede_supervisar_grupo(g_acopio) then
      raise exception 'FALLO: admin_logistica no supervisa «Gestión de Acopio»'; end if;
    select id into g_verif from public.grupos where clave = 'verificacion' limit 1;
    if g_verif is not null and public.puede_supervisar_grupo(g_verif) then
      raise exception 'FALLO: admin_logistica NO debe supervisar un grupo de Verificaciones'; end if;
  end $$;
  reset role;
rollback;

\echo '== TODOS LOS TESTS DE RLS PASARON =='
