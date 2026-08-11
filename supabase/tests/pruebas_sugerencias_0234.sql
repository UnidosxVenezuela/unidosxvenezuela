-- Pruebas de 0234 — buzón de problemas e ideas.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql. Usa un usuario PROPIO (Pedro Reporta) y no los
-- de las pruebas de hilos: aquellas dan de baja a Marta en su T10, y depender del estado
-- que deja otra suite es una trampa esperando a que alguien cambie el orden en CI.
-- Misma condición que verificar_rls.sql: base limpia por ejecución, como hace CI.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_sug (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_sug (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ═══ T1 — Cualquiera verificado reporta, y la ruta se guarda ═══
do $$
declare v_id uuid; v_ruta text;
begin
  perform pg_temp.como('aaaa7777-7777-4777-8777-777777777777');
  v_id := public.enviar_sugerencia('problema',
            'Al guardar un ítem me sale «error 42501» y se pierde lo escrito.', '/casos/abc');
  perform set_config('role','postgres',true);
  select ruta into v_ruta from public.sugerencias where id = v_id;
  perform pg_temp.ok('T1 se envía el reporte', v_id is not null);
  perform pg_temp.ok('T1 y guarda la ruta sola', v_ruta = '/casos/abc');
end $$;

-- ═══ T2 — El OBSERVADOR también reporta ═══
-- Es de solo lectura para el trabajo, no para decir que algo está roto — y suele ser
-- quien más lo ve.
do $$
declare v_id uuid;
begin
  perform pg_temp.como('aaaa5555-5555-4555-8555-555555555555');
  v_id := public.enviar_sugerencia('idea', 'Estaría bien poder filtrar por país en el mapa.', '/mapa');
  perform pg_temp.ok('T2 el observador también reporta', v_id is not null);
end $$;

-- ═══ T3 — LO QUE IMPORTA: nadie ve el reporte de otro ═══
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  select count(*) into v_n from public.sugerencias;
  perform pg_temp.ok('T3 un voluntario no ve reportes ajenos', v_n = 0);

  perform pg_temp.como('aaaa7777-7777-4777-8777-777777777777');
  select count(*) into v_n from public.sugerencias;
  perform pg_temp.ok('T3 pero sí ve LOS SUYOS', v_n = 1);

  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  select count(*) into v_n from public.sugerencias;
  perform pg_temp.ok('T3 y administración los ve todos', v_n = 2);
end $$;

-- ═══ T4 — Administración recibe el aviso al instante ═══
do $$
declare v_n int;
begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('role','postgres',true);
  select count(*) into v_n from public.notificaciones
   where tipo = 'sugerencia' and destinatario_id = 'aaaa0000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T4 administración recibe aviso de cada reporte', v_n = 2);
end $$;

-- ═══ T5 — Escritura directa denegada ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa7777-7777-4777-8777-777777777777');
  begin
    insert into public.sugerencias (tipo, mensaje, autor_sello)
    values ('idea', 'por la puerta de atrás', 'X');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T5 INSERT directo denegado', v_err <> '');
end $$;

-- ═══ T6 — Solo administración atiende, y la respuesta llega a quien reportó ═══
do $$
declare v_id uuid; v_err text := ''; v_estado text; v_n int;
begin
  perform set_config('role','postgres',true);
  select id into v_id from public.sugerencias
   where autor_id = 'aaaa7777-7777-4777-8777-777777777777' limit 1;

  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  begin
    perform public.atender_sugerencia(v_id, 'descartada', 'no me gusta');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T6 un voluntario no atiende el buzón', v_err <> '');

  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  perform public.atender_sugerencia(v_id, 'resuelta', 'Corregido en la versión de hoy. Gracias por avisar.');
  perform set_config('role','postgres',true);
  select estado into v_estado from public.sugerencias where id = v_id;
  perform pg_temp.ok('T6 administración sí, y cambia el estado', v_estado = 'resuelta');

  select count(*) into v_n from public.notificaciones
   where destinatario_id = 'aaaa7777-7777-4777-8777-777777777777' and tipo = 'sugerencia';
  perform pg_temp.ok('T6 y avisa a quien reportó', v_n = 1);
end $$;

-- ═══ T7 — Quien reportó LEE la respuesta ═══
-- Sin esto, reportar sería gritar a un pozo y a la tercera se deja de reportar.
do $$
declare v_nota text;
begin
  perform pg_temp.como('aaaa7777-7777-4777-8777-777777777777');
  select nota_admin into v_nota from public.sugerencias
   where autor_id = 'aaaa7777-7777-4777-8777-777777777777' limit 1;
  perform pg_temp.ok('T7 quien reportó lee la respuesta',
    v_nota = 'Corregido en la versión de hoy. Gracias por avisar.');
end $$;

-- ═══ T8 — Tipo y estado inválidos se rechazan ═══
do $$
declare v_e1 text := ''; v_e2 text := ''; v_e3 text := '';
begin
  perform pg_temp.como('aaaa7777-7777-4777-8777-777777777777');
  begin perform public.enviar_sugerencia('queja', 'texto', null);
  exception when others then v_e1 := sqlerrm; end;
  perform pg_temp.ok('T8 tipo inválido rechazado', v_e1 <> '');

  begin perform public.enviar_sugerencia('idea', '   ', null);
  exception when others then v_e2 := sqlerrm; end;
  perform pg_temp.ok('T8 mensaje vacío rechazado', v_e2 <> '');

  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  begin
    perform public.atender_sugerencia(
      (select id from public.sugerencias limit 1), 'inventado', null);
  exception when others then v_e3 := sqlerrm; end;
  perform pg_temp.ok('T8 estado inválido rechazado', v_e3 <> '');
end $$;

-- ═══ T9 — Anti-inundación: 5 por hora ═══
do $$
declare v_err text := ''; i int;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  for i in 1..5 loop
    perform public.enviar_sugerencia('idea', 'idea número ' || i, null);
  end loop;
  begin
    perform public.enviar_sugerencia('idea', 'la sexta', null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T9 el sexto envío en una hora se frena', v_err <> '');
end $$;

-- ═══ T10 — ACL: ni PUBLIC ni anon ejecutan las RPC ═══
do $$
declare r record; v_mal text := '';
begin
  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('enviar_sugerencia','atender_sugerencia')
  loop
    if has_function_privilege('public', r.f, 'execute') then v_mal := v_mal || ' PUBLIC:' || r.f; end if;
    if has_function_privilege('anon',   r.f, 'execute') then v_mal := v_mal || ' anon:'   || r.f; end if;
  end loop;
  perform pg_temp.ok('T10 ni PUBLIC ni anon ejecutan el buzón' || v_mal, v_mal = '');
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_sug;
  if v_n > 0 then
    raise exception 'PRUEBAS DEL BUZÓN (0234) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DEL BUZÓN (0234) PASARON ==';
end $$;
