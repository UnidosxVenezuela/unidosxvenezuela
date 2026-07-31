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

-- Helper de pruebas (candado 0173): marca TODOS los campos del semáforo de una
-- solicitud en verde para poder CONFIRMARLA. Corre como superusuario (bypassa la RLS
-- de casos_verificacion_campo). Cubre base + requerimiento; los campos de más se ignoran.
create or replace function pg_temp.marcar_caso_validado(p_caso uuid) returns void
language sql as $$
  insert into public.casos_verificacion_campo (caso_id, campo, estado)
  select p_caso, unnest(array['referente','descripcion','fuente','vigencia','evidencia','ubicacion','cantidad']), 'verificado'
  on conflict (caso_id, campo) do update set estado = 'verificado';
$$;

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

\echo '== Test 8: Redacción ve por la VISTA CURADA lo ENVIADO a redacción; NO un confirmado sin derivar ni en_proceso; y ya NO lee casos directo (0180/0208) =='
begin;
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_env',  'enviado_redaccion', null);
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_conf', 'confirmado', null);
  insert into public.casos (titulo, estado, creado_por) values ('_TEST_proc', 'en_proceso', null);
  update public.perfiles set rol = 'voluntario', roles_extra = '{redaccion}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_casos int; n_env int; n_conf int; n_proc int;
  begin
    -- Fase 2b (0180): Redacción ya NO lee `casos` directo; lo hace por `casos_difusion`.
    select count(*) into n_casos from public.casos;
    if n_casos <> 0 then raise exception 'FALLO: Redacción todavía lee casos directamente (n=%)', n_casos; end if;
    select count(*) into n_env  from public.casos_difusion where titulo = '_TEST_env';
    select count(*) into n_conf from public.casos_difusion where titulo = '_TEST_conf';
    select count(*) into n_proc from public.casos_difusion where titulo = '_TEST_proc';
    -- Ruteo EXPLÍCITO (0208): la vista curada muestra lo enviado a redacción (o derivado a
    -- redes / requiere_difusion / publicado), NO un simple 'confirmado' sin derivar.
    if n_env  <> 1 then raise exception 'FALLO: envío no ve un caso enviado a redacción (vía vista curada)'; end if;
    if n_conf <> 0 then raise exception 'FALLO 0208: envío ve un confirmado SIN derivar a redes'; end if;
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

\echo '== Test 29: la RPC del mapa muestra el requerimiento confirmado y oculta el no confirmado; y Logística lee el caso CONFIRMADO directamente (0156) pero NO el pendiente (0112/0156) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng, req_tipo, req_urgencia)
    values ('00000000-0000-0000-0000-00000000ee01', '_TEST_req_ok', 'Otras informaciones', 'confirmado', true, 10.5, -66.9, 'agua', 'alta');
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng)
    values ('00000000-0000-0000-0000-00000000ee02', '_TEST_req_pend', 'Otras informaciones', 'pendiente', true, 10.6, -66.8);
  update public.perfiles set rol = 'logistica', roles_extra = '{}' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare n_ok int; n_pend int; n_directo int; n_directo_pend int;
  begin
    select count(*) into n_ok from public.solicitudes_ayuda_mapa() where id = '00000000-0000-0000-0000-00000000ee01';
    if n_ok <> 1 then raise exception 'FALLO: logística no ve el requerimiento confirmado por la RPC (n=%)', n_ok; end if;
    select count(*) into n_pend from public.solicitudes_ayuda_mapa() where id = '00000000-0000-0000-0000-00000000ee02';
    if n_pend <> 0 then raise exception 'FALLO: la RPC devolvió un requerimiento NO confirmado'; end if;
    -- 0156: Logística ahora lee la solicitud CONFIRMADA (no «Desaparecidos») directamente, para gestionarla completa.
    select count(*) into n_directo from public.casos where id = '00000000-0000-0000-0000-00000000ee01';
    if n_directo <> 1 then raise exception 'FALLO: logística ya debería leer el caso confirmado directamente (0156) (n=%)', n_directo; end if;
    -- Pero NO una solicitud aún NO confirmada (pendiente): su rama exige confirmado/enviado/resuelto.
    select count(*) into n_directo_pend from public.casos where id = '00000000-0000-0000-0000-00000000ee02';
    if n_directo_pend <> 0 then raise exception 'FALLO: logística leyó un caso NO confirmado directamente (n=%)', n_directo_pend; end if;
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
  select pg_temp.marcar_caso_validado('00000000-0000-0000-0000-00000000ac13');  -- candado 0173: confirmable
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

\echo '== Test 40b: el candado impide confirmar sin todos los campos en verde (0173) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-00000000ac20', '_TEST_candado', 'Otras informaciones', 'en_proceso', null);
  do $$ begin
    begin
      update public.casos set estado = 'confirmado' where id = '00000000-0000-0000-0000-00000000ac20';
      raise exception 'FALLO: se confirmó una solicitud sin verificar sus campos';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;  -- el candado (trigger 0173) = esperado
    end;
  end $$;
  -- Con TODOS los campos del semáforo en verde, ya se puede confirmar.
  select pg_temp.marcar_caso_validado('00000000-0000-0000-0000-00000000ac20');
  update public.casos set estado = 'confirmado' where id = '00000000-0000-0000-0000-00000000ac20';
  do $$ declare e text; begin
    select estado::text into e from public.casos where id = '00000000-0000-0000-0000-00000000ac20';
    if e <> 'confirmado' then raise exception 'FALLO: no se confirmó pese a tener todo en verde (estado=%)', e; end if;
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

-- ══ Telegram como canal de avisos (0139) ══

\echo '== Test 42: telegram_enlaces — cada quien gestiona SOLO los suyos; sin UPDATE de usuario (0139) =='
begin;
  -- Otra persona, dueña de un enlace ajeno (sembrado con privilegios plenos).
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000fe001', 'tg_otro@test.local') on conflict do nothing;
  insert into public.telegram_enlaces (token, perfil_id, expira_en)
    values ('_TEST_tg_ajeno', '00000000-0000-0000-0000-0000000fe001', now() + interval '15 min');
  update public.perfiles set rol = 'voluntario', verificado = true where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid; n int;
  begin
    -- (a) NO ve el enlace ajeno.
    select count(*) into n from public.telegram_enlaces where token = '_TEST_tg_ajeno';
    if n <> 0 then raise exception 'FALLO: se ve un telegram_enlace ajeno (n=%)', n; end if;
    -- (b) Puede insertar el SUYO.
    insert into public.telegram_enlaces (token, perfil_id, expira_en)
      values ('_TEST_tg_mio', v_uid, now() + interval '15 min');
    select count(*) into n from public.telegram_enlaces where token = '_TEST_tg_mio';
    if n <> 1 then raise exception 'FALLO: no pudo insertar su propio enlace (n=%)', n; end if;
    -- (c) NO puede crear uno a nombre de otra persona (viola with check).
    begin
      insert into public.telegram_enlaces (token, perfil_id, expira_en)
        values ('_TEST_tg_falso', '00000000-0000-0000-0000-0000000fe001', now() + interval '15 min');
      raise exception 'FALLO: insertó un enlace a nombre de otra persona';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
    -- (d) NO puede marcar usado_en (no hay policy de UPDATE; eso lo hace el webhook con service_role).
    update public.telegram_enlaces set usado_en = now() where token = '_TEST_tg_mio';
    if exists (select 1 from public.telegram_enlaces where token = '_TEST_tg_mio' and usado_en is not null) then
      raise exception 'FALLO: un usuario marcó usado_en (debería poder solo el webhook)';
    end if;
    -- El borrado del ajeno no afecta filas (no lo ve).
    delete from public.telegram_enlaces where token = '_TEST_tg_ajeno';
  end $$;
  reset role;
  -- Con privilegios plenos: el ajeno sigue intacto (no borrado, no marcado).
  do $$
  declare n int;
  begin
    select count(*) into n from public.telegram_enlaces where token = '_TEST_tg_ajeno' and usado_en is null;
    if n <> 1 then raise exception 'FALLO: el enlace ajeno fue alterado por otra persona (n=%)', n; end if;
  end $$;
rollback;

\echo '== Test 43: perfiles.telegram_chat_id — auto-edición SÍ, ajena NO (0139) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000fe002', 'tg_otro2@test.local') on conflict do nothing;
  update public.perfiles set telegram_chat_id = '_TEST_chatOtro' where id = '00000000-0000-0000-0000-0000000fe002';
  update public.perfiles set rol = 'voluntario', verificado = true, telegram_chat_id = null where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    -- Edita lo SUYO (no está en la lista negra de proteger_campos_perfil).
    update public.perfiles set telegram_chat_id = '_TEST_chatMio', telegram_username = '@mio' where id = v_uid;
    -- Intenta editar lo AJENO: la RLS de fila propia lo hace invisible (0 filas).
    update public.perfiles set telegram_chat_id = '_TEST_hack' where id = '00000000-0000-0000-0000-0000000fe002';
  end $$;
  reset role;
  -- (:'admin' NO se interpola dentro de un bloque $$; se comprueba por el valor propio.)
  do $$
  begin
    if not exists (select 1 from public.perfiles where telegram_chat_id = '_TEST_chatMio') then
      raise exception 'FALLO: no pudo vincular su propio Telegram';
    end if;
    if not exists (select 1 from public.perfiles where id = '00000000-0000-0000-0000-0000000fe002' and telegram_chat_id = '_TEST_chatOtro') then
      raise exception 'FALLO: una persona alteró el telegram_chat_id de otra';
    end if;
  end $$;
rollback;

\echo '== Test 44: índice único parcial — un chat de Telegram ↔ una sola cuenta (0139) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000fe003', 'tg_a@test.local') on conflict do nothing;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000fe004', 'tg_b@test.local') on conflict do nothing;
  update public.perfiles set telegram_chat_id = '_TEST_dup' where id = '00000000-0000-0000-0000-0000000fe003';
  do $$
  begin
    begin
      update public.perfiles set telegram_chat_id = '_TEST_dup' where id = '00000000-0000-0000-0000-0000000fe004';
      raise exception 'FALLO: dos cuentas comparten el mismo telegram_chat_id';
    exception when unique_violation then
      null;  -- comportamiento esperado
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 45: el webhook (service_role, sin auth.uid) vincula y marca usado_en pese a RLS (0139) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000fe005', 'tg_hook@test.local') on conflict do nothing;
  insert into public.telegram_enlaces (token, perfil_id, expira_en)
    values ('_TEST_tg_hook', '00000000-0000-0000-0000-0000000fe005', now() + interval '15 min');
  -- Sin rol authenticated ni jwt: es el camino del webhook (service_role bypassa RLS).
  update public.perfiles set telegram_chat_id = '_TEST_hookchat', telegram_username = '@hook'
    where id = '00000000-0000-0000-0000-0000000fe005';
  update public.telegram_enlaces set usado_en = now() where token = '_TEST_tg_hook';
  do $$
  begin
    if not exists (select 1 from public.perfiles where id = '00000000-0000-0000-0000-0000000fe005' and telegram_chat_id = '_TEST_hookchat') then
      raise exception 'FALLO: el webhook no pudo escribir telegram_chat_id';
    end if;
    if not exists (select 1 from public.telegram_enlaces where token = '_TEST_tg_hook' and usado_en is not null) then
      raise exception 'FALLO: el webhook no pudo marcar el token usado';
    end if;
  end $$;
rollback;

-- ══ Endurecimiento de perfil (0140) ══

\echo '== Test 46: un usuario NO puede cambiar su propio area_registro (0140) =='
begin;
  update public.perfiles set rol = 'voluntario', verificado = true, area_registro = 'general' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    begin
      update public.perfiles set area_registro = 'verificacion' where id = v_uid;
      raise exception 'FALLO: un usuario cambió su propio area_registro (escalada de alcance de área)';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;  -- el trigger lo bloqueó = esperado
    end;
  end $$;
rollback;

\echo '== Test 47: coordinación SÍ puede cambiar su area_registro (no se sobre-bloquea) =='
begin;
  update public.perfiles set rol = 'admin', verificado = true, area_registro = 'general' where id = :'admin';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  do $$
  declare v_uid uuid := (current_setting('request.jwt.claims')::json ->> 'sub')::uuid;
  begin
    update public.perfiles set area_registro = 'verificacion' where id = v_uid;  -- admin/coordinación: permitido
  exception when others then
    raise exception 'FALLO: un admin no pudo cambiar su propio area_registro (sobre-bloqueo): %', sqlerrm;
  end $$;
rollback;

-- ══ Donaciones e Insumos: oportunidades de donación (0141) ══

\echo '== Test 48: una oferta se crea SOLO como propia (Recopilación incluida) (0141) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000de01', 'recop@test.local') on conflict do nothing;
  update public.perfiles set rol = 'recopilacion', roles_extra = '{}', verificado = true, nombre_completo = 'Recop'
    where id = '00000000-0000-0000-0000-00000000de01';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de01')::text, true);
  -- Propia: permitido (así Recopilación capta ofertas).
  insert into public.oportunidades_donacion (organizacion, creado_por)
    values ('_TEST_ONG_propia', '00000000-0000-0000-0000-00000000de01');
  -- Ajena (creado_por != uid): la RLS lo niega.
  do $$ begin
    begin
      insert into public.oportunidades_donacion (organizacion, creado_por)
        values ('_TEST_ONG_ajena', '00000000-0000-0000-0000-0000000000aa');
      raise exception 'FALLO: se creó una oferta a nombre de otra persona';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 48b: SOLO Recopilación ingresa ofrecimientos; Verificación y Logística no (0153) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000de05', 'verif-of@test.local'),
    ('00000000-0000-0000-0000-00000000de06', 'logi-of@test.local'),
    ('00000000-0000-0000-0000-00000000de07', 'reco-of@test.local') on conflict do nothing;
  update public.perfiles set rol = 'verificador',  roles_extra = '{}', verificado = true, nombre_completo = 'Verif' where id = '00000000-0000-0000-0000-00000000de05';
  update public.perfiles set rol = 'logistica',    roles_extra = '{}', verificado = true, nombre_completo = 'Logi'  where id = '00000000-0000-0000-0000-00000000de06';
  update public.perfiles set rol = 'recopilacion', roles_extra = '{}', verificado = true, nombre_completo = 'Reco'  where id = '00000000-0000-0000-0000-00000000de07';
  -- Verificación: la RLS le NIEGA crear (solo verifica).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de05')::text, true);
  do $$ begin
    begin
      insert into public.oportunidades_donacion (organizacion, creado_por) values ('_TEST_verif_no_crea', '00000000-0000-0000-0000-00000000de05');
      raise exception 'FALLO: Verificación pudo crear un ofrecimiento';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  reset role;
  -- Logística: la RLS le NIEGA crear (gestiona, no crea).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de06')::text, true);
  do $$ begin
    begin
      insert into public.oportunidades_donacion (organizacion, creado_por) values ('_TEST_logi_no_crea', '00000000-0000-0000-0000-00000000de06');
      raise exception 'FALLO: Logística pudo crear un ofrecimiento';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  reset role;
  -- Recopilación: SÍ crea el suyo.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de07')::text, true);
  insert into public.oportunidades_donacion (organizacion, creado_por) values ('_TEST_reco_crea', '00000000-0000-0000-0000-00000000de07');
rollback;

\echo '== Test 49: pipeline de Logística con candado de verificación; Recopilación (equipo) y Verificación editan datos pero no estado/veredicto (0141 + 0160 + 0161) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000de11', 'reco2@test.local'),
    ('00000000-0000-0000-0000-00000000de12', 'logi2@test.local'),
    ('00000000-0000-0000-0000-00000000de13', 'verif2@test.local'),
    ('00000000-0000-0000-0000-00000000de14', 'reco3@test.local') on conflict do nothing;
  update public.perfiles set rol = 'recopilacion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000de11';
  update public.perfiles set rol = 'logistica',    roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000de12';
  update public.perfiles set rol = 'verificador',  roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000de13';
  update public.perfiles set rol = 'recopilacion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000de14';
  insert into public.oportunidades_donacion (id, organizacion, creado_por)
    values ('00000000-0000-0000-0000-00000000de1f', '_TEST_gestion', '00000000-0000-0000-0000-00000000de11');

  -- OTRO recopilador (no el creador) SÍ edita datos (equipo completo, 0161)…
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de14')::text, true);
  do $$ declare n int; begin
    update public.oportunidades_donacion set descripcion = 'Corrección del equipo de Recopilación' where id = '00000000-0000-0000-0000-00000000de1f';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALLO: un recopilador del equipo no pudo editar un ofrecimiento ajeno (n=%)', n; end if;
  end $$;
  -- …pero NO el estado (pipeline de Logística) ni el veredicto (auto-verificarse).
  do $$ begin
    begin
      update public.oportunidades_donacion set estado = 'contactada' where id = '00000000-0000-0000-0000-00000000de1f';
      raise exception 'FALLO: Recopilación cambió el estado (pipeline de Logística) de una oferta';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  do $$ begin
    begin
      update public.oportunidades_donacion set estado_verificacion = 'verificada' where id = '00000000-0000-0000-0000-00000000de1f';
      raise exception 'FALLO: Recopilación se auto-verificó una oferta (saltó a Verificación)';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  reset role;

  -- Verificación SÍ devuelve a Recopilación (info_requerida + observada), pero NO mueve el pipeline.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de13')::text, true);
  do $$ declare n int; begin
    update public.oportunidades_donacion set info_requerida = 'Falta el contacto directo', estado_verificacion = 'observada'
      where id = '00000000-0000-0000-0000-00000000de1f';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALLO: Verificación no pudo devolver el ofrecimiento a Recopilación (n=%)', n; end if;
  end $$;
  do $$ begin
    begin
      update public.oportunidades_donacion set estado = 'contactada' where id = '00000000-0000-0000-0000-00000000de1f';
      raise exception 'FALLO: Verificación movió el pipeline de Logística';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  reset role;

  -- Candado 0161: Logística NO avanza una oferta SIN verificar (está «observada»)…
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de12')::text, true);
  do $$ begin
    begin
      update public.oportunidades_donacion set estado = 'contactada' where id = '00000000-0000-0000-0000-00000000de1f';
      raise exception 'FALLO: Logística avanzó una oferta sin verificación previa (candado 0161)';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  -- …pero SÍ puede descartarla (depurar no exige verificación) y regresarla a «nueva».
  do $$ declare n int; begin
    update public.oportunidades_donacion set estado = 'descartada' where id = '00000000-0000-0000-0000-00000000de1f';
    update public.oportunidades_donacion set estado = 'nueva'      where id = '00000000-0000-0000-0000-00000000de1f';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FALLO: Logística no pudo descartar/reabrir una oferta sin verificar (n=%)', n; end if;
  end $$;
  reset role;

  -- Verificación la marca «verificada»…
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de13')::text, true);
  do $$ begin
    update public.oportunidades_donacion set estado_verificacion = 'verificada' where id = '00000000-0000-0000-0000-00000000de1f';
  end $$;
  reset role;

  -- …y AHORA Logística SÍ avanza el pipeline.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de12')::text, true);
  do $$ declare e text; begin
    update public.oportunidades_donacion set estado = 'contactada' where id = '00000000-0000-0000-0000-00000000de1f';
    select estado into e from public.oportunidades_donacion where id = '00000000-0000-0000-0000-00000000de1f';
    if e is distinct from 'contactada' then raise exception 'FALLO: Logística no pudo avanzar una oferta ya verificada (%)', e; end if;
  end $$;
rollback;

\echo '== Test 50: bitácora de oportunidad — autor = uid, y se lee (0141) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000de21', 'logi3@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000de21';
  insert into public.oportunidades_donacion (id, organizacion, creado_por)
    values ('00000000-0000-0000-0000-00000000de2f', '_TEST_bitac', '00000000-0000-0000-0000-00000000de21');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de21')::text, true);
  -- Nota a nombre de otro autor: negada.
  do $$ begin
    begin
      insert into public.bitacora_oportunidad (oportunidad_id, autor_id, contenido)
        values ('00000000-0000-0000-0000-00000000de2f', '00000000-0000-0000-0000-0000000000aa', 'x');
      raise exception 'FALLO: se registró una nota a nombre de otro autor';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
  -- Propia: permitido y legible.
  insert into public.bitacora_oportunidad (oportunidad_id, autor_id, contenido, canal, resultado)
    values ('00000000-0000-0000-0000-00000000de2f', '00000000-0000-0000-0000-00000000de21', 'Llamé, interesados', 'llamada', 'positivo');
  do $$ declare n int; begin
    select count(*) into n from public.bitacora_oportunidad where oportunidad_id = '00000000-0000-0000-0000-00000000de2f';
    if n < 1 then raise exception 'FALLO: no se pudo leer la bitácora propia'; end if;
  end $$;
rollback;

\echo '== Test 51: al registrar una oferta se avisa a Logística (0141) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000de31', 'logi4@test.local'),
    ('00000000-0000-0000-0000-00000000de32', 'reco4@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica',    roles_extra = '{}', verificado = true, nombre_completo = 'Logi4' where id = '00000000-0000-0000-0000-00000000de31';
  update public.perfiles set rol = 'recopilacion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000de32';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de32')::text, true);
  insert into public.oportunidades_donacion (organizacion, creado_por)
    values ('_TEST_aviso', '00000000-0000-0000-0000-00000000de32');
  reset role;  -- las notificaciones son privadas del destinatario
  do $$ declare n int; begin
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000de31' and tipo = 'oportunidad_donacion';
    if n < 1 then raise exception 'FALLO: Logística no recibió aviso de la nueva oferta (n=%)', n; end if;
  end $$;
rollback;

\echo '== Test 52: conectar una oferta crea una donación ligada por oportunidad_id (0141) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000de41', 'logi5@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000de41';
  -- Verificada de entrada: el candado 0161 exige verificación para avanzar a «comprometida».
  insert into public.oportunidades_donacion (id, organizacion, creado_por, estado_verificacion)
    values ('00000000-0000-0000-0000-00000000de4f', '_TEST_conecta', '00000000-0000-0000-0000-00000000de41', 'verificada');
  insert into public.solicitudes_insumo (id, titulo, tipo, urgencia, estado)
    values ('00000000-0000-0000-0000-00000000de4e', '_TEST_sol_conecta', 'agua', 'media', 'solicitado');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000de41')::text, true);
  insert into public.donaciones (donante, tipo, estado, solicitud_id, oportunidad_id, creado_por)
    values ('_TEST_conecta', 'especie', 'comprometida',
            '00000000-0000-0000-0000-00000000de4e', '00000000-0000-0000-0000-00000000de4f', '00000000-0000-0000-0000-00000000de41');
  update public.oportunidades_donacion set estado = 'comprometida' where id = '00000000-0000-0000-0000-00000000de4f';
  do $$ declare n int; begin
    select count(*) into n from public.donaciones
      where oportunidad_id = '00000000-0000-0000-0000-00000000de4f' and solicitud_id = '00000000-0000-0000-0000-00000000de4e';
    if n < 1 then raise exception 'FALLO: la donación conectada no quedó ligada a la oferta'; end if;
  end $$;
rollback;

-- ══ Verificación: «Requiere información adicional» → aviso a Recopilación (0142) ══

\echo '== Test 53: marcar «Requiere información adicional» avisa a quien reportó el caso (0142) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000ef01', 'verif-ri@test.local'),
    ('00000000-0000-0000-0000-00000000ef02', 'recop-ri@test.local') on conflict do nothing;
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true, nombre_completo = 'Verif-RI'
    where id = '00000000-0000-0000-0000-00000000ef01';
  update public.perfiles set nombre_completo = 'Recop-RI', verificado = true where id = '00000000-0000-0000-0000-00000000ef02';
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-00000000ef03', '_TEST_requiere_info', 'Otras informaciones', 'en_proceso', '00000000-0000-0000-0000-00000000ef02');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000ef01')::text, true);
  update public.casos set info_requerida = 'Falta el contacto y la ubicación', estado = 'en_proceso', asignado_a = null
    where id = '00000000-0000-0000-0000-00000000ef03';
  reset role;  -- la notificación es privada del destinatario
  do $$ declare n int; begin
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000ef02' and tipo = 'caso_requiere_info';
    if n < 1 then raise exception 'FALLO: Recopilación no recibió el aviso de «requiere info» (n=%)', n; end if;
  end $$;
rollback;

-- ══ Supervisión de Recopilación: líderes/coordinadores ven el área (0143) ══

\echo '== Test 54: el LÍDER de Recopilación supervisa las solicitudes del equipo (0143) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000fa01', 'lidrec@test.local') on conflict do nothing;
  update public.perfiles set rol = 'voluntario', roles_extra = '{recopilacion}', verificado = true where id = '00000000-0000-0000-0000-00000000fa01';
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values ('00000000-0000-0000-0000-00000000fa01', 'aprobada', 'x/s.jpg', 'x/d.jpg', true)
    on conflict (perfil_id) do update set estado = 'aprobada';
  update public.grupos set lider_id = '00000000-0000-0000-0000-00000000fa01' where clave = 'gestion_casos';
  -- Una solicitud de «Otras informaciones» creada por otra persona (no el líder).
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-00000000fa0c', '_TEST_sol_equipo', 'Otras informaciones', 'en_proceso', null);
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000fa01')::text, true);
  do $$ declare n int; begin
    if not public.es_mando_recopilacion() then raise exception 'FALLO: el líder no resultó es_mando_recopilacion()'; end if;
    select count(*) into n from public.casos where id = '00000000-0000-0000-0000-00000000fa0c';
    if n <> 1 then raise exception 'FALLO: el líder de Recopilación no ve la solicitud del equipo (n=%)', n; end if;
  end $$;
rollback;

\echo '== Test 55: el COORDINADOR de Recopilación también supervisa (0143) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000fa11', 'coordrec@test.local') on conflict do nothing;
  update public.perfiles set rol = 'voluntario', roles_extra = '{recopilacion}', verificado = true where id = '00000000-0000-0000-0000-00000000fa11';
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values ('00000000-0000-0000-0000-00000000fa11', 'aprobada', 'x/s.jpg', 'x/d.jpg', true)
    on conflict (perfil_id) do update set estado = 'aprobada';
  do $$ declare gid uuid; begin
    select id into gid from public.grupos where clave = 'gestion_casos' limit 1;
    insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
      values (gid, '00000000-0000-0000-0000-00000000fa11', 'coordinador')
      on conflict (grupo_id, perfil_id) do update set rol_en_grupo = 'coordinador';
  end $$;
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-00000000fa1c', '_TEST_sol_coord', 'Otras informaciones', 'pendiente', null);
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000fa11')::text, true);
  do $$ declare n int; begin
    if not public.es_mando_recopilacion() then raise exception 'FALLO: el coordinador no resultó es_mando_recopilacion()'; end if;
    select count(*) into n from public.casos where id = '00000000-0000-0000-0000-00000000fa1c';
    if n <> 1 then raise exception 'FALLO: el coordinador de Recopilación no ve la solicitud del equipo (n=%)', n; end if;
  end $$;
rollback;

\echo '== Test 55b: el MANDO de Recopilación (coordinador SIN el rol operativo) CREA solicitudes (0207) =='
begin;
  -- Caso real reportado: una COORDINADORA con rol PRINCIPAL 'voluntario' y SIN el rol
  -- operativo 'recopilacion' (el trigger de sync no se lo otorgó por ser voluntaria).
  -- Antes de 0207 la RLS le negaba el alta («no pasa nada» en la web); ahora, por ser
  -- mando de Recopilación (identidad aprobada), debe poder crear.
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000fa21', 'mandorec@test.local') on conflict do nothing;
  update public.perfiles set rol = 'voluntario', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000fa21';
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values ('00000000-0000-0000-0000-00000000fa21', 'aprobada', 'x/s.jpg', 'x/d.jpg', true)
    on conflict (perfil_id) do update set estado = 'aprobada';
  do $$ declare gid uuid; begin
    select id into gid from public.grupos where clave = 'gestion_casos' limit 1;
    insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
      values (gid, '00000000-0000-0000-0000-00000000fa21', 'coordinador')
      on conflict (grupo_id, perfil_id) do update set rol_en_grupo = 'coordinador';
  end $$;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000fa21')::text, true);
  do $$ begin
    if public.tiene_rol('recopilacion') then raise exception 'FALLO setup 55b: el mando no debería tener el rol operativo (invalidaría la prueba)'; end if;
    if not public.es_mando_recopilacion() then raise exception 'FALLO 55b: la coordinadora no resultó es_mando_recopilacion()'; end if;
    -- Si la RLS negara el alta, este INSERT abortaría la transacción (y la prueba).
    insert into public.casos (titulo, descripcion, categoria, estado, creado_por, fuente)
      values ('_TEST_mando_crea', 'desc', 'Otras informaciones', 'pendiente', '00000000-0000-0000-0000-00000000fa21', 'fuente');
  end $$;
rollback;

\echo '== Test 56: un recopilador SIN mando NO ve solicitudes ajenas (0143) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000fb01', 'rec-plain@test.local') on conflict do nothing;
  update public.perfiles set rol = 'voluntario', roles_extra = '{recopilacion}', verificado = true where id = '00000000-0000-0000-0000-00000000fb01';
  insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
    values ('00000000-0000-0000-0000-00000000fb01', 'aprobada', 'x/s.jpg', 'x/d.jpg', true)
    on conflict (perfil_id) do update set estado = 'aprobada';
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-00000000fb0c', '_TEST_ajena', 'Otras informaciones', 'en_proceso', null);
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000fb01')::text, true);
  do $$ declare n int; begin
    if public.es_mando_recopilacion() then raise exception 'FALLO: un recopilador sin liderazgo resultó mando'; end if;
    select count(*) into n from public.casos where id = '00000000-0000-0000-0000-00000000fb0c';
    if n <> 0 then raise exception 'FALLO: un recopilador sin mando vio una solicitud ajena (n=%)', n; end if;
  end $$;
rollback;

-- ══ Verificación de oportunidades de donación (0144) ══

\echo '== Test 57: solo Verificación fija el resultado de verificación de una oferta (0144) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000fc01', 'verif-op@test.local'),
    ('00000000-0000-0000-0000-00000000fc02', 'logi-op@test.local') on conflict do nothing;
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000fc01';
  update public.perfiles set rol = 'logistica',   roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000fc02';
  insert into public.oportunidades_donacion (id, organizacion, creado_por)
    values ('00000000-0000-0000-0000-00000000fc0f', '_TEST_verif_oferta', '00000000-0000-0000-0000-00000000fc02');
  -- Verificador: SÍ fija el resultado (vía la RPC).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000fc01')::text, true);
  select public.verificar_oportunidad_donacion('00000000-0000-0000-0000-00000000fc0f', 'verificada', 'Organización confirmada');
  do $$ declare e text; begin
    select estado_verificacion into e from public.oportunidades_donacion where id = '00000000-0000-0000-0000-00000000fc0f';
    if e is distinct from 'verificada' then raise exception 'FALLO: el verificador no marcó la oferta como verificada (%)', e; end if;
  end $$;
  reset role;
  -- Logística (no verificador): NO puede verificar (es función de Verificación).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000fc02')::text, true);
  do $$ begin
    begin
      perform public.verificar_oportunidad_donacion('00000000-0000-0000-0000-00000000fc0f', 'observada', 'x');
      raise exception 'FALLO: Logística pudo verificar una oferta';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 58: registrar una oferta avisa también a Verificación (0144) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000fc11', 'verif-n@test.local'),
    ('00000000-0000-0000-0000-00000000fc12', 'reco-n@test.local') on conflict do nothing;
  update public.perfiles set rol = 'verificador',  roles_extra = '{}', verificado = true, nombre_completo = 'VerifN' where id = '00000000-0000-0000-0000-00000000fc11';
  update public.perfiles set rol = 'recopilacion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000fc12';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000fc12')::text, true);
  insert into public.oportunidades_donacion (organizacion, creado_por)
    values ('_TEST_aviso_verif', '00000000-0000-0000-0000-00000000fc12');
  reset role;  -- las notificaciones son privadas del destinatario
  do $$ declare n int; begin
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000fc11' and tipo = 'oportunidad_donacion';
    if n < 1 then raise exception 'FALLO: Verificación no recibió aviso de la nueva oferta (n=%)', n; end if;
  end $$;
rollback;

-- ══ Puntos del mapa desde solicitudes verificadas (0145) ══

\echo '== Test 59: confirmar una solicitud marcada como punto crea el centro en el mapa (0145) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000fd01', 'logi-pt@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000fd01';
  -- Solicitud marcada como ALBERGUE temporal, con ubicación, pendiente.
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng, contacto, punto_tipo, punto_temporal, creado_por)
    values ('00000000-0000-0000-0000-00000000fd0c', '_TEST_albergue_norte', 'Otras informaciones', 'pendiente',
            true, 10.5, -66.9, 'Coordinador Pérez', 'albergue', true, null);
  -- Aún NO hay centro (no está confirmada).
  do $$ declare n int; begin
    select count(*) into n from public.puntos_acopio where caso_id = '00000000-0000-0000-0000-00000000fd0c';
    if n <> 0 then raise exception 'FALLO: se creó el centro antes de confirmar (n=%)', n; end if;
  end $$;
  -- Confirmar la solicitud → el trigger crea el centro.
  select pg_temp.marcar_caso_validado('00000000-0000-0000-0000-00000000fd0c');  -- candado 0173: confirmable
  update public.casos set estado = 'confirmado' where id = '00000000-0000-0000-0000-00000000fd0c';
  do $$ declare r public.puntos_acopio; begin
    select * into r from public.puntos_acopio where caso_id = '00000000-0000-0000-0000-00000000fd0c';
    if r.id is null then raise exception 'FALLO: no se creó el centro al confirmar el punto'; end if;
    if r.tipo <> 'albergue' then raise exception 'FALLO: tipo del centro incorrecto (%)', r.tipo; end if;
    if r.nombre <> '_TEST_albergue_norte' then raise exception 'FALLO: nombre del centro incorrecto (%)', r.nombre; end if;
    if r.creado_por is not null then raise exception 'FALLO: el centro debería nacer sin dueño'; end if;
    if r.temporal is distinct from true then raise exception 'FALLO: la etiqueta temporal no se copió'; end if;
    if r.lat <> 10.5 or r.lng <> -66.9 then raise exception 'FALLO: ubicación del centro incorrecta'; end if;
  end $$;
  -- La solicitud quedó enlazada a su centro.
  do $$ declare pid uuid; begin
    select punto_acopio_id into pid from public.casos where id = '00000000-0000-0000-0000-00000000fd0c';
    if pid is null then raise exception 'FALLO: la solicitud no quedó enlazada a su centro'; end if;
  end $$;
  -- Se avisó a Logística.
  do $$ declare n int; begin
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000fd01' and tipo = 'punto_creado';
    if n < 1 then raise exception 'FALLO: Logística no recibió aviso del punto creado (n=%)', n; end if;
  end $$;
  -- IDEMPOTENTE: reabrir y volver a confirmar NO crea un segundo centro.
  update public.casos set estado = 'en_proceso' where id = '00000000-0000-0000-0000-00000000fd0c';
  update public.casos set estado = 'confirmado' where id = '00000000-0000-0000-0000-00000000fd0c';
  do $$ declare n int; begin
    select count(*) into n from public.puntos_acopio where caso_id = '00000000-0000-0000-0000-00000000fd0c';
    if n <> 1 then raise exception 'FALLO: el punto se duplicó al reconfirmar (n=%)', n; end if;
  end $$;
rollback;

\echo '== Test 60: solicitud sin punto_tipo no crea centro; un punto exige ubicación (0145) =='
begin;
  -- Sin punto_tipo → confirmar NO crea centro.
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, lat, lng, creado_por)
    values ('00000000-0000-0000-0000-00000000fd21', '_TEST_solo_solicitud', 'Otras informaciones', 'pendiente', true, 10.0, -66.0, null);
  select pg_temp.marcar_caso_validado('00000000-0000-0000-0000-00000000fd21');  -- candado 0173: confirmable
  update public.casos set estado = 'confirmado' where id = '00000000-0000-0000-0000-00000000fd21';
  do $$ declare n int; begin
    select count(*) into n from public.puntos_acopio where caso_id = '00000000-0000-0000-0000-00000000fd21';
    if n <> 0 then raise exception 'FALLO: se creó un centro para una solicitud normal (n=%)', n; end if;
  end $$;
  -- Un punto sin ubicación viola el CHECK chk_casos_punto_ubicacion.
  do $$ begin
    begin
      insert into public.casos (id, titulo, categoria, estado, punto_tipo)
        values ('00000000-0000-0000-0000-00000000fd22', '_TEST_punto_sin_ubic', 'Otras informaciones', 'pendiente', 'hospital');
      raise exception 'FALLO: se permitió un punto sin ubicación';
    exception when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
    end;
  end $$;
rollback;

\echo '== Test 61: Logística lee SOLO las oportunidades de Captación ya enviadas, sin poder escribirlas (0162) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000ca01', 'logi-cap@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000ca01';
  insert into public.oportunidades (id, categoria, estado, titulo) values
    ('00000000-0000-0000-0000-00000000ca0e', 'empresa',   'enviado',       '_TEST_cap_enviada'),
    ('00000000-0000-0000-0000-00000000ca0f', 'fundacion', 'investigacion', '_TEST_cap_interna');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000ca01')::text, true);
  do $$ declare n_env int; n_int int; n_upd int; begin
    select count(*) into n_env from public.oportunidades where id = '00000000-0000-0000-0000-00000000ca0e';
    if n_env <> 1 then raise exception 'FALLO: Logística no pudo leer una oportunidad ENVIADA por Captación (n=%)', n_env; end if;
    select count(*) into n_int from public.oportunidades where id = '00000000-0000-0000-0000-00000000ca0f';
    if n_int <> 0 then raise exception 'FALLO: Logística leyó trabajo INTERNO de Captación (investigación) (n=%)', n_int; end if;
    update public.oportunidades set titulo = '_TEST_hackeado' where id = '00000000-0000-0000-0000-00000000ca0e';
    get diagnostics n_upd = row_count;
    if n_upd <> 0 then raise exception 'FALLO: Logística pudo ESCRIBIR una oportunidad de Captación (n=%)', n_upd; end if;
  end $$;
rollback;

\echo '== Test 62: Captación consulta las solicitudes y deja notas en la bitácora; no gestiona (0163) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000cb01', 'capta-b@test.local'),
    ('00000000-0000-0000-0000-00000000cb02', 'volun-b@test.local') on conflict do nothing;
  update public.perfiles set rol = 'captacion',  roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000cb01';
  update public.perfiles set rol = 'voluntario', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000cb02';
  insert into public.solicitudes_insumo (id, titulo, tipo, urgencia, estado)
    values ('00000000-0000-0000-0000-00000000cb0e', '_TEST_capta_nota', 'agua', 'media', 'solicitado');

  -- Captación: LEE la solicitud, deja su nota (propia), pero NO avanza el estado.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000cb01')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.solicitudes_insumo where id = '00000000-0000-0000-0000-00000000cb0e';
    if n <> 1 then raise exception 'FALLO: Captación no pudo leer la solicitud (n=%)', n; end if;
    insert into public.bitacora_solicitud (solicitud_id, autor_id, contenido)
      values ('00000000-0000-0000-0000-00000000cb0e', '00000000-0000-0000-0000-00000000cb01', 'La empresa X puede cubrir esto');
    update public.solicitudes_insumo set estado = 'en_ruta' where id = '00000000-0000-0000-0000-00000000cb0e';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: Captación avanzó una solicitud de Logística (n=%)', n; end if;
  end $$;
  -- Nota a nombre de otro: negada.
  do $$ begin
    begin
      insert into public.bitacora_solicitud (solicitud_id, autor_id, contenido)
        values ('00000000-0000-0000-0000-00000000cb0e', '00000000-0000-0000-0000-0000000000aa', 'x');
      raise exception 'FALLO: Captación registró una nota a nombre de otro';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  reset role;

  -- Un voluntario verificado sin rol de gestión NO deja notas (pero sí las lee).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000cb02')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.bitacora_solicitud where solicitud_id = '00000000-0000-0000-0000-00000000cb0e';
    if n <> 1 then raise exception 'FALLO: un verificado no pudo leer la bitácora (n=%)', n; end if;
    begin
      insert into public.bitacora_solicitud (solicitud_id, autor_id, contenido)
        values ('00000000-0000-0000-0000-00000000cb0e', '00000000-0000-0000-0000-00000000cb02', 'no debería');
      raise exception 'FALLO: un voluntario sin rol dejó una nota en la bitácora';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
rollback;

\echo '== Test 63: las horas solo se cuentan automáticas — sin alta/edición/borrado manual (0164) =='
begin;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000dd01', 'horas@test.local') on conflict do nothing;
  update public.perfiles set rol = 'voluntario', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000dd01';
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000dd01')::text, true);
  -- Alta manual: negada por RLS.
  do $$ begin
    begin
      insert into public.registro_horas (perfil_id, horas, descripcion)
        values ('00000000-0000-0000-0000-00000000dd01', 3, 'manual');
      raise exception 'FALLO: se registraron horas manuales';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  -- El conteo AUTOMÁTICO (RPC security definer) sigue funcionando…
  select public.sumar_horas_sesion(30);
  do $$ declare h numeric; begin
    select sum(horas) into h from public.registro_horas where perfil_id = '00000000-0000-0000-0000-00000000dd01';
    if coalesce(h, 0) <> 0.5 then raise exception 'FALLO: el conteo automático no sumó (h=%)', h; end if;
  end $$;
  -- …y esa fila no se puede editar ni borrar a mano.
  do $$ declare n int; begin
    update public.registro_horas set horas = 20 where perfil_id = '00000000-0000-0000-0000-00000000dd01';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: se editaron horas a mano (n=%)', n; end if;
    delete from public.registro_horas where perfil_id = '00000000-0000-0000-0000-00000000dd01';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: se borraron horas a mano (n=%)', n; end if;
  end $$;
rollback;

-- ══ Insignias (0165) ══

\echo '== Test 64: insignias: se otorgan solas, avisan, y el cliente no puede otorgárselas ni borrarlas (0165) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000b901', 'insig@test.local') on conflict do nothing;
  -- Al quedar verificado gana «Voluntario/a» y le llega el aviso.
  update public.perfiles set verificado = true where id = '00000000-0000-0000-0000-00000000b901';
  do $$ declare n int; begin
    select count(*) into n from public.perfil_insignias
      where perfil_id = '00000000-0000-0000-0000-00000000b901' and insignia_id = 'voluntario';
    if n <> 1 then raise exception 'FALLO: no se otorgó la insignia voluntario al verificar (n=%)', n; end if;
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000b901' and tipo = 'insignia';
    if n < 1 then raise exception 'FALLO: no llegó el aviso de la insignia (n=%)', n; end if;
  end $$;
  -- Su primera solicitud → «Primera solicitud» y el contador queda en 1.
  insert into public.casos (titulo, categoria, creado_por)
    values ('_TEST_insignia_caso', 'Otras informaciones', '00000000-0000-0000-0000-00000000b901');
  do $$ declare n int; begin
    select count(*) into n from public.perfil_insignias
      where perfil_id = '00000000-0000-0000-0000-00000000b901' and insignia_id = 'solicitud_1';
    if n <> 1 then raise exception 'FALLO: no se otorgó solicitud_1 (n=%)', n; end if;
    select valor into n from public.perfil_contadores
      where perfil_id = '00000000-0000-0000-0000-00000000b901' and clave = 'solicitudes';
    if n <> 1 then raise exception 'FALLO: contador de solicitudes incorrecto (%)', n; end if;
  end $$;
  -- El cliente ve el catálogo y sus insignias, pero NO puede otorgarse ni borrar ninguna.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000b901')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.insignias;
    if n < 50 then raise exception 'FALLO: el cliente no ve el catálogo de insignias (n=%)', n; end if;
    select count(*) into n from public.perfil_insignias
      where perfil_id = '00000000-0000-0000-0000-00000000b901';
    if n < 2 then raise exception 'FALLO: el cliente no ve sus propias insignias (n=%)', n; end if;
    begin
      insert into public.perfil_insignias (perfil_id, insignia_id)
        values ('00000000-0000-0000-0000-00000000b901', 'horas_250');
      raise exception 'FALLO: el cliente pudo OTORGARSE una insignia';
    exception when insufficient_privilege then null; end;
    delete from public.perfil_insignias where perfil_id = '00000000-0000-0000-0000-00000000b901';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLO: el cliente pudo BORRAR sus insignias (n=%)', n; end if;
  end $$;
rollback;

-- ══ Solicitud publicada por Redacción (0166) ══

\echo '== Test 65: publicar una pieza marca su solicitud como publicada; el guard impide falsificarlo (0166) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000b601', 'autor-pub@test.local'),
    ('00000000-0000-0000-0000-00000000b602', 'redes-pub@test.local'),
    ('00000000-0000-0000-0000-00000000b603', 'verif-pub@test.local') on conflict do nothing;
  update public.perfiles set rol = 'recopilacion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000b601';
  -- Admin: rama es_admin() de casos_update (siempre puede editar el caso); se usa para el
  -- guard, así la fila SÍ se toca y el candado se ejerce de verdad.
  update public.perfiles set rol = 'admin', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000b603';
  -- Community Manager (redes_sociales): publica la pieza desde la etapa «redes»
  -- (la RLS de piezas exige es_coordinacion()=es_admin() o el rol de la etapa
  -- actual; por eso la pieza se crea en «redes» y él la pasa a «publicado»).
  update public.perfiles set rol = 'redes_sociales', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-00000000b602';
  -- Solicitud confirmada del autor.
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-00000000b60c', '_TEST_pub', 'Otras informaciones', 'confirmado', '00000000-0000-0000-0000-00000000b601');
  -- Pieza de contenido enlazada; al pasarla a «publicado» se marca la solicitud (camino automático).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000b602')::text, true);
  insert into public.piezas_contenido (id, caso_id, titulo, etapa, enlace_pieza, creado_por)
    values ('00000000-0000-0000-0000-00000000b6f1', '00000000-0000-0000-0000-00000000b60c', '_TEST_pieza', 'redes', 'https://ejemplo/publi', '00000000-0000-0000-0000-00000000b602');
  update public.piezas_contenido set etapa = 'publicado' where id = '00000000-0000-0000-0000-00000000b6f1';
  reset role;
  do $$ declare r public.casos; begin
    select * into r from public.casos where id = '00000000-0000-0000-0000-00000000b60c';
    if r.publicado_en is null then raise exception 'FALLO: la solicitud no quedó marcada como publicada'; end if;
    if r.publicacion_url <> 'https://ejemplo/publi' then raise exception 'FALLO: no copió el enlace de la pieza (%)', r.publicacion_url; end if;
  end $$;
  -- Se avisó a quien la reportó.
  do $$ declare n int; begin
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-00000000b601' and tipo = 'caso_publicado';
    if n < 1 then raise exception 'FALLO: no se avisó al autor de la publicación (n=%)', n; end if;
  end $$;
  -- El guard: ni siquiera un administrador (que SÍ puede editar el caso) logra fijar
  -- publicado_* por un update directo; debe pasar por la acción (SECURITY DEFINER).
  -- Robusto: el valor NO cambia, sea porque el guard lanza 42501 o porque la RLS no
  -- deja tocar la fila.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000b603')::text, true);
  do $$ declare v_antes timestamptz;
  begin
    select publicado_en into v_antes from public.casos where id = '00000000-0000-0000-0000-00000000b60c';
    begin
      update public.casos set publicado_en = now() + interval '1 day' where id = '00000000-0000-0000-0000-00000000b60c';
    exception when sqlstate '42501' then null;  -- el guard lo bloquea (camino esperado)
    end;
    if (select publicado_en from public.casos where id = '00000000-0000-0000-0000-00000000b60c') is distinct from v_antes then
      raise exception 'FALLO: se logró falsificar publicado_en por la API directa';
    end if;
  end $$;
rollback;

\echo '== Test 66: derivación multi-área — solo casos Validados; el área destino toma la suya (0177) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000091a1', 'verif-der@test.local'),
    ('00000000-0000-0000-0000-0000000091a2', 'logi-der@test.local') on conflict do nothing;
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true, nombre_completo = 'VerifDer' where id = '00000000-0000-0000-0000-0000000091a1';
  update public.perfiles set rol = 'logistica',   roles_extra = '{}', verificado = true, nombre_completo = 'LogiDer'  where id = '00000000-0000-0000-0000-0000000091a2';
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-0000000091ac', '_TEST_derivar', 'Otras informaciones', 'en_proceso', null);

  -- (1) Verificación NO puede derivar un caso sin validar (regla crítica Paso 9).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000091a1')::text, true);
  do $$ begin
    begin
      perform public.derivar_caso('00000000-0000-0000-0000-0000000091ac', array['logistica']);
      raise exception 'FALLO: se derivó un caso NO validado';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
  reset role;

  -- Validamos el caso (candado 0173) y derivamos a 2 áreas.
  select pg_temp.marcar_caso_validado('00000000-0000-0000-0000-0000000091ac');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000091a1')::text, true);
  do $$ declare v_n int; begin
    v_n := public.derivar_caso('00000000-0000-0000-0000-0000000091ac', array['logistica','donaciones'], null, 'Coordinar entrega', 'alta', null);
    if v_n <> 2 then raise exception 'FALLO: derivar_caso devolvió % (esperado 2)', v_n; end if;
  end $$;
  reset role;

  -- Se crearon 2 derivaciones y se avisó a Logística.
  do $$ declare n int; begin
    select count(*) into n from public.casos_derivaciones where caso_id = '00000000-0000-0000-0000-0000000091ac';
    if n <> 2 then raise exception 'FALLO: hay % derivaciones (esperado 2)', n; end if;
    select count(*) into n from public.notificaciones
      where destinatario_id = '00000000-0000-0000-0000-0000000091a2' and tipo = 'caso_derivado';
    if n < 1 then raise exception 'FALLO: Logística no recibió aviso de derivación (n=%)', n; end if;
  end $$;

  -- (2) Un usuario de Logística toma la derivación de su área.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000091a2')::text, true);
  do $$ declare v_id uuid; e text; begin
    select id into v_id from public.casos_derivaciones where caso_id = '00000000-0000-0000-0000-0000000091ac' and area = 'logistica';
    perform public.tomar_derivacion(v_id);
    select estado into e from public.casos_derivaciones where id = v_id;
    if e <> 'tomada' then raise exception 'FALLO: Logística no pudo tomar su derivación (estado=%)', e; end if;
  end $$;
  reset role;

  -- (3) El gate de tabla bloquea insertar una derivación de un caso NO validado.
  insert into public.casos (id, titulo, categoria, estado, creado_por)
    values ('00000000-0000-0000-0000-0000000091ad', '_TEST_derivar_nv', 'Otras informaciones', 'en_proceso', null);
  do $$ begin
    begin
      insert into public.casos_derivaciones (caso_id, area) values ('00000000-0000-0000-0000-0000000091ad', 'logistica');
      raise exception 'FALLO: se insertó una derivación de un caso no validado';
    exception when others then if sqlerrm like 'FALLO:%' then raise; end if; end;
  end $$;
rollback;

\echo '== Test 67: historial de correcciones — original→corregido; contacto sin valores; RLS (0178) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000092a1', 'verif-hist@test.local'),
    ('00000000-0000-0000-0000-0000000092a2', 'logi-hist@test.local') on conflict do nothing;
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000092a1';
  update public.perfiles set rol = 'logistica',   roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000092a2';
  insert into public.casos (id, titulo, categoria, estado, descripcion, contacto_whatsapp, creado_por)
    values ('00000000-0000-0000-0000-0000000092ac', '_TEST_hist', 'Otras informaciones', 'en_proceso', 'desc vieja', '+58412', null);

  -- Un editor autorizado (admin) corrige un dato y un campo de contacto.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'admin')::text, true);
  update public.casos set descripcion = 'desc corregida' where id = '00000000-0000-0000-0000-0000000092ac';
  update public.casos set contacto_whatsapp = '+58414' where id = '00000000-0000-0000-0000-0000000092ac';
  reset role;

  -- Se guardó el original→corregido; el contacto (Paso 10) sin valores.
  do $$ declare r record; begin
    select * into r from public.casos_historial_cambios where caso_id = '00000000-0000-0000-0000-0000000092ac' and campo = 'Descripción';
    if r.id is null then raise exception 'FALLO 67a: no se registró la corrección de descripción'; end if;
    if r.valor_anterior <> 'desc vieja' or r.valor_nuevo <> 'desc corregida' then raise exception 'FALLO 67a: valores mal (% -> %)', r.valor_anterior, r.valor_nuevo; end if;
    select * into r from public.casos_historial_cambios where caso_id = '00000000-0000-0000-0000-0000000092ac' and campo = 'WhatsApp de contacto';
    if r.id is null or not r.sensible then raise exception 'FALLO 67b: no se registró el cambio de contacto como sensible'; end if;
    if r.valor_anterior is not null or r.valor_nuevo is not null then raise exception 'FALLO 67b: se filtraron valores de contacto'; end if;
  end $$;

  -- RLS: Verificación SÍ ve el historial…
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000092a1')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.casos_historial_cambios where caso_id = '00000000-0000-0000-0000-0000000092ac';
    if n < 2 then raise exception 'FALLO 67c: Verificación no ve el historial (n=%)', n; end if;
  end $$;
  reset role;
  -- …un rol ajeno (Logística, no creador) NO.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000092a2')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.casos_historial_cambios where caso_id = '00000000-0000-0000-0000-0000000092ac';
    if n <> 0 then raise exception 'FALLO 67d: un rol ajeno vio el historial (n=%)', n; end if;
  end $$;
  reset role;
rollback;

\echo '== Test 68: seguimiento cross-área — verificado ve el recorrido no sensible; excluye Desaparecidos; no verificado nada (0179) =='
begin;
  -- Dos usuarios definidos ARRIBA (sin tocar `verificado` bajo su propia sesión, que el
  -- trigger proteger_campos_perfil bloquea): uno verificado y otro sin verificar.
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000093a1', 'logi-seg@test.local'),
    ('00000000-0000-0000-0000-0000000093a2', 'logi-seg2@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true  where id = '00000000-0000-0000-0000-0000000093a1';
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = false where id = '00000000-0000-0000-0000-0000000093a2';
  insert into public.casos (id, titulo, categoria, estado, creado_por) values
    ('00000000-0000-0000-0000-0000000093ac', '_TEST_seg_otras', 'Otras informaciones', 'en_proceso', null),
    ('00000000-0000-0000-0000-0000000093ad', '_TEST_seg_desap', 'Desaparecidos', 'en_proceso', null);

  -- Logística (verificada) ve el recorrido de solicitudes NO sensibles, no las de Desaparecidos.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000093a1')::text, true);
  do $$ declare n int; d int; begin
    select count(*) into n from public.seguimiento_casos('_TEST_seg');
    select count(*) into d from public.seguimiento_casos('_TEST_seg') where categoria = 'Desaparecidos';
    if n < 1 then raise exception 'FALLO 68a: personal verificado no ve el recorrido (n=%)', n; end if;
    if d <> 0 then raise exception 'FALLO 68b: el seguimiento incluyó Desaparecidos'; end if;
  end $$;
  reset role;

  -- Un usuario NO verificado (identidad sin aprobar) no ve nada.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000093a2')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.seguimiento_casos('_TEST_seg');
    if n <> 0 then raise exception 'FALLO 68c: un usuario no verificado vio el recorrido (n=%)', n; end if;
  end $$;
  reset role;
rollback;

\echo '== Test 69: Redacción NO lee casos directo (Paso 10, 0180); lee la vista curada; y AHORA sí ve el contacto interno (0209, decisión 1) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000094a1', 'redac-b@test.local'),
    ('00000000-0000-0000-0000-0000000094a2', 'verif94@test.local') on conflict do nothing;
  update public.perfiles set rol = 'redaccion',   roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000094a1';
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000094a2';
  -- 0208 (ruteo explícito): para ser visible en la vista curada, el caso debe estar
  -- enviado a redacción (o derivado a redes / requiere_difusion / publicado), no un
  -- simple 'confirmado'.
  insert into public.casos (id, titulo, categoria, estado, contacto, creado_por)
    values ('00000000-0000-0000-0000-0000000094ac', '_TEST_red_priv', 'Otras informaciones', 'enviado_redaccion', 'TELEFONO_SECRETO', null);

  -- Redacción ya NO lee filas de `casos` directamente, pero SÍ la vista curada.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000094a1')::text, true);
  do $$ declare n int; v_contacto text; begin
    select count(*) into n from public.casos;
    if n <> 0 then raise exception 'FALLO 69a: Redacción todavía lee filas de casos (n=%)', n; end if;
    select count(*) into n from public.casos_difusion;
    if n <> 1 then raise exception 'FALLO 69b: Redacción no ve la vista curada casos_difusion (n=%)', n; end if;
    -- 0209 (decisión 1): la vista AHORA expone el contacto interno a Redacción.
    select contacto into v_contacto from public.casos_difusion where id = '00000000-0000-0000-0000-0000000094ac';
    if v_contacto is distinct from 'TELEFONO_SECRETO' then
      raise exception 'FALLO 69c: casos_difusion ya no muestra el contacto interno a Redacción (0209 debía abrirlo, v=%)', v_contacto;
    end if;
  end $$;
  reset role;

  -- Verificación SIGUE leyendo casos (su rama de casos_select quedó intacta).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000094a2')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.casos where id = '00000000-0000-0000-0000-0000000094ac';
    if n <> 1 then raise exception 'FALLO 69d: Verificación perdió acceso a casos (n=%)', n; end if;
  end $$;
  reset role;
rollback;

\echo '== Test 70: realtime seguro de difusión — señal SIN contacto; la ven Redacción/Redes, no Logística; Desaparecidos excluido (0181) =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000095a1', 'redac-rt@test.local'),
    ('00000000-0000-0000-0000-0000000095a2', 'logi-rt@test.local') on conflict do nothing;
  update public.perfiles set rol = 'redaccion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000095a1';
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000095a2';

  -- Confirmar una solicitud de difusión SELLA la señal (vía trigger); un Desaparecidos NO.
  insert into public.casos (id, titulo, categoria, estado, contacto, creado_por) values
    ('00000000-0000-0000-0000-0000000095ac', '_TEST_senal_rt',  'Otras informaciones', 'confirmado', 'TELEFONO_SECRETO', null),
    ('00000000-0000-0000-0000-0000000095ad', '_TEST_senal_nna', 'Desaparecidos',       'confirmado', 'TELEFONO_SECRETO', null);
  do $$ declare n int; begin
    select count(*) into n from public.casos_difusion_senal where caso_id = '00000000-0000-0000-0000-0000000095ac';
    if n <> 1 then raise exception 'FALLO 70a: confirmar no selló la señal (n=%)', n; end if;
    select count(*) into n from public.casos_difusion_senal where caso_id = '00000000-0000-0000-0000-0000000095ad';
    if n <> 0 then raise exception 'FALLO 70b: un Desaparecidos generó señal de difusión (n=%)', n; end if;
  end $$;

  -- La señal NO expone contacto interno (solo caso_id + estado + sello).
  do $$ begin
    begin
      perform contacto from public.casos_difusion_senal limit 1;
      raise exception 'FALLO 70c: casos_difusion_senal expone la columna contacto';
    exception when undefined_column then null;  -- esperado
    end;
  end $$;

  -- Redacción SÍ lee la señal.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000095a1')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.casos_difusion_senal where caso_id = '00000000-0000-0000-0000-0000000095ac';
    if n <> 1 then raise exception 'FALLO 70d: Redacción no lee la señal (n=%)', n; end if;
  end $$;
  reset role;

  -- Logística NO lee la señal (no es su canal de difusión).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000095a2')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.casos_difusion_senal;
    if n <> 0 then raise exception 'FALLO 70e: Logística lee la señal de difusión (n=%)', n; end if;
  end $$;
  reset role;
rollback;

-- ══ Reseteo del semáforo al editar un dato ya verificado (0183) ══

\echo '== Test 71: editar un dato ya verificado devuelve SOLO su campo a sin_revisar (0183) =='
begin;
  insert into public.casos (id, titulo, estado, descripcion, fuente, contacto_whatsapp, creado_por) values
    ('00000000-0000-0000-0000-0000000183aa', '_TEST_reset', 'en_proceso', 'desc v1', 'fuente v1', '+58 412 0000000', null);
  -- Tres campos del semáforo en verde (como los dejaría Verificación).
  insert into public.casos_verificacion_campo (caso_id, campo, estado) values
    ('00000000-0000-0000-0000-0000000183aa', 'descripcion', 'verificado'),
    ('00000000-0000-0000-0000-0000000183aa', 'fuente',      'verificado'),
    ('00000000-0000-0000-0000-0000000183aa', 'referente',   'verificado');

  -- (a) Editar la descripción resetea SOLO 'descripcion'; 'fuente' y 'referente' siguen verdes.
  update public.casos set descripcion = 'desc v2 EDITADA' where id = '00000000-0000-0000-0000-0000000183aa';
  do $$
  declare v_desc text; v_fuente text; v_ref text;
  begin
    select estado into v_desc   from public.casos_verificacion_campo where caso_id = '00000000-0000-0000-0000-0000000183aa' and campo = 'descripcion';
    select estado into v_fuente from public.casos_verificacion_campo where caso_id = '00000000-0000-0000-0000-0000000183aa' and campo = 'fuente';
    select estado into v_ref    from public.casos_verificacion_campo where caso_id = '00000000-0000-0000-0000-0000000183aa' and campo = 'referente';
    if v_desc   <> 'sin_revisar' then raise exception 'FALLO 71a: editar descripcion no reseteó su semáforo (estado=%)', v_desc; end if;
    if v_fuente <> 'verificado'  then raise exception 'FALLO 71b: editar descripcion tumbó el semáforo de fuente (estado=%)', v_fuente; end if;
    if v_ref    <> 'verificado'  then raise exception 'FALLO 71c: editar descripcion tumbó el semáforo de referente (estado=%)', v_ref; end if;
  end $$;

  -- (b) Un dato de contacto (contacto_whatsapp) pertenece al campo 'referente' → lo resetea.
  update public.casos set contacto_whatsapp = '+58 424 1111111' where id = '00000000-0000-0000-0000-0000000183aa';
  do $$
  declare v_ref text;
  begin
    select estado into v_ref from public.casos_verificacion_campo where caso_id = '00000000-0000-0000-0000-0000000183aa' and campo = 'referente';
    if v_ref <> 'sin_revisar' then raise exception 'FALLO 71d: editar contacto_whatsapp no reseteó el campo referente (estado=%)', v_ref; end if;
  end $$;

  -- (c) Un cambio en una columna que NO mapea a ningún campo (titulo) no resetea nada.
  update public.casos set titulo = '_TEST_reset (renombrado)' where id = '00000000-0000-0000-0000-0000000183aa';
  do $$
  declare v_fuente text;
  begin
    select estado into v_fuente from public.casos_verificacion_campo where caso_id = '00000000-0000-0000-0000-0000000183aa' and campo = 'fuente';
    if v_fuente <> 'verificado' then raise exception 'FALLO 71e: renombrar el titulo reseteó un campo del semáforo (estado=%)', v_fuente; end if;
  end $$;
rollback;

-- ══ Ruteo EXPLÍCITO de la derivación (0208) ══

\echo '== Test 72: ruteo EXPLÍCITO (0208) — derivar a logística crea su solicitud; a redes la hace visible; confirmar SOLO no deriva a logística =='
begin;
  -- Tres casos VALIDADOS. L (requerimiento → logística), R (redes), M (confirmar manual).
  insert into public.casos (id, titulo, estado, es_requerimiento, lat, lng, req_tipo, req_cantidad, req_urgencia, creado_por) values
    ('00000000-0000-0000-0000-0000000208a1', '_TEST_0208_log', 'pendiente', true, 10, -66, 'alimentos', '10', 'alta', null),
    ('00000000-0000-0000-0000-0000000208a3', '_TEST_0208_man', 'pendiente', true, 10, -66, 'higiene',   '3',  'baja', null);
  insert into public.casos (id, titulo, estado, es_requerimiento, creado_por) values
    ('00000000-0000-0000-0000-0000000208a2', '_TEST_0208_red', 'pendiente', false, null);

  -- Validar (semáforo en verde): requerimiento suma ubicacion+cantidad.
  insert into public.casos_verificacion_campo (caso_id, campo, estado)
  select c.id, x.campo, 'verificado'
  from (values ('00000000-0000-0000-0000-0000000208a1'::uuid, true),
               ('00000000-0000-0000-0000-0000000208a2'::uuid, false),
               ('00000000-0000-0000-0000-0000000208a3'::uuid, true)) c(id, req)
  cross join lateral (
    select unnest(case when c.req
      then array['referente','descripcion','fuente','vigencia','evidencia','ubicacion','cantidad']
      else array['referente','descripcion','fuente','vigencia','evidencia'] end) as campo
  ) x;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000aa')::text, true);

  select public.derivar_caso('00000000-0000-0000-0000-0000000208a1', array['logistica']);
  select public.derivar_caso('00000000-0000-0000-0000-0000000208a2', array['redes']);
  update public.casos set estado = 'confirmado' where id = '00000000-0000-0000-0000-0000000208a3';

  do $$
  declare n_log int; n_red int; n_man int; v_log int; v_red int; v_man int; e_man text; e_log text;
  begin
    -- (a) Solicitud de Logística: SOLO para el derivado a logística.
    select count(*) into n_log from public.solicitudes_insumo where caso_id = '00000000-0000-0000-0000-0000000208a1';
    select count(*) into n_red from public.solicitudes_insumo where caso_id = '00000000-0000-0000-0000-0000000208a2';
    select count(*) into n_man from public.solicitudes_insumo where caso_id = '00000000-0000-0000-0000-0000000208a3';
    if n_log <> 1 then raise exception 'FALLO 72a: derivar a logística no creó su solicitud (n=%)', n_log; end if;
    if n_red <> 0 then raise exception 'FALLO 72b: derivar SOLO a redes creó una solicitud de logística (n=%)', n_red; end if;

    -- (b) La confirmación manual debe reflejarse (si RLS la bloqueara, 72c no probaría nada).
    select estado::text into e_man from public.casos where id = '00000000-0000-0000-0000-0000000208a3';
    if e_man <> 'confirmado' then raise exception 'FALLO 72c-pre: no se pudo confirmar manualmente (estado=%)', e_man; end if;
    -- …y NO debe crear tarea de logística: autoderivar_caso_confirmado quedó neutralizado.
    if n_man <> 0 then raise exception 'FALLO 72c: confirmar sin derivar creó una solicitud de logística (autoderivar no neutralizado, n=%)', n_man; end if;

    -- (c) Derivar auto-confirma (excepto Desaparecidos): el caso logística quedó confirmado.
    select estado::text into e_log from public.casos where id = '00000000-0000-0000-0000-0000000208a1';
    if e_log <> 'confirmado' then raise exception 'FALLO 72d: derivar no auto-confirmó el caso (estado=%)', e_log; end if;

    -- (d) Vista curada (Redes): ve lo derivado a redes; NO lo derivado solo a logística ni el confirmado sin derivar.
    select count(*) into v_log from public.casos_difusion where id = '00000000-0000-0000-0000-0000000208a1';
    select count(*) into v_red from public.casos_difusion where id = '00000000-0000-0000-0000-0000000208a2';
    select count(*) into v_man from public.casos_difusion where id = '00000000-0000-0000-0000-0000000208a3';
    if v_red <> 1 then raise exception 'FALLO 72e: Redes no ve el caso derivado a redes (n=%)', v_red; end if;
    if v_log <> 0 then raise exception 'FALLO 72f: Redes ve un caso derivado SOLO a logística (n=%)', v_log; end if;
    if v_man <> 0 then raise exception 'FALLO 72g: Redes ve un caso confirmado sin derivar (n=%)', v_man; end if;
  end $$;
  reset role;
rollback;

-- ══ Desaparecidos: derivar NO auto-confirma ni crea logística; queda fuera de la vista (0208) ══

\echo '== Test 73: Desaparecidos — derivar NO auto-confirma, NO crea logística, y no aparece en la vista curada (0208) =='
begin;
  insert into public.casos (id, titulo, categoria, estado, es_requerimiento, creado_por) values
    ('00000000-0000-0000-0000-0000000208b1', '_TEST_0208_desap', 'Desaparecidos', 'pendiente', false, null);
  insert into public.casos_verificacion_campo (caso_id, campo, estado)
  select '00000000-0000-0000-0000-0000000208b1'::uuid, unnest(array['referente','descripcion','fuente','vigencia','evidencia']), 'verificado';

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000aa')::text, true);
  select public.derivar_caso('00000000-0000-0000-0000-0000000208b1', array['logistica','redes']);

  do $$
  declare e text; n_sol int; n_vis int;
  begin
    select estado::text into e from public.casos where id = '00000000-0000-0000-0000-0000000208b1';
    if e <> 'pendiente' then raise exception 'FALLO 73a: un Desaparecidos se auto-confirmó al derivar (estado=%)', e; end if;
    select count(*) into n_sol from public.solicitudes_insumo where caso_id = '00000000-0000-0000-0000-0000000208b1';
    if n_sol <> 0 then raise exception 'FALLO 73b: un Desaparecidos derivado a logística creó una solicitud (n=%)', n_sol; end if;
    select count(*) into n_vis from public.casos_difusion where id = '00000000-0000-0000-0000-0000000208b1';
    if n_vis <> 0 then raise exception 'FALLO 73c: un Desaparecidos aparece en la vista curada de difusión (n=%)', n_vis; end if;
  end $$;
  reset role;
rollback;

-- ══ Abrir datos a Redacción + regresar a verificación + publicado en seguimiento (0209) ══

\echo '== Test 74: 0209 — Redacción regresa a verificación; ve TODOS los adjuntos; seguimiento suma publicado_en y notas =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000209a1', 'redac209@test.local') on conflict do nothing;
  update public.perfiles set rol = 'redaccion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000209a1';

  -- Caso en el pipeline de Redacción, con redactor asignado y notas vacías.
  insert into public.casos (id, titulo, categoria, estado, redactor_id, creado_por) values
    ('00000000-0000-0000-0000-0000000209c1', '_TEST_0209_regresar', 'Otras informaciones', 'enviado_redaccion', '00000000-0000-0000-0000-0000000209a1', null);
  -- Caso publicado con notas de verificación (para el seguimiento).
  insert into public.casos (id, titulo, categoria, estado, publicado_en, notas, creado_por) values
    ('00000000-0000-0000-0000-0000000209c2', '_TEST_0209_pub', 'Otras informaciones', 'enviado_redaccion', now(), 'NOTA_VERIF_209', null);
  -- Caso con DOS adjuntos: uno apto_difusion, otro NO.
  insert into public.casos (id, titulo, categoria, estado, creado_por) values
    ('00000000-0000-0000-0000-0000000209c3', '_TEST_0209_adj', 'Otras informaciones', 'enviado_redaccion', null);
  insert into public.casos_adjuntos (caso_id, url, nombre, mime, apto_difusion) values
    ('00000000-0000-0000-0000-0000000209c3', 'casos/209/apto.jpg',   'apto.jpg',   'image/jpeg', true),
    ('00000000-0000-0000-0000-0000000209c3', 'casos/209/noapto.jpg', 'noapto.jpg', 'image/jpeg', false);

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000209a1')::text, true);

  -- (a) Redacción regresa el caso a verificación.
  select public.regresar_caso_verificacion('00000000-0000-0000-0000-0000000209c1', 'faltan datos');
  reset role;

  do $$ declare e text; r uuid; nt text; begin
    select estado::text, redactor_id, notas into e, r, nt from public.casos where id = '00000000-0000-0000-0000-0000000209c1';
    if e <> 'en_proceso' then raise exception 'FALLO 74a: regresar_caso_verificacion no dejó el caso en_proceso (estado=%)', e; end if;
    if r is not null then raise exception 'FALLO 74b: regresar_caso_verificacion no liberó al redactor'; end if;
    if nt not ilike '%Regresado a verificación%' then raise exception 'FALLO 74c: no se anexó el sello del motivo a notas (notas=%)', nt; end if;
  end $$;

  -- (b) Redacción ve TODOS los adjuntos (apto y no apto), no solo los curados.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000209a1')::text, true);
  do $$ declare n int; n_pub int; v_notas text; v_pub timestamptz; begin
    select count(*) into n from public.casos_adjuntos_difusion where caso_id = '00000000-0000-0000-0000-0000000209c3';
    if n <> 2 then raise exception 'FALLO 74d: Redacción no ve TODOS los adjuntos (n=%, esperado 2)', n; end if;

    -- (c) seguimiento_casos ahora devuelve publicado_en y notas.
    select publicado_en, notas into v_pub, v_notas from public.seguimiento_casos(null) where id = '00000000-0000-0000-0000-0000000209c2';
    if v_pub is null then raise exception 'FALLO 74e: seguimiento_casos no refleja publicado_en'; end if;
    if v_notas is distinct from 'NOTA_VERIF_209' then raise exception 'FALLO 74f: seguimiento_casos no devuelve las notas (v=%)', v_notas; end if;
  end $$;
  reset role;
rollback;

-- ══ Desestimar (con motivo, estado aparte) + devolver una entrega (0210) ══

\echo '== Test 75: 0210 — desestimar desde Redacción/Logística (estado «desestimado» aparte); devolver un «entregado» =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000210a1', 'redac210@test.local'),
    ('00000000-0000-0000-0000-0000000210a2', 'logi210@test.local') on conflict do nothing;
  update public.perfiles set rol = 'redaccion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000210a1';
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000210a2';

  insert into public.casos (id, titulo, categoria, estado, creado_por) values
    ('00000000-0000-0000-0000-0000000210c1', '_TEST_0210_red',  'Otras informaciones', 'enviado_redaccion', null),
    ('00000000-0000-0000-0000-0000000210c2', '_TEST_0210_proc', 'Otras informaciones', 'en_proceso',        null),
    ('00000000-0000-0000-0000-0000000210c3', '_TEST_0210_logi', 'Otras informaciones', 'confirmado',        null),
    ('00000000-0000-0000-0000-0000000210c4', '_TEST_0210_ent',  'Otras informaciones', 'resuelto',          null);
  -- Solicitud ligada al caso de Logística (se debe cancelar al desestimar).
  insert into public.solicitudes_insumo (id, titulo, tipo, estado, caso_id) values
    ('00000000-0000-0000-0000-000000210053', 'ins_logi', 'otro'::public.tipo_insumo, 'solicitado'::public.estado_insumo, '00000000-0000-0000-0000-0000000210c3');
  -- Solicitud ENTREGADA ligada al caso resuelto (se debe poder devolver).
  insert into public.solicitudes_insumo (id, titulo, tipo, estado, caso_id) values
    ('00000000-0000-0000-0000-000000210054', 'ins_ent', 'otro'::public.tipo_insumo, 'entregado'::public.estado_insumo, '00000000-0000-0000-0000-0000000210c4');
  -- El caso resuelto estaba VALIDADO (como todo confirmado): así el devolver pasa el candado
  -- gate_confirmacion_caso al revertir resuelto→confirmado.
  insert into public.casos_verificacion_campo (caso_id, campo, estado)
  select '00000000-0000-0000-0000-0000000210c4'::uuid, unnest(array['referente','descripcion','fuente','vigencia','evidencia']), 'verificado';

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000210a1')::text, true);
  -- (c-pre) desestimar SIN motivo debe fallar (c1 aún en enviado_redaccion → pasa el permiso).
  do $$ begin
    begin
      perform public.desestimar_caso('00000000-0000-0000-0000-0000000210c1', null);
      raise exception 'FALLO 75c-pre: desestimar sin motivo no falló';
    exception when data_exception then null;  -- 22023 esperado
    end;
  end $$;
  -- (a) Redacción desestima un caso que SÍ ve (enviado_redaccion).
  select public.desestimar_caso('00000000-0000-0000-0000-0000000210c1', 'no procede difundir');
  -- (b) Redacción NO puede desestimar un caso en_proceso (estado que no ve).
  do $$ begin
    begin
      perform public.desestimar_caso('00000000-0000-0000-0000-0000000210c2', 'x');
      raise exception 'FALLO 75b: Redacción desestimó un caso en_proceso (no debía)';
    exception when insufficient_privilege then null;  -- 42501 esperado
    end;
  end $$;
  reset role;

  -- (d) Logística desestima su caso confirmado → cancela la solicitud ligada.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000210a2')::text, true);
  select public.desestimar_caso('00000000-0000-0000-0000-0000000210c3', 'duplicado');
  -- (e) Logística devuelve la entrega → solicitud en_ruta, caso confirmado.
  select public.devolver_entrega_insumo('00000000-0000-0000-0000-000000210054');
  reset role;

  do $$ declare e1 text; e3 text; e4 text; s3 text; s4 text; nt text; begin
    select estado::text, notas into e1, nt from public.casos where id = '00000000-0000-0000-0000-0000000210c1';
    if e1 <> 'desestimado' then raise exception 'FALLO 75a: Redacción no dejó el caso en «desestimado» (estado=%)', e1; end if;
    if nt not ilike '%Desestimado%' then raise exception 'FALLO 75a2: no se selló el motivo en notas (notas=%)', nt; end if;

    select estado::text into e3 from public.casos where id = '00000000-0000-0000-0000-0000000210c3';
    select estado::text into s3 from public.solicitudes_insumo where id = '00000000-0000-0000-0000-000000210053';
    if e3 <> 'desestimado' then raise exception 'FALLO 75d: Logística no desestimó su caso (estado=%)', e3; end if;
    if s3 <> 'cancelado'   then raise exception 'FALLO 75d2: desestimar no canceló la solicitud ligada (estado=%)', s3; end if;

    select estado::text into e4 from public.casos where id = '00000000-0000-0000-0000-0000000210c4';
    select estado::text into s4 from public.solicitudes_insumo where id = '00000000-0000-0000-0000-000000210054';
    if s4 <> 'en_ruta'    then raise exception 'FALLO 75e: devolver no revirtió la solicitud a en_ruta (estado=%)', s4; end if;
    if e4 <> 'confirmado' then raise exception 'FALLO 75e2: devolver no revirtió el caso a confirmado (estado=%)', e4; end if;
  end $$;
rollback;

-- ══ Logística pide a Redacción lo que no pudo cubrir (cobertura parcial, 0211) ══

\echo '== Test 76: 0211 — Logística crea la solicitud por cobertura parcial: hereda verificación, va a Redes, no vuelve a Logística =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000211a1', 'logi211@test.local'),
    ('00000000-0000-0000-0000-0000000211a2', 'redac211@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000211a1';
  update public.perfiles set rol = 'redaccion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000211a2';

  -- Caso padre VALIDADO y confirmado, con ubicación y contacto (los datos a reutilizar).
  insert into public.casos (id, titulo, descripcion, categoria, estado, es_requerimiento, lat, lng,
                            req_tipo, req_cantidad, req_urgencia, contacto, ubicacion_estado, creado_por)
  values ('00000000-0000-0000-0000-0000000211c1', '_TEST_0211_padre', 'desc padre', 'Otras informaciones',
          'confirmado', true, 10.5, -66.9, 'alimentos', '100 kg', 'critica', 'TELEFONO_PADRE', 'Miranda', null);
  insert into public.casos_verificacion_campo (caso_id, campo, estado)
  select '00000000-0000-0000-0000-0000000211c1'::uuid,
         unnest(array['referente','descripcion','fuente','vigencia','evidencia','ubicacion','cantidad']), 'verificado';
  -- Tarea de Logística ligada (ya entregada en parte).
  insert into public.solicitudes_insumo (id, titulo, tipo, urgencia, estado, caso_id) values
    ('00000000-0000-0000-0000-000000211051', 'ins_padre', 'alimentos'::public.tipo_insumo, 'critica'::public.prioridad,
     'en_ruta'::public.estado_insumo, '00000000-0000-0000-0000-0000000211c1');

  -- (a) Redacción NO puede pedir la cobertura parcial (es acción de Logística).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000211a2')::text, true);
  do $$ begin
    begin
      perform public.solicitar_cobertura_parcial('00000000-0000-0000-0000-000000211051', 'agua');
      raise exception 'FALLO 76a: Redacción pudo pedir la cobertura parcial (no debía)';
    exception when insufficient_privilege then null;  -- 42501 esperado
    end;
  end $$;
  reset role;

  -- (b) Logística la pide: crea el caso hijo.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000211a1')::text, true);
  do $$
  declare v_hijo uuid; h record; n_der int; n_sol int; v_val boolean;
  begin
    v_hijo := public.solicitar_cobertura_parcial('00000000-0000-0000-0000-000000211051', '40 kg de arroz', '40 kg', 'solo se cubrió el 60%');
    if v_hijo is null then raise exception 'FALLO 76b: no se creó la solicitud de cobertura parcial'; end if;

    select * into h from public.casos where id = v_hijo;
    -- Marcado como solicitud de Logística por cobertura parcial.
    if h.origen_area is distinct from 'logistica' then raise exception 'FALLO 76c: el caso hijo no quedó marcado como origen logistica (v=%)', h.origen_area; end if;
    if h.caso_padre_id is distinct from '00000000-0000-0000-0000-0000000211c1'::uuid then raise exception 'FALLO 76d: el caso hijo no apunta al padre'; end if;
    -- Nace confirmado (no vuelve a Verificación) y reutiliza los datos del padre.
    if h.estado::text <> 'confirmado' then raise exception 'FALLO 76e: el caso hijo no nació confirmado (estado=%)', h.estado; end if;
    if h.contacto is distinct from 'TELEFONO_PADRE' then raise exception 'FALLO 76f: no reutilizó el contacto del padre'; end if;
    if h.descripcion not like '%FALTA POR CUBRIR: 40 kg de arroz%' then raise exception 'FALLO 76g: la descripción no dice qué falta'; end if;
    -- Hereda la verificación: queda Validado sin pasar por Verificación.
    v_val := public.caso_esta_validado(v_hijo);
    if not v_val then raise exception 'FALLO 76h: el caso hijo no heredó la verificación del padre'; end if;

    -- Se deriva a REDES (y «crítica» entra como «alta» en la derivación).
    select count(*) into n_der from public.casos_derivaciones where caso_id = v_hijo and area = 'redes';
    if n_der <> 1 then raise exception 'FALLO 76i: no se derivó a redes (n=%)', n_der; end if;
    -- …y NO se crea otra tarea de Logística (sin bucle).
    select count(*) into n_sol from public.solicitudes_insumo where caso_id = v_hijo;
    if n_sol <> 0 then raise exception 'FALLO 76j: la cobertura parcial creó otra tarea de Logística (n=%)', n_sol; end if;
  end $$;
  reset role;

  -- (c) Redacción lo ve en su vista curada, con la procedencia para distinguirlo.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000211a2')::text, true);
  do $$ declare v_org text; v_pad bigint; n int; begin
    select count(*) into n from public.casos_difusion where origen_area = 'logistica';
    if n <> 1 then raise exception 'FALLO 76k: Redacción no ve la solicitud de cobertura parcial (n=%)', n; end if;
    select origen_area, caso_padre_numero into v_org, v_pad from public.casos_difusion where origen_area = 'logistica';
    if v_pad is null then raise exception 'FALLO 76l: la vista no expone el número de la solicitud original'; end if;
  end $$;
  reset role;
rollback;

-- ══ Imágenes adjuntas de una solicitud de Logística (0212) ══

\echo '== Test 77: 0212/0213 — Logística adjunta imágenes a su tarea; otras áreas las LEEN pero no escriben; solo quien subió (o admin) las quita =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000212a1', 'logi212@test.local'),
    ('00000000-0000-0000-0000-0000000212a2', 'logi212b@test.local'),
    ('00000000-0000-0000-0000-0000000212a3', 'redac212@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000212a1';
  update public.perfiles set rol = 'admin_logistica', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000212a2';
  update public.perfiles set rol = 'redaccion', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000212a3';

  insert into public.solicitudes_insumo (id, titulo, tipo, estado) values
    ('00000000-0000-0000-0000-000000212001', 'ins_adj', 'otro'::public.tipo_insumo, 'en_gestion'::public.estado_insumo);

  -- (a) Logística adjunta una imagen a su solicitud.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000212a1')::text, true);
  insert into public.insumos_adjuntos (id, solicitud_id, url, nombre, mime, creado_por) values
    ('00000000-0000-0000-0000-0000002120a1', '00000000-0000-0000-0000-000000212001',
     '00000000-0000-0000-0000-000000212001/foto.jpg', 'foto.jpg', 'image/jpeg', '00000000-0000-0000-0000-0000000212a1');
  do $$ declare n int; begin
    select count(*) into n from public.insumos_adjuntos where solicitud_id = '00000000-0000-0000-0000-000000212001';
    if n <> 1 then raise exception 'FALLO 77a: Logística no pudo adjuntar/leer su imagen (n=%)', n; end if;
  end $$;
  -- No se puede subir a nombre de otra persona (trazabilidad).
  do $$ begin
    begin
      insert into public.insumos_adjuntos (solicitud_id, url, nombre, creado_por) values
        ('00000000-0000-0000-0000-000000212001', 'x/otro.jpg', 'otro.jpg', '00000000-0000-0000-0000-0000000212a3');
      raise exception 'FALLO 77b: se pudo adjuntar a nombre de otra persona';
    exception when insufficient_privilege then null;  -- 42501 esperado (RLS)
    end;
  end $$;
  reset role;

  -- (b) El admin de Logística TAMBIÉN las ve (puede_logistica incluye admin_logistica).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000212a2')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.insumos_adjuntos;
    if n <> 1 then raise exception 'FALLO 77c: el admin de Logística no ve las imágenes (n=%)', n; end if;
  end $$;
  reset role;

  -- (c) Desde 0213, Redacción TAMBIÉN las lee (decisión del equipo: que no queden
  -- encerradas en Logística). El alta y la baja siguen siendo solo de Logística.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000212a3')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.insumos_adjuntos;
    if n <> 1 then raise exception 'FALLO 77d: Redacción no lee las imágenes de la tarea (0213 debía abrirlas, n=%)', n; end if;
    begin
      insert into public.insumos_adjuntos (solicitud_id, url, nombre, creado_por) values
        ('00000000-0000-0000-0000-000000212001', 'x/redac.jpg', 'redac.jpg', '00000000-0000-0000-0000-0000000212a3');
      raise exception 'FALLO 77d2: Redacción pudo ADJUNTAR a la galería de Logística';
    exception when insufficient_privilege then null;  -- 42501 esperado
    end;
  end $$;
  reset role;

  -- (d) Otro miembro de Logística que NO la subió no puede borrarla; quien la subió, sí.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000212a2')::text, true);
  delete from public.insumos_adjuntos where id = '00000000-0000-0000-0000-0000002120a1';
  reset role;
  do $$ declare n int; begin
    select count(*) into n from public.insumos_adjuntos where id = '00000000-0000-0000-0000-0000002120a1';
    if n <> 1 then raise exception 'FALLO 77e: un tercero de Logística borró una imagen ajena'; end if;
  end $$;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000212a1')::text, true);
  delete from public.insumos_adjuntos where id = '00000000-0000-0000-0000-0000002120a1';
  reset role;
  do $$ declare n int; begin
    select count(*) into n from public.insumos_adjuntos where id = '00000000-0000-0000-0000-0000002120a1';
    if n <> 0 then raise exception 'FALLO 77f: quien subió la imagen no pudo quitarla'; end if;
  end $$;
rollback;

-- ══ Logística adjunta A LA PROPIA SOLICITUD y lo ve todo el mundo (0213) ══

\echo '== Test 78: 0213 — Logística adjunta al CASO (lo ven Verificación y Redacción); no en Desaparecidos; su galería de tarea también se lee =='
begin;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000213a1', 'logi213@test.local'),
    ('00000000-0000-0000-0000-0000000213a2', 'verif213@test.local'),
    ('00000000-0000-0000-0000-0000000213a3', 'redac213@test.local') on conflict do nothing;
  update public.perfiles set rol = 'logistica',   roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000213a1';
  update public.perfiles set rol = 'verificador', roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000213a2';
  update public.perfiles set rol = 'redaccion',   roles_extra = '{}', verificado = true where id = '00000000-0000-0000-0000-0000000213a3';

  insert into public.casos (id, titulo, categoria, estado, creado_por) values
    ('00000000-0000-0000-0000-0000000213c1', '_TEST_0213_caso', 'Otras informaciones', 'enviado_redaccion', null),
    ('00000000-0000-0000-0000-0000000213c2', '_TEST_0213_desap', 'Desaparecidos', 'confirmado', null);

  -- (a) Logística adjunta una imagen AL CASO.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000213a1')::text, true);
  insert into public.casos_adjuntos (id, caso_id, url, nombre, mime, creado_por) values
    ('00000000-0000-0000-0000-0000002130a1', '00000000-0000-0000-0000-0000000213c1',
     'casos/00000000-0000-0000-0000-0000000213c1/foto.jpg', 'foto.jpg', 'image/jpeg',
     '00000000-0000-0000-0000-0000000213a1');
  -- …pero NO a un caso de «Desaparecidos» (ese flujo no pasa por Logística).
  do $$ begin
    begin
      insert into public.casos_adjuntos (caso_id, url, nombre, creado_por) values
        ('00000000-0000-0000-0000-0000000213c2', 'casos/x/desap.jpg', 'desap.jpg', '00000000-0000-0000-0000-0000000213a1');
      raise exception 'FALLO 78b: Logística adjuntó a un caso de Desaparecidos';
    exception when insufficient_privilege then null;  -- 42501 esperado (RLS)
    end;
  end $$;
  reset role;

  -- (b) VERIFICACIÓN ve esa imagen en la solicitud (cadj_select: quien ve el caso, la ve).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000213a2')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.casos_adjuntos where id = '00000000-0000-0000-0000-0000002130a1';
    if n <> 1 then raise exception 'FALLO 78c: Verificación no ve la imagen que adjuntó Logística (n=%)', n; end if;
  end $$;
  reset role;

  -- (c) REDACCIÓN también la ve, por su vista curada de adjuntos (0209).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000213a3')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.casos_adjuntos_difusion where caso_id = '00000000-0000-0000-0000-0000000213c1';
    if n <> 1 then raise exception 'FALLO 78d: Redacción no ve la imagen que adjuntó Logística (n=%)', n; end if;
  end $$;
  reset role;

  -- (d) La galería de la TAREA (0212) ya no es solo de Logística: Verificación la lee.
  insert into public.solicitudes_insumo (id, titulo, tipo, estado, caso_id) values
    ('00000000-0000-0000-0000-000000213001', 'ins_0213', 'otro'::public.tipo_insumo,
     'en_gestion'::public.estado_insumo, '00000000-0000-0000-0000-0000000213c1');
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000213a1')::text, true);
  insert into public.insumos_adjuntos (solicitud_id, url, nombre, creado_por) values
    ('00000000-0000-0000-0000-000000213001', '00000000-0000-0000-0000-000000213001/op.jpg', 'op.jpg',
     '00000000-0000-0000-0000-0000000213a1');
  reset role;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000213a2')::text, true);
  do $$ declare n int; begin
    select count(*) into n from public.insumos_adjuntos where solicitud_id = '00000000-0000-0000-0000-000000213001';
    if n <> 1 then raise exception 'FALLO 78e: Verificación no lee la galería de la tarea de Logística (n=%)', n; end if;
  end $$;
  reset role;
rollback;

\echo '== TODOS LOS TESTS DE RLS PASARON =='
