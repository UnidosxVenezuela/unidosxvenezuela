-- Pruebas de 0235 — conversación general + stickers.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql. Usa usuarios propios donde importa: las pruebas
-- de hilos dan de baja a Marta en su T10, y depender del estado que deja otra suite es
-- una trampa esperando a que alguien cambie el orden en CI.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_gral (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_gral (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ═══ T1 — Existe UNA sola conversación general, creada por la migración ═══
-- Que exista de antemano importa: «no existe hasta que alguien hable» es justo lo que
-- hace que nadie hable primero.
do $$
declare v_n int;
begin
  perform set_config('role','postgres',true);
  select count(*) into v_n from public.hilos where ambito = 'general';
  perform pg_temp.ok('T1 la conversación general ya existe', v_n = 1);
end $$;

-- ═══ T2 — El índice único impide una segunda ═══
-- Es la razón de usar un UUID centinela en vez de dejar `ancla_id` nullable: con NULL,
-- el índice único (ambito, ancla_id) no protege nada, porque dos NULL no son iguales.
do $$
declare v_err text := '';
begin
  perform set_config('role','postgres',true);
  perform set_config('app.hilo_ok','1',true);
  begin
    insert into public.hilos (ambito, ancla_id)
    values ('general','00000000-0000-0000-0000-000000000000');
  exception when others then v_err := sqlerrm;
  end;
  perform set_config('app.hilo_ok','',true);
  perform pg_temp.ok('T2 no puede haber una segunda conversación general', v_err <> '');
end $$;

-- ═══ T3 — Cualquiera verificado la lee y escribe, sin pasar el centinela ═══
do $$
declare v_msg uuid; v_n int;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');   -- Ana, sin grupo ni área
  v_msg := public.escribir_en_hilo('general', null, 'Mañana no hay transporte hacia el sur.', null, null);
  perform pg_temp.ok('T3 una cuenta sin grupo ni área escribe en el general', v_msg is not null);

  -- Y otra persona distinta lo lee: eso es lo que no daban los hilos anclados.
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Luis, Logística
  select count(*) into v_n from public.hilo_mensajes m
    join public.hilos h on h.id = m.hilo_id where h.ambito = 'general';
  perform pg_temp.ok('T3 y alguien de otro equipo lo lee', v_n = 1);
end $$;

-- ═══ T4 — Sin verificar, no se entra ═══
do $$
declare v_err text := ''; v_n int; v_id uuid := 'aaaa9999-9999-4999-8999-999999999999';
begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('role','postgres',true);
  insert into auth.users (id, email) values (v_id,'sinverificar@t.local') on conflict do nothing;
  insert into public.perfiles (id, nombre_completo, rol, verificado)
  values (v_id,'Sin Verificar','voluntario', false)
  on conflict (id) do update set verificado = false;

  perform pg_temp.como(v_id);
  select count(*) into v_n from public.hilo_mensajes m
    join public.hilos h on h.id = m.hilo_id where h.ambito = 'general';
  perform pg_temp.ok('T4 sin verificar no lee el general', v_n = 0);
  begin
    perform public.escribir_en_hilo('general', null, 'hola', null, null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T4 y tampoco escribe', v_err <> '');
end $$;

-- ═══ T5 — El observador lee el general pero no escribe ═══
do $$
declare v_err text := ''; v_n int;
begin
  perform pg_temp.como('aaaa5555-5555-4555-8555-555555555555');
  select count(*) into v_n from public.hilo_mensajes m
    join public.hilos h on h.id = m.hilo_id where h.ambito = 'general';
  perform pg_temp.ok('T5 el observador lee el general', v_n >= 1);
  begin
    perform public.escribir_en_hilo('general', null, 'opino', null, null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T5 el observador NO escribe', v_err <> '');
end $$;

-- ═══ T6 — Stickers: se envían, se guardan y NO pasan por el detector ═══
-- Un sticker es texto de catálogo, no algo que la persona escribió: analizarlo sería
-- marcar como dato sensible una etiqueta que escribimos nosotros.
do $$
declare v_msg uuid; v_st text; v_cuerpo text; v_pii text[];
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  v_msg := public.escribir_en_hilo('general', null, 'Voy en camino', null, 'voy');
  perform set_config('role','postgres',true);
  select sticker, cuerpo, pii_alerta into v_st, v_cuerpo, v_pii
    from public.hilo_mensajes where id = v_msg;
  perform pg_temp.ok('T6 el sticker se guarda', v_st = 'voy');
  perform pg_temp.ok('T6 el cuerpo conserva su etiqueta', v_cuerpo = 'Voy en camino');
  perform pg_temp.ok('T6 no se analiza como texto libre', coalesce(array_length(v_pii,1),0) = 0);
end $$;

-- ═══ T7 — Un sticker inventado se rechaza ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  begin
    perform public.escribir_en_hilo('general', null, 'texto', null, 'cohete-pirata');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T7 un sticker fuera del catálogo se rechaza', v_err <> '');
end $$;

-- ═══ T8 — Un sticker sin texto no deja el registro vacío ═══
do $$
declare v_msg uuid; v_cuerpo text;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  v_msg := public.escribir_en_hilo('general', null, null, null, 'hecho');
  perform set_config('role','postgres',true);
  select cuerpo into v_cuerpo from public.hilo_mensajes where id = v_msg;
  perform pg_temp.ok('T8 un sticker sin texto guarda algo legible', coalesce(v_cuerpo,'') <> '');
end $$;

-- ═══ T9 — El general NO abre los hilos anclados ═══
-- Lo importante del cambio: sumar un canal abierto no puede aflojar los cerrados.
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');   -- Ana, ajena a todo
  select count(*) into v_n from public.hilo_mensajes m
    join public.hilos h on h.id = m.hilo_id where h.ambito <> 'general';
  perform pg_temp.ok('T9 quien solo tiene el general no ve ningún hilo anclado', v_n = 0);

  perform pg_temp.ok('T9 y sigue sin poder leer un caso',
                     public.puede_leer_caso('e0000000-0000-4000-8000-000000000001') = false);
end $$;

-- ═══ T10 — El candado y el ACL siguen en pie tras cambiar la firma ═══
do $$
declare v_err text := ''; v_mal text := ''; r record;
begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('role','postgres',true);
  begin
    insert into public.hilo_mensajes (hilo_id, autor_sello, cuerpo)
    values ((select id from public.hilos where ambito='general'), 'Dueño', 'sin pasar por la RPC');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T10 el candado sigue parando al dueño', v_err <> '');

  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('escribir_en_hilo','abrir_hilo','stickers_disponibles','puede_leer_ancla')
  loop
    if has_function_privilege('public', r.f, 'execute') then v_mal := v_mal || ' PUBLIC:' || r.f; end if;
    if has_function_privilege('anon',   r.f, 'execute') then v_mal := v_mal || ' anon:'   || r.f; end if;
  end loop;
  perform pg_temp.ok('T10 ni PUBLIC ni anon ejecutan lo nuevo' || v_mal, v_mal = '');

  -- Y no quedó viva la firma anterior de escribir_en_hilo: con las dos, PostgREST puede
  -- resolver la equivocada.
  select count(*) into v_err from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='escribir_en_hilo';
  perform pg_temp.ok('T10 solo existe UNA escribir_en_hilo', v_err = '1');
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_gral;
  if v_n > 0 then
    raise exception 'PRUEBAS DEL GENERAL (0235) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DEL GENERAL (0235) PASARON ==';
end $$;
