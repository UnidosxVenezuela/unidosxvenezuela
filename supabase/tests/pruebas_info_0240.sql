-- Pruebas de 0240 — solicitudes de información (Gestor de Casos, Fase 2).
--
-- Lo que importa: que una petición llegue a un área que NO lee el caso (ese es todo el
-- punto — Logística no tiene el caso concedido por `casos_select` y aun así tiene que
-- poder contestar), que responder y cerrar sean pasos distintos, y que «bloqueado» por fin
-- se calcule de verdad en el reporte de control.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql y de pruebas_gestor_0239.sql, que deja sembrados
-- la gestora (Gina), el líder (Lidia) y el caso f2000000-…-000a con gestora asignada.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_inf (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_inf (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── Un caso que Logística NO puede leer ──
-- Su rama en `casos_select` exige estado confirmado/enviado_redaccion/resuelto, así que un
-- 'pendiente' le queda fuera. Es la única forma de probar que la petición llega por su
-- propia policy y no de rebote porque además veía el caso.
set session_replication_role = replica;
insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                          req_tipo, req_cantidad, req_urgencia, pais, gestor_id)
values ('f3000000-0000-4000-8000-00000000000a','Caso pendiente con gestora','desc', null, true,
        'pendiente','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE',
        'aaaa9999-9999-4999-8999-999999999999')
on conflict (id) do nothing;
set session_replication_role = origin;

-- ═══ T1 — La gestora pide un dato a Logística ═══
do $$
declare v_id uuid; v_vence timestamptz;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');   -- Gina Gestora
  v_id := public.pedir_info_caso('f2000000-0000-4000-8000-00000000000a',
            'Foto del acta de entrega firmada', 'Sin eso no se puede cerrar',
            'Poder confirmar la entrega', 'logistica', null, null);
  perform set_config('role','postgres',true);
  select vence_en into v_vence from public.casos_solicitudes_info where id = v_id;
  perform pg_temp.ok('T1 la gestora pide información', v_id is not null);
  -- Urgencia 'alta' del caso → 48 h (plazo_seguimiento de 0239). Nunca sin reloj.
  perform pg_temp.ok('T1 y la fecha límite se pone sola',
    v_vence > now() + interval '47 hours' and v_vence < now() + interval '49 hours');
end $$;

-- ═══ T2 — LO QUE IMPORTA: Logística contesta una petición de un caso QUE NO PUEDE LEER ═══
-- Este es todo el punto de la Fase 2. Si la petición dependiera del acceso al caso, el
-- gestor solo podría pedirle datos a quien ya lo ve, que son justo los que no los tienen.
do $$
declare v_id uuid; v_n int; v_casos int; v_estado text;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');   -- Gina, gestora del caso
  v_id := public.pedir_info_caso('f3000000-0000-4000-8000-00000000000a',
            'Confirmar si hay transporte el jueves', null, null, 'logistica', null, null);

  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Luis Logística
  select count(*) into v_casos from public.casos where id = 'f3000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T2 Logística NO puede leer ese caso', v_casos = 0);

  select count(*) into v_n from public.casos_solicitudes_info where id = v_id;
  perform pg_temp.ok('T2 y aun así ve la petición de su área', v_n = 1);

  perform public.responder_info_caso(v_id, 'Sí, sale a las 7');
  perform set_config('role','postgres',true);
  select estado into v_estado from public.casos_solicitudes_info where id = v_id;
  perform pg_temp.ok('T2 y la contesta', v_estado = 'respondida');
end $$;

-- ═══ T2b — La del caso confirmado también se responde ═══
do $$
declare v_estado text;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  perform public.responder_info_caso(
    (select id from public.casos_solicitudes_info
      where caso_id = 'f2000000-0000-4000-8000-00000000000a' order by creado_en limit 1),
    'Subida al caso, carpeta de adjuntos');
  perform set_config('role','postgres',true);
  select estado into v_estado from public.casos_solicitudes_info
   where caso_id = 'f2000000-0000-4000-8000-00000000000a' order by creado_en limit 1;
  perform pg_temp.ok('T2b y la del caso confirmado también', v_estado = 'respondida');
end $$;

-- ═══ T3 — Responder NO cierra ═══
-- Son pasos distintos a propósito: si responder cerrara, «me contestaron algo que no
-- sirve» no tendría dónde quedar registrado.
do $$
declare v_estado text; v_err text := '';
begin
  perform set_config('role','postgres',true);
  select estado into v_estado from public.casos_solicitudes_info
   where caso_id = 'f2000000-0000-4000-8000-00000000000a' order by creado_en limit 1;
  perform pg_temp.ok('T3 responder no cierra la petición', v_estado = 'respondida');

  -- Y Logística NO la cierra: eso es de quien la pidió.
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  begin
    perform public.cerrar_info_caso(
      (select id from public.casos_solicitudes_info
        where caso_id = 'f2000000-0000-4000-8000-00000000000a' order by creado_en limit 1),
      'la cierro yo');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T3 y quien responde no la cierra', v_err <> '');
end $$;

-- ═══ T4 — La cierra quien la pidió ═══
do $$
declare v_estado text;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  perform public.cerrar_info_caso(
    (select id from public.casos_solicitudes_info
      where caso_id = 'f2000000-0000-4000-8000-00000000000a' order by creado_en limit 1),
    'Sirve');
  perform set_config('role','postgres',true);
  select estado into v_estado from public.casos_solicitudes_info
   where caso_id = 'f2000000-0000-4000-8000-00000000000a' order by creado_en limit 1;
  perform pg_temp.ok('T4 la cierra quien la pidió', v_estado = 'cerrada');
end $$;

-- ═══ T5 — Quien no tiene nada que ver, no la ve ═══
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa7777-7777-4777-8777-777777777777');   -- Pedro, voluntario
  select count(*) into v_n from public.casos_solicitudes_info;
  perform pg_temp.ok('T5 un voluntario no ve peticiones ajenas', v_n = 0);
end $$;

-- ═══ T6 — Sin destinatario no hay petición ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  begin
    perform public.pedir_info_caso('f2000000-0000-4000-8000-00000000000a', 'Algo', null, null, null, null, null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T6 una petición sin destinatario se rechaza', v_err <> '');
end $$;

-- ═══ T7 — Solo el gestor del caso (o su mando) pide ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Logística
  begin
    perform public.pedir_info_caso('f2000000-0000-4000-8000-00000000000a', 'Yo también pido',
              null, null, 'redes', null, null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T7 quien no gestiona el caso no pide en su nombre', v_err <> '');
end $$;

-- ═══ T8 — Desaparecidos, fuera también de esto ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');   -- Lidia Líder
  begin
    perform public.pedir_info_caso('f2000000-0000-4000-8000-00000000000c', 'Un dato',
              null, null, 'logistica', null, null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T8 no se pide información en un caso de Desaparecidos', v_err <> '');
end $$;

-- ═══ T9 — «BLOQUEADO» por fin se calcula ═══
-- Era el cuarto reporte que 0239 dejó fuera a propósito. Una petición abierta y vencida.
do $$
declare v_sit text; v_id uuid;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  v_id := public.pedir_info_caso('f2000000-0000-4000-8000-00000000000a',
            'El teléfono del referente', null, null, 'recopilacion', null, now() + interval '1 hour');
  -- Se envejece la fecha límite: lo que se prueba es el cálculo, no el paso del tiempo.
  perform set_config('role','postgres',true);
  update public.casos_solicitudes_info set vence_en = now() - interval '1 hour' where id = v_id;

  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  select situacion into v_sit from public.casos_gestion_control(null)
   where id = 'f2000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T9 el caso con una petición vencida sale como BLOQUEADO', v_sit = 'bloqueado');

  -- Y al contestarla deja de estarlo.
  perform set_config('role','postgres',true);
  update public.casos_solicitudes_info set estado = 'respondida' where id = v_id;
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  select situacion into v_sit from public.casos_gestion_control(null)
   where id = 'f2000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T9 y al contestarla deja de estar bloqueado', v_sit is distinct from 'bloqueado');
end $$;

-- ═══ T10 — «Me piden» le llega a quien le toca, y a nadie más ═══
do $$
declare v_n int; v_id uuid;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  v_id := public.pedir_info_caso('f2000000-0000-4000-8000-00000000000a',
            'Confirmar el punto de acopio', null, null, 'logistica', null, null);

  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Logística
  select count(*) into v_n from public.mis_solicitudes_info() where id = v_id;
  perform pg_temp.ok('T10 le aparece a Logística', v_n = 1);

  perform pg_temp.como('aaaa7777-7777-4777-8777-777777777777');   -- Pedro, voluntario
  select count(*) into v_n from public.mis_solicitudes_info();
  perform pg_temp.ok('T10 y a quien no opera el área, no', v_n = 0);
end $$;

-- ═══ T11 — Sin policies de escritura: no se maquilla el registro ═══
do $$
declare v_err text := ''; v_borradas int;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  begin
    insert into public.casos_solicitudes_info (caso_id, dato, area, vence_en, solicitante_sello)
    values ('f2000000-0000-4000-8000-00000000000a', 'A mano', 'logistica', now(), 'X');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T11 no se inserta a mano', v_err <> '');

  delete from public.casos_solicitudes_info;
  get diagnostics v_borradas = row_count;
  perform pg_temp.ok('T11 y no se borran peticiones', v_borradas = 0);
end $$;

-- ═══ T12 — ACL: ni PUBLIC ni anon ═══
do $$
declare r record; v_mal text := '';
begin
  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('pedir_info_caso','responder_info_caso','cerrar_info_caso','mis_solicitudes_info')
  loop
    if has_function_privilege('public', r.f, 'execute') then v_mal := v_mal || ' PUBLIC:' || r.f; end if;
    if has_function_privilege('anon',   r.f, 'execute') then v_mal := v_mal || ' anon:'   || r.f; end if;
  end loop;
  perform pg_temp.ok('T12 ni PUBLIC ni anon ejecutan las peticiones' || v_mal, v_mal = '');
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_inf;
  if v_n > 0 then
    raise exception 'PRUEBAS DE SOLICITUDES DE INFORMACIÓN (0240) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DE SOLICITUDES DE INFORMACIÓN (0240) PASARON ==';
end $$;
