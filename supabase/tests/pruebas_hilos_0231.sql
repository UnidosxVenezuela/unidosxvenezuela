-- Pruebas de 0231 — hilos de trabajo.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql. No son re-ejecutables sobre la misma base:
-- varias comprueban contadores y avisos ('el contador sube a 1', 'sí notifica'), que
-- una segunda pasada dejaría en 2. Es la misma condición que verificar_rls.sql y la que
-- cumple CI, que levanta una base limpia por ejecución.
\set ON_ERROR_STOP off
\pset pager off

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Los fallos se ANOTAN, no solo se imprimen: al final se lanza una excepción si hay
-- alguno. Sin esto psql sale con código 0 y CI daría verde con las pruebas en rojo.
create temporary table if not exists pg_fallos (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos (nombre) values (nom); end if;
end $$;

-- ═══ T1 — Un verificador escribe en el hilo de un caso; el hilo se crea solo ═══
do $$
declare v_msg uuid; v_hilo uuid; v_n int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','aaaa1111-1111-4111-8111-111111111111','role','authenticated')::text, true);

  v_msg := public.escribir_en_hilo('caso','e0000000-0000-4000-8000-000000000001',
                                   'Confirmo que la familia sigue en el refugio.', null);
  select h.id, h.mensajes_n into v_hilo, v_n
    from public.hilos h where h.ambito='caso' and h.ancla_id='e0000000-0000-4000-8000-000000000001';
  perform pg_temp.ok('T1 el mensaje se crea', v_msg is not null);
  perform pg_temp.ok('T1 el hilo se abre solo', v_hilo is not null);
  perform pg_temp.ok('T1 el contador sube a 1', v_n = 1);
end $$;

-- ═══ T2 — LA TRAMPA DE 0180: Redacción NO lee el hilo de un caso ═══
-- rol `redaccion` no tiene rama en casos_select desde 0180. Si el hilo se autorizara por
-- rol, aquí vería filas. Debe ver cero, y no debe poder escribir.
do $$
declare v_filas int; v_err text := '';
begin
  perform pg_temp.como('aaaa2222-2222-4222-8222-222222222222');
  select count(*) into v_filas from public.hilo_mensajes;
  perform pg_temp.ok('T2 Redacción no ve ningún mensaje de caso', v_filas = 0);

  perform pg_temp.ok('T2 puede_leer_caso() dice que no',
                     public.puede_leer_caso('e0000000-0000-4000-8000-000000000001') = false);
  begin
    perform public.escribir_en_hilo('caso','e0000000-0000-4000-8000-000000000001','intruso', null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T2 Redacción no puede escribir', v_err <> '');
end $$;

-- ═══ T3 — Escritura directa denegada: RLS y candado ═══
do $$
declare v_hilo uuid; v_err1 text := ''; v_err2 text := '';
begin
  perform set_config('role','postgres',true);
  select id into v_hilo from public.hilos where ambito='caso' limit 1;

  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');
  begin
    insert into public.hilo_mensajes (hilo_id, autor_id, autor_sello, cuerpo)
    values (v_hilo, auth.uid(), 'X', 'por la puerta de atrás');
  exception when others then v_err1 := sqlerrm;
  end;
  perform pg_temp.ok('T3 INSERT directo denegado', v_err1 <> '');

  -- El DELETE no lanza error: sin policy de DELETE la RLS no le da NINGUNA fila, así que
  -- borra cero y calla — el comportamiento normal del repo. Lo que hay que comprobar es
  -- que no desapareció nada. Que el candado sí lanza se prueba en T4, con el dueño, que
  -- es donde la RLS no protege.
  declare v_antes int; v_despues int;
  begin
    select count(*) into v_antes from public.hilo_mensajes;
    delete from public.hilo_mensajes where hilo_id = v_hilo;
    get diagnostics v_err2 = row_count;
    select count(*) into v_despues from public.hilo_mensajes;
    perform pg_temp.ok('T3 el DELETE no borra ninguna fila', v_err2 = '0' and v_antes = v_despues);
  end;
end $$;

-- ═══ T4 — El candado aguanta incluso al dueño de la tabla ═══
-- Un SECURITY DEFINER futuro correría con permisos de dueño y saltaría la RLS. El
-- trigger de partida doble tiene que pararlo igual.
do $$
declare v_hilo uuid; v_err text := ''; v_del text := '';
begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('role','postgres',true);
  select id into v_hilo from public.hilos where ambito='caso' limit 1;
  begin
    insert into public.hilo_mensajes (hilo_id, autor_sello, cuerpo)
    values (v_hilo, 'Dueño', 'saltándome las RPC');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T4 el dueño tampoco inserta sin flag', v_err <> '');
  begin
    delete from public.hilo_mensajes where hilo_id = v_hilo;
  exception when others then v_del := sqlerrm;
  end;
  perform pg_temp.ok('T4 el dueño tampoco borra', v_del <> '');
end $$;

-- ═══ T5 — Ámbito grupo: dentro sí, fuera no ═══
do $$
declare v_err text := ''; v_filas int;
begin
  perform pg_temp.como('aaaa4444-4444-4444-8444-444444444444');
  perform public.escribir_en_hilo('grupo','bbbb0000-0000-4000-8000-000000000001',
                                  'Mañana salimos a las 6.', null);
  select count(*) into v_filas from public.hilo_mensajes m
    join public.hilos h on h.id = m.hilo_id where h.ambito='grupo';
  perform pg_temp.ok('T5 el miembro escribe y lee', v_filas = 1);

  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  select count(*) into v_filas from public.hilo_mensajes m
    join public.hilos h on h.id = m.hilo_id where h.ambito='grupo';
  perform pg_temp.ok('T5 quien no es del grupo no ve nada', v_filas = 0);
  begin
    perform public.escribir_en_hilo('grupo','bbbb0000-0000-4000-8000-000000000001','hola', null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T5 y tampoco escribe', v_err <> '');
end $$;

-- ═══ T6 — El observador lee pero no escribe (doctrina 0009) ═══
do $$
declare v_err text := '';
begin
  perform set_config('role','postgres',true);
  insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
  values ('bbbb0000-0000-4000-8000-000000000001','aaaa5555-5555-4555-8555-555555555555','miembro')
  on conflict do nothing;

  perform pg_temp.como('aaaa5555-5555-4555-8555-555555555555');
  perform pg_temp.ok('T6 el observador lee el hilo de su grupo',
    (select count(*) from public.hilo_mensajes m join public.hilos h on h.id=m.hilo_id
      where h.ambito='grupo') = 1);
  begin
    perform public.escribir_en_hilo('grupo','bbbb0000-0000-4000-8000-000000000001','opino', null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T6 el observador NO escribe', v_err <> '');
end $$;

-- ═══ T7 — Editar conserva la versión, y solo administración la lee ═══
do $$
declare v_msg uuid; v_hilo uuid; v_ver int; v_err text := '';
begin
  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');
  select m.id, m.hilo_id into v_msg, v_hilo from public.hilo_mensajes m
    join public.hilos h on h.id=m.hilo_id where h.ambito='caso' limit 1;

  perform public.editar_mensaje_hilo(v_msg, 'Corrijo: siguen en el refugio de la escuela.');
  perform pg_temp.ok('T7 el mensaje queda marcado como editado',
    (select editado_en is not null from public.hilo_mensajes where id = v_msg));

  -- El autor NO ve la versión anterior.
  select count(*) into v_ver from public.hilo_versiones where mensaje_id = v_msg;
  perform pg_temp.ok('T7 el autor no lee la versión anterior', v_ver = 0);

  -- Administración sí.
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  select count(*) into v_ver from public.hilo_versiones where mensaje_id = v_msg;
  perform pg_temp.ok('T7 administración sí la lee', v_ver = 1);

  -- Nadie edita el mensaje de otro.
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  begin
    perform public.editar_mensaje_hilo(v_msg, 'me apropio del mensaje');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T7 nadie edita el mensaje de otro', v_err <> '');
end $$;

-- ═══ T8 — Detección de datos sensibles: marca, no bloquea ═══
do $$
declare v_msg uuid; v_pii text[];
begin
  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');
  v_msg := public.escribir_en_hilo('caso','e0000000-0000-4000-8000-000000000001',
    'La señora es V-12.345.678, su móvil 0414-1234567, correo ana@ejemplo.com, está en 10.4806, -66.9036', null);
  select pii_alerta into v_pii from public.hilo_mensajes where id = v_msg;
  perform pg_temp.ok('T8 el mensaje SÍ se envía', v_msg is not null);
  perform pg_temp.ok('T8 marca la cédula',      'cedula_ve'   = any(v_pii));
  perform pg_temp.ok('T8 marca el móvil',       'movil_ve'    = any(v_pii));
  perform pg_temp.ok('T8 marca el correo',      'correo'      = any(v_pii));
  perform pg_temp.ok('T8 marca las coordenadas','coordenadas' = any(v_pii));
  perform pg_temp.ok('T8 un mensaje normal no marca nada',
    coalesce(array_length(public.detectar_datos_sensibles('Mañana llevamos 20 colchones al refugio.'),1),0) = 0);
end $$;

-- ═══ T9 — Ámbito insumo: Logística entra, un verificado cualquiera NO ═══
-- Lo que se prueba aquí es la decisión de estrechar: `solins_lectura` (0050) es
-- `es_verificado()`, así que si el hilo copiara esa policy, CUALQUIER cuenta verificada
-- leería la conversación de Logística. Debe seguir la compuerta de /insumos/[id].
do $$
declare v_filas int; v_err text := '';
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  perform public.escribir_en_hilo('insumo','dddd0000-0000-4000-8000-000000000001',
                                  'El camión sale mañana a las 6 desde el centro de Chacao.', null);
  select count(*) into v_filas from public.hilo_mensajes m
    join public.hilos h on h.id=m.hilo_id where h.ambito='insumo';
  perform pg_temp.ok('T9 Logística escribe y lee su entrega', v_filas = 1);

  -- Ana está verificada, así que `solins_lectura` SÍ le deja ver la solicitud de insumo…
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  perform pg_temp.ok('T9 una cuenta verificada sí ve la solicitud de insumo',
    (select count(*) from public.solicitudes_insumo) >= 1);
  -- …pero NO su conversación.
  select count(*) into v_filas from public.hilo_mensajes m
    join public.hilos h on h.id=m.hilo_id where h.ambito='insumo';
  perform pg_temp.ok('T9 pero NO la conversación de la entrega', v_filas = 0);
  begin
    perform public.escribir_en_hilo('insumo','dddd0000-0000-4000-8000-000000000001','hola', null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T9 y tampoco escribe en ella', v_err <> '');

  -- Y Redacción sigue sin el hilo del caso (la trampa de 0180, comprobada de nuevo).
  perform pg_temp.como('aaaa2222-2222-4222-8222-222222222222');
  select count(*) into v_filas from public.hilo_mensajes m
    join public.hilos h on h.id=m.hilo_id where h.ambito='caso';
  perform pg_temp.ok('T9 Redacción sigue sin el hilo del caso', v_filas = 0);
end $$;

-- ═══ T10 — Dar de baja una cuenta no rompe ni borra el registro ═══
do $$
declare v_n_antes int; v_n_despues int; v_sello text;
begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('role','postgres',true);
  select count(*) into v_n_antes from public.hilo_mensajes;

  delete from public.perfiles where id = 'aaaa4444-4444-4444-8444-444444444444';
  delete from auth.users where id = 'aaaa4444-4444-4444-8444-444444444444';

  select count(*) into v_n_despues from public.hilo_mensajes;
  select autor_sello into v_sello from public.hilo_mensajes m
    join public.hilos h on h.id=m.hilo_id where h.ambito='grupo' limit 1;
  perform pg_temp.ok('T10 borrar el perfil no falla y no borra mensajes', v_n_antes = v_n_despues);
  perform pg_temp.ok('T10 el sello conserva quién lo dijo', v_sello = 'Marta Miembro');
  perform pg_temp.ok('T10 y el autor_id queda en null',
    (select autor_id is null from public.hilo_mensajes m join public.hilos h on h.id=m.hilo_id
      where h.ambito='grupo' limit 1));
end $$;

-- ═══ T11 — Anonimizar autoría: solo administración ═══
do $$
declare v_err text := ''; v_n int;
begin
  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');
  begin
    perform public.anonimizar_autoria_hilos('aaaa1111-1111-4111-8111-111111111111');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T11 un no-admin no puede anonimizar', v_err <> '');

  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  v_n := public.anonimizar_autoria_hilos('aaaa1111-1111-4111-8111-111111111111');
  perform pg_temp.ok('T11 administración sí, y toca los mensajes', v_n >= 1);
  perform pg_temp.ok('T11 el sello queda neutro',
    (select count(*) from public.hilo_mensajes where autor_sello = 'Cuenta dada de baja') >= 1);
end $$;

-- ═══ T12 — Mención: notifica a quien participa, no al ajeno ═══
do $$
declare v_msg uuid; v_notif int;
begin
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  -- Luis nunca ha entrado a este hilo de grupo → no debe recibir aviso (lado seguro).
  v_msg := public.escribir_en_hilo('grupo','bbbb0000-0000-4000-8000-000000000001',
             'Aviso al equipo', array['aaaa3333-3333-4333-8333-333333333333']::uuid[]);
  perform set_config('role','postgres',true);
  select count(*) into v_notif from public.notificaciones
   where destinatario_id='aaaa3333-3333-4333-8333-333333333333' and tipo='mencion';
  perform pg_temp.ok('T12 no notifica a quien no participa del hilo', v_notif = 0);

  -- Olga sí es miembro y ya leyó el hilo (T6), así que participa.
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  perform public.escribir_en_hilo('grupo','bbbb0000-0000-4000-8000-000000000001',
            'Olga, ¿puedes cubrir?', array['aaaa5555-5555-4555-8555-555555555555']::uuid[]);
  perform set_config('role','postgres',true);
  select count(*) into v_notif from public.notificaciones
   where destinatario_id='aaaa5555-5555-4555-8555-555555555555' and tipo='mencion';
  perform pg_temp.ok('T12 sí notifica a quien participa', v_notif = 1);
end $$;

-- ═══ T13 — Bandeja: cada quien ve solo sus hilos y sus no leídos ═══
do $$
declare v_ajena int; v_admin int;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  select count(*) into v_ajena from public.hilos_bandeja;
  perform pg_temp.ok('T13 quien no participa de nada tiene bandeja vacía', v_ajena = 0);

  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  select count(*) into v_admin from public.hilos_bandeja;
  perform pg_temp.ok('T13 administración ve los hilos con actividad', v_admin >= 3);
end $$;

-- ═══ T14 — ACL: anon y PUBLIC no ejecutan nada del módulo ═══
-- (El arnés concede execute a `authenticated` sobre todo public DESPUÉS de migrar, así
--  que probar `authenticated` mediría el arnés. Se prueba el vector que importa.)
do $$
declare r record; v_mal text := '';
begin
  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('escribir_en_hilo','editar_mensaje_hilo','abrir_hilo',
                         'marcar_hilo_leido','anonimizar_autoria_hilos','puede_leer_hilo',
                         'puede_leer_caso','perfil_puede_leer_hilo','gate_hilo_escritura')
  loop
    if has_function_privilege('public', r.f, 'execute') then
      v_mal := v_mal || ' PUBLIC:' || r.f;
    end if;
    if has_function_privilege('anon', r.f, 'execute') then
      v_mal := v_mal || ' anon:' || r.f;
    end if;
  end loop;
  perform pg_temp.ok('T14 ni PUBLIC ni anon ejecutan el módulo' || v_mal, v_mal = '');
end $$;

-- ═══ Idempotencia de 0231: NO se comprueba aquí ═══
-- Se hacía con «\i supabase/migrations/0231_hilos_de_trabajo.sql» y era un FALSO VERDE:
-- el workflow de RLS mueve las migraciones a /tmp/migs antes de arrancar Supabase, así
-- que en CI el fichero no existía. Peor: psql NO se detiene ante un \i que falla ni con
-- ON_ERROR_STOP=1 —solo imprime «error: No such file or directory»— y la prueba seguía
-- dando PASA sin haber cargado nada.
-- Ahora la comprueba el propio workflow, con un paso que reaplica la migración DESPUÉS
-- de estas pruebas: así se ejerce sobre una base con datos, que es el caso difícil.

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos;
  if v_n > 0 then
    raise exception 'PRUEBAS DE HILOS (0231) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DE HILOS (0231) PASARON ==';
end $$;
