-- Pruebas de 0237 — contexto curado de las solicitudes (número de caso + país).
--
-- Lo que se está comprobando de verdad: que la vista resuelve el problema de Alianzas
-- SIN convertirse en una puerta trasera a `casos`. Se creó justo para no meter a Alianzas
-- en `casos_select`, así que la prueba que importa es la simétrica: Alianzas ve el país y
-- sigue SIN ver la fila del caso.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql. Siembra sus PROPIOS casos (prefijo f1000000-…) y
-- su propia persona de Alianzas: no reutiliza nada de la suite de 0236, para que ninguna
-- de las dos se rompa si mañana cambia el orden en CI.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_ctx (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_ctx (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── Semilla propia ──
set session_replication_role = replica;

-- Una persona de Alianzas Estratégicas. Es la protagonista: la vista existe por ella.
insert into auth.users (id, email) values
  ('aaaa8888-8888-4888-8888-888888888888','alianzas.ctx@t.local')
on conflict (id) do nothing;
-- Rol 'captacion': es la clave histórica del enum, unificada en 0216 y etiquetada
-- «Alianzas Estratégicas» en la interfaz. Es lo que mira `puede_alianzas()`.
insert into public.perfiles (id, nombre_completo, rol, roles_extra, verificado) values
  ('aaaa8888-8888-4888-8888-888888888888','Alba Alianzas','captacion','{}', true)
on conflict (id) do update
  set rol = excluded.rol, roles_extra = excluded.roles_extra, verificado = excluded.verificado;
insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
values ('aaaa8888-8888-4888-8888-888888888888','aprobada','s','d', true)
on conflict (perfil_id) do update set estado = 'aprobada';

-- Tres casos propios: uno colombiano, uno venezolano y uno de Desaparecidos.
insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                          req_tipo, req_cantidad, req_urgencia, pais) values
  ('f1000000-0000-4000-8000-00000000000a','Caso colombiano con entrega','desc', null, true,
   'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','CO'),
  ('f1000000-0000-4000-8000-00000000000d','Caso venezolano con entrega','desc', null, true,
   'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE'),
  ('f1000000-0000-4000-8000-00000000000c','Persona desaparecida','desc','Desaparecidos', true,
   'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','CO')
on conflict (id) do nothing;

-- Tres solicitudes: una del caso colombiano, una del venezolano y una SUELTA.
insert into public.solicitudes_insumo (id, titulo, descripcion, tipo, cantidad, urgencia, estado,
                                       solicitado_por, caso_id) values
  ('dddd0000-0000-4000-8000-00000000000a','Entrega en Colombia','x','otro','5','alta','solicitado',
   'aaaa0000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-00000000000a'),
  ('dddd0000-0000-4000-8000-00000000000b','Entrega en Venezuela','x','otro','5','alta','solicitado',
   'aaaa0000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-00000000000d'),
  -- Sin caso: las anteriores a 0223. Deben salir como 'VE' (ver cabecera de 0237).
  ('dddd0000-0000-4000-8000-00000000000c','Entrega suelta y vieja','x','otro','5','alta','solicitado',
   'aaaa0000-0000-4000-8000-00000000000a', null)
on conflict (id) do nothing;

-- Y una atada a un caso de Desaparecidos, que no debería existir jamás — pero se siembra
-- para comprobar que si algún día existe, la vista no lo proyecta.
insert into public.solicitudes_insumo (id, titulo, descripcion, tipo, cantidad, urgencia, estado,
                                       solicitado_por, caso_id) values
  ('dddd0000-0000-4000-8000-00000000000e','Entrega imposible','x','otro','5','alta','solicitado',
   'aaaa0000-0000-4000-8000-00000000000a','f1000000-0000-4000-8000-00000000000c')
on conflict (id) do nothing;

set session_replication_role = origin;

-- ═══ T1 — LO QUE IMPORTA: Alianzas ve el país ═══
-- Es la razón de ser de la migración. Antes el join a `casos` le volvía vacío.
do $$
declare v_pais text; v_num bigint;
begin
  perform pg_temp.como('aaaa8888-8888-4888-8888-888888888888');
  select pais, caso_numero into v_pais, v_num
    from public.solicitudes_contexto where solicitud_id = 'dddd0000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T1 Alianzas ve el país de la solicitud', v_pais = 'CO');
  perform pg_temp.ok('T1 y el número del caso', v_num is not null);
end $$;

-- ═══ T2 — Y LA OTRA MITAD: sigue SIN poder leer el caso ═══
-- Si esto fallara, la vista habría sido un rodeo para ampliar `casos_select` y toda la
-- justificación de 0237 se cae: Alianzas tendría contacto, referente y coordenadas.
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa8888-8888-4888-8888-888888888888');
  select count(*) into v_n from public.casos;
  perform pg_temp.ok('T2 Alianzas sigue sin leer NINGÚN caso', v_n = 0);
end $$;

-- ═══ T3 — Logística también, y con las dos banderas bien puestas ═══
do $$
declare v_co text; v_ve text;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Luis Logística
  select pais into v_co from public.solicitudes_contexto where solicitud_id = 'dddd0000-0000-4000-8000-00000000000a';
  select pais into v_ve from public.solicitudes_contexto where solicitud_id = 'dddd0000-0000-4000-8000-00000000000b';
  perform pg_temp.ok('T3 Logística ve Colombia donde toca', v_co = 'CO');
  perform pg_temp.ok('T3 y Venezuela donde toca', v_ve = 'VE');
end $$;

-- ═══ T4 — Una solicitud sin caso sale como venezolana ═══
-- No es una suposición: son anteriores a 0223, de cuando solo se atendía Venezuela.
do $$
declare v_pais text; v_num bigint;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  select pais, caso_numero into v_pais, v_num
    from public.solicitudes_contexto where solicitud_id = 'dddd0000-0000-4000-8000-00000000000c';
  perform pg_temp.ok('T4 la solicitud sin caso sale como VE', v_pais = 'VE');
  perform pg_temp.ok('T4 y sin número de caso', v_num is null);
end $$;

-- ═══ T5 — Desaparecidos no se proyecta, ni siquiera su número ═══
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');
  select count(*) into v_n from public.solicitudes_contexto
   where solicitud_id = 'dddd0000-0000-4000-8000-00000000000e';
  perform pg_temp.ok('T5 una solicitud atada a Desaparecidos no aparece', v_n = 0);
end $$;

-- ═══ T6 — El alcance es EXACTAMENTE el de `solins_lectura`, menos Desaparecidos ═══
-- Ni una fila más ni una menos: quien ve una solicitud ve su contexto. Si la vista
-- devolviera de más, estaría contando solicitudes a quien no las ve; si devolviera de
-- menos, habría tarjetas sin bandera sin motivo.
do $$
declare v_sol int; v_ctx int;
begin
  -- Ana y no Marta: las pruebas de hilos dan de baja a Marta en su T10 y esta suite corre
  -- después. Depender del estado que deja otra es una trampa esperando al cambio de orden.
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');   -- Ana Ajena, voluntaria verificada
  select count(*) into v_sol from public.solicitudes_insumo
   where id <> 'dddd0000-0000-4000-8000-00000000000e';            -- la de Desaparecidos, fuera a propósito
  select count(*) into v_ctx from public.solicitudes_contexto;
  perform pg_temp.ok('T6 el contexto cubre todas las solicitudes legibles',
                     v_sol > 0 and v_ctx = v_sol);
end $$;

-- ═══ T7 — Sin verificar, nada ═══
do $$
declare v_n int;
begin
  perform set_config('role','postgres',true);
  update public.perfiles set verificado = false where id = 'aaaa8888-8888-4888-8888-888888888888';
  perform pg_temp.como('aaaa8888-8888-4888-8888-888888888888');
  select count(*) into v_n from public.solicitudes_contexto;
  perform pg_temp.ok('T7 una cuenta sin verificar no ve contexto', v_n = 0);
  perform set_config('role','postgres',true);
  update public.perfiles set verificado = true where id = 'aaaa8888-8888-4888-8888-888888888888';
end $$;

-- ═══ T8 — ACL: anon no lee la vista ═══
do $$
begin
  perform pg_temp.ok('T8 authenticated tiene el SELECT',
    has_table_privilege('authenticated', 'public.solicitudes_contexto', 'select'));
  perform pg_temp.ok('T8 y anon no',
    not has_table_privilege('anon', 'public.solicitudes_contexto', 'select'));
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_ctx;
  if v_n > 0 then
    raise exception 'PRUEBAS DEL CONTEXTO DE SOLICITUDES (0237) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DEL CONTEXTO DE SOLICITUDES (0237) PASARON ==';
end $$;
