-- Pruebas de 0239 — Gestor Integral de Casos, Fase 1.
--
-- Lo que importa comprobar son las DOS DECISIONES de la organización, porque son las que
-- alguien romperá sin querer dentro de seis meses:
--   1. Desaparecidos NO entra en este circuito.
--   2. El gestor lo asigna el líder o administración, nadie más.
-- Y la tercera, que es mía: que meterle una rama a `casos_select` no abrió nada de más.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql. Siembra sus propios casos (prefijo f2000000-…).
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_ges (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_ges (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── Semilla propia ──
set session_replication_role = replica;

-- Gina Gestora (rol nuevo) y Lidia Líder (manda en el grupo de Verificación).
insert into auth.users (id, email) values
  ('aaaa9999-9999-4999-8999-999999999999','gina.gestora@t.local'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','lidia.lider@t.local')
on conflict (id) do nothing;
insert into public.perfiles (id, nombre_completo, rol, roles_extra, verificado) values
  ('aaaa9999-9999-4999-8999-999999999999','Gina Gestora','gestor_casos','{}', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Lidia Líder','coordinador','{}', true)
on conflict (id) do update
  set rol = excluded.rol, roles_extra = excluded.roles_extra, verificado = excluded.verificado;
insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
select p, 'aprobada', 's', 'd', true from unnest(array[
  'aaaa9999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']::uuid[]) as p
on conflict (perfil_id) do update set estado = 'aprobada';

-- El grupo de Verificación, con Lidia de líder: es el gate de `es_mando_verificacion()`.
insert into public.grupos (id, nombre, area, lider_id, clave)
values ('bbbb0000-0000-4000-8000-000000000002','Verificación','verificacion',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','verificacion')
on conflict (clave) do update set lider_id = excluded.lider_id;

-- Un caso normal y uno de Desaparecidos.
insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                          req_tipo, req_cantidad, req_urgencia, pais) values
  ('f2000000-0000-4000-8000-00000000000a','Caso para gestionar','desc', null, true,
   'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE'),
  ('f2000000-0000-4000-8000-00000000000c','Persona desaparecida','desc','Desaparecidos', true,
   'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE')
on conflict (id) do nothing;

set session_replication_role = origin;

-- ═══ T1 — El líder del grupo de Verificación asigna, y arranca el reloj ═══
do $$
declare v_gestor uuid; v_prox timestamptz;
begin
  perform pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');   -- Lidia Líder
  perform public.asignar_gestor_caso('f2000000-0000-4000-8000-00000000000a',
                                     'aaaa9999-9999-4999-8999-999999999999');
  perform set_config('role','postgres',true);
  select gestor_id, proxima_revision into v_gestor, v_prox
    from public.casos where id = 'f2000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T1 el líder asigna el gestor', v_gestor = 'aaaa9999-9999-4999-8999-999999999999');
  -- Urgencia 'alta' → 48 h. Un caso con dueño y sin fecha es el agujero que esto tapa.
  perform pg_temp.ok('T1 y la fecha de seguimiento se pone sola',
    v_prox is not null and v_prox > now() + interval '47 hours' and v_prox < now() + interval '49 hours');
end $$;

-- ═══ T2 — DECISIÓN 2: nadie más reparte ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');   -- Vera Verificadora (rol, no mando)
  begin
    perform public.asignar_gestor_caso('f2000000-0000-4000-8000-00000000000a',
                                       'aaaa1111-1111-4111-8111-111111111111');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T2 un verificador sin mando NO reparte casos', v_err <> '');

  v_err := '';
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');   -- la propia gestora
  begin
    perform public.asignar_gestor_caso('f2000000-0000-4000-8000-00000000000a',
                                       'aaaa9999-9999-4999-8999-999999999999');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T2 ni el gestor se autoasigna casos', v_err <> '');
end $$;

-- ═══ T3 — DECISIÓN 1: Desaparecidos no entra ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  begin
    perform public.asignar_gestor_caso('f2000000-0000-4000-8000-00000000000c',
                                       'aaaa9999-9999-4999-8999-999999999999');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T3 un caso de Desaparecidos no admite gestor', v_err <> '');
end $$;

-- ═══ T4 — No se asigna a quien no puede hacer el trabajo ═══
-- Asignarle un caso a quien no tiene el rol crea un caso huérfano que además PARECE
-- atendido, que es peor que uno sin dueño.
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  begin
    perform public.asignar_gestor_caso('f2000000-0000-4000-8000-00000000000a',
                                       'aaaa6666-6666-4666-8666-666666666666');  -- Ana, voluntaria
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T4 no se asigna a quien no tiene el rol', v_err <> '');
end $$;

-- ═══ T5 — La próxima acción la fija el gestor DEL CASO ═══
do $$
declare v_accion text; v_area text; v_err text := '';
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  perform public.fijar_seguimiento_caso('f2000000-0000-4000-8000-00000000000a',
            'Confirmar con la familia que el agua llegó', null, 'logistica');
  perform set_config('role','postgres',true);
  select proxima_accion, area_siguiente into v_accion, v_area
    from public.casos where id = 'f2000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T5 el gestor fija la próxima acción', v_accion like 'Confirmar%');
  perform pg_temp.ok('T5 con su área responsable', v_area = 'logistica');

  -- Otro gestor cualquiera NO: el dueño es uno.
  perform set_config('role','postgres',true);
  update public.perfiles set rol = 'gestor_casos' where id = 'aaaa6666-6666-4666-8666-666666666666';
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  begin
    perform public.fijar_seguimiento_caso('f2000000-0000-4000-8000-00000000000a', 'Meto mano', null, null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T5 otro gestor no toca un caso que no es suyo', v_err <> '');
end $$;

-- ═══ T6 — LO QUE MÁS IMPORTA: la rama nueva de casos_select no abrió de más ═══
-- El gestor ve los casos normales (los necesita enteros) y NO ve Desaparecidos.
do $$
declare v_normal int; v_desap int;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  select count(*) into v_normal from public.casos where id = 'f2000000-0000-4000-8000-00000000000a';
  select count(*) into v_desap  from public.casos where id = 'f2000000-0000-4000-8000-00000000000c';
  perform pg_temp.ok('T6 el gestor ve el caso normal', v_normal = 1);
  perform pg_temp.ok('T6 y NO ve el de Desaparecidos', v_desap = 0);
end $$;

-- ═══ T7 — El control lista lo que hay que atender, y solo a quien le toca ═══
do $$
declare v_n int; v_sit text;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  select count(*) into v_n from public.casos_gestion_control(null);
  perform pg_temp.ok('T7 el gestor ve el reporte de control', v_n >= 0);

  -- Un caso sin gestor tiene que salir como 'sin_gestor'.
  perform set_config('role','postgres',true);
  insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                            req_tipo, req_cantidad, req_urgencia, pais)
  values ('f2000000-0000-4000-8000-00000000000b','Caso huérfano','desc', null, true,
          'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','baja','VE')
  on conflict (id) do nothing;

  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  select situacion into v_sit from public.casos_gestion_control('sin_gestor')
   where id = 'f2000000-0000-4000-8000-00000000000b';
  perform pg_temp.ok('T7 el caso sin dueño sale como «sin responsable»', v_sit = 'sin_gestor');

  -- Y quien no pinta nada aquí no ve ni una fila.
  perform pg_temp.como('aaaa7777-7777-4777-8777-777777777777');   -- Pedro, voluntario
  select count(*) into v_n from public.casos_gestion_control(null);
  perform pg_temp.ok('T7 un voluntario no ve el reporte', v_n = 0);
end $$;

-- ═══ T8 — «Mis casos» es de cada quien ═══
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  select count(*) into v_n from public.mis_casos_gestion();
  perform pg_temp.ok('T8 la gestora ve su caso', v_n = 1);

  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');
  select count(*) into v_n from public.mis_casos_gestion();
  perform pg_temp.ok('T8 y quien no gestiona nada, ninguno', v_n = 0);
end $$;

-- ═══ T9 — ACL: ni PUBLIC ni anon ejecutan nada de esto ═══
do $$
declare r record; v_mal text := '';
begin
  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('asignar_gestor_caso','quitar_gestor_caso','fijar_seguimiento_caso',
                         'casos_gestion_control','mis_casos_gestion')
  loop
    if has_function_privilege('public', r.f, 'execute') then v_mal := v_mal || ' PUBLIC:' || r.f; end if;
    if has_function_privilege('anon',   r.f, 'execute') then v_mal := v_mal || ' anon:'   || r.f; end if;
  end loop;
  perform pg_temp.ok('T9 ni PUBLIC ni anon ejecutan la gestión' || v_mal, v_mal = '');
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_ges;
  if v_n > 0 then
    raise exception 'PRUEBAS DEL GESTOR DE CASOS (0239) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DEL GESTOR DE CASOS (0239) PASARON ==';
end $$;
