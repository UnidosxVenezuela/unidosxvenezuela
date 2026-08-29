-- Pruebas de 0238 — registro de los avisos generales.
--
-- Lo que se comprueba de verdad no es que la fila se guarde: es que la RPC FRENA antes de
-- que salga nada. Un aviso llega a toda la organización y no se puede recoger, así que si
-- el anti-duplicado o el gate fallan, el daño ya está hecho cuando alguien se entera.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql, de la que solo usa los usuarios.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_av (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_av (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ═══ T1 — Un admin registra el aviso y queda con su cuenta de destinatarios ═══
do $$
declare v_id uuid; v_n int; v_sello text;
begin
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');   -- Admin Hilos
  v_id := public.registrar_aviso_enviado('Reunión general hoy', 'A las 6, en el canal general.',
            null, null, 'todos', null, 42);
  perform set_config('role','postgres',true);
  select destinatarios, autor_sello into v_n, v_sello from public.avisos_enviados where id = v_id;
  perform pg_temp.ok('T1 el aviso queda registrado', v_id is not null);
  perform pg_temp.ok('T1 con su cuenta de destinatarios', v_n = 42);
  perform pg_temp.ok('T1 y con quién lo mandó', v_sello = 'Admin Hilos');
end $$;

-- ═══ T2 — LO QUE IMPORTA: el doble clic no sale dos veces ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  begin
    perform public.registrar_aviso_enviado('Reunión general hoy', 'A las 6, en el canal general.',
              null, null, 'todos', null, 42);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T2 el mismo aviso repetido se frena', v_err <> '');
end $$;

-- ═══ T3 — Cambiarle algo sí deja mandarlo ═══
-- El anti-duplicado va contra el doble clic, no contra rectificar una errata.
do $$
declare v_id uuid;
begin
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  v_id := public.registrar_aviso_enviado('Reunión general hoy', 'Corrijo: a las 7.',
            null, null, 'todos', null, 42);
  perform pg_temp.ok('T3 con el cuerpo cambiado sí pasa', v_id is not null);
end $$;

-- ═══ T4 — Solo administración envía ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Luis Logística
  begin
    perform public.registrar_aviso_enviado('Aviso de Luis', 'hola', null, null, 'todos', null, 1);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T4 un no-admin no envía avisos generales', v_err <> '');
end $$;

-- ═══ T5 — El historial es de administración ═══
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');   -- Ana Ajena, voluntaria
  select count(*) into v_n from public.avisos_enviados;
  perform pg_temp.ok('T5 un voluntario no ve el historial', v_n = 0);

  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  select count(*) into v_n from public.avisos_enviados;
  perform pg_temp.ok('T5 administración sí lo ve', v_n >= 2);
end $$;

-- ═══ T6 — Sin policies de escritura: ni el admin toca la tabla a mano ═══
-- Molde 0172. Sin policy de INSERT la RLS lo corta; sin la de DELETE, un borrado se lleva
-- cero filas y el historial no se puede maquillar.
do $$
declare v_err text := ''; v_n int; v_borradas int;
begin
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  begin
    insert into public.avisos_enviados (titulo, autor_sello) values ('A mano', 'X');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T6 no se inserta a mano ni siendo admin', v_err <> '');

  select count(*) into v_n from public.avisos_enviados;
  delete from public.avisos_enviados;
  get diagnostics v_borradas = row_count;
  perform pg_temp.ok('T6 y no se borra el historial', v_borradas = 0);
  perform pg_temp.ok('T6 las filas siguen ahí',
    (select count(*) from public.avisos_enviados) = v_n);
end $$;

-- ═══ T7 — Cinco por hora y para: la campana deja de leerse si suena de más ═══
do $$
declare v_err text := '';
begin
  -- Se completan cinco en la última hora sembrando directamente (bypassa la RPC a
  -- propósito: lo que se prueba es el freno, no cómo llegaron las filas).
  perform set_config('role','postgres',true);
  insert into public.avisos_enviados (titulo, cuerpo, autor_sello, autor_id, destinatarios)
  select 'Relleno ' || i, 'x', 'Admin Hilos', 'aaaa0000-0000-4000-8000-00000000000a', 1
    from generate_series(1, 5) as i;

  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  begin
    perform public.registrar_aviso_enviado('Uno más', 'y otro', null, null, 'todos', null, 1);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T7 el sexto aviso de la hora se frena', v_err <> '');
end $$;

-- ═══ T8 — ACL: ni PUBLIC ni anon ejecutan la RPC ═══
do $$
declare r record; v_mal text := '';
begin
  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'registrar_aviso_enviado'
  loop
    if has_function_privilege('public', r.f, 'execute') then v_mal := v_mal || ' PUBLIC:' || r.f; end if;
    if has_function_privilege('anon',   r.f, 'execute') then v_mal := v_mal || ' anon:'   || r.f; end if;
  end loop;
  perform pg_temp.ok('T8 ni PUBLIC ni anon ejecutan el envío' || v_mal, v_mal = '');
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_av;
  if v_n > 0 then
    raise exception 'PRUEBAS DE AVISOS GENERALES (0238) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DE AVISOS GENERALES (0238) PASARON ==';
end $$;
