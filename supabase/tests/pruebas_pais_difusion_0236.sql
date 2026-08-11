-- Pruebas de 0236 — el país en la vista curada de Redacción.
--
-- Lo que de verdad se está comprobando NO es que la columna esté (eso es una línea): es
-- que reescribir `casos_difusion` por SEXTA vez no aflojó el filtro. Esta vista es la
-- única puerta de Redacción a los casos desde 0180, y cada drop/create es una ocasión de
-- perder una rama del WHERE sin que nadie se entere hasta que se filtre algo.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql. Usa casos PROPIOS (prefijo f0000000-…) y no
-- toca los de la semilla: las suites de hilos e intake corren sobre esos y una prueba que
-- depende del estado que deja otra es una trampa esperando a que cambie el orden en CI.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_pais (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_pais (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── Semilla propia: tres casos que se distinguen SOLO por lo que debe filtrar la vista ──
set session_replication_role = replica;

insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                          req_tipo, req_cantidad, req_urgencia, pais) values
  -- (a) Derivado a «redes» y colombiano: es el que Redacción SÍ debe ver, con su país.
  ('f0000000-0000-4000-8000-00000000000a','Caso colombiano derivado a redes','desc', null, true,
   'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','CO'),
  -- (b) Venezolano y NO derivado a nadie: no le toca a Redacción, y 0236 no puede cambiarlo.
  ('f0000000-0000-4000-8000-00000000000b','Caso venezolano sin derivar','desc', null, true,
   'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE'),
  -- (c) Derivado a «redes» PERO de Desaparecidos: fuera desde 0180, y sigue fuera.
  --     Idéntico al (a) salvo la categoría, que es justo lo que se está probando.
  ('f0000000-0000-4000-8000-00000000000c','Persona desaparecida','desc','Desaparecidos', true,
   'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','CO')
on conflict (id) do nothing;

insert into public.casos_derivaciones (caso_id, area, derivado_por)
values ('f0000000-0000-4000-8000-00000000000a','redes','aaaa0000-0000-4000-8000-00000000000a'),
       ('f0000000-0000-4000-8000-00000000000c','redes','aaaa0000-0000-4000-8000-00000000000a')
on conflict do nothing;

set session_replication_role = origin;

-- ═══ T1 — La columna existe y es la de 0230 ═══
do $$
declare v_n int;
begin
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'casos_difusion' and column_name = 'pais';
  perform pg_temp.ok('T1 casos_difusion expone `pais`', v_n = 1);
end $$;

-- ═══ T2 — Redacción ve el caso derivado, y con su país de verdad ═══
do $$
declare v_pais text;
begin
  perform pg_temp.como('aaaa2222-2222-4222-8222-222222222222');   -- Rita Redacción
  select pais into v_pais from public.casos_difusion where id = 'f0000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T2 Redacción lee el país del caso derivado', v_pais = 'CO');
end $$;

-- ═══ T3 — LO QUE IMPORTA: el ruteo explícito de 0208 sigue en pie ═══
-- Un caso confirmado que NO se derivó a redes no es de Redacción. Si 0236 hubiera perdido
-- esa rama del WHERE, este caso aparecería y nadie lo habría notado.
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa2222-2222-4222-8222-222222222222');
  select count(*) into v_n from public.casos_difusion where id = 'f0000000-0000-4000-8000-00000000000b';
  perform pg_temp.ok('T3 el caso sin derivar sigue fuera de la vista', v_n = 0);
end $$;

-- ═══ T4 — Desaparecidos sigue excluido aunque esté derivado a redes ═══
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa2222-2222-4222-8222-222222222222');
  select count(*) into v_n from public.casos_difusion where id = 'f0000000-0000-4000-8000-00000000000c';
  perform pg_temp.ok('T4 Desaparecidos sigue excluido de la difusión', v_n = 0);
end $$;

-- ═══ T5 — El gate por ROL no se aflojó ═══
-- La vista corre con security_invoker = false: se salta la RLS y se acota ella sola. Si el
-- gate se cayera, cualquier voluntario leería el contacto interno que 0209 metió aquí.
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');   -- Ana Ajena, voluntaria
  select count(*) into v_n from public.casos_difusion;
  perform pg_temp.ok('T5 un voluntario sin rol no ve NADA en casos_difusion', v_n = 0);

  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Luis Logística
  select count(*) into v_n from public.casos_difusion;
  perform pg_temp.ok('T5 Logística tampoco: la vista es de Redacción/Redes', v_n = 0);
end $$;

-- ═══ T6 — El grant sobrevivió al drop/create ═══
-- Un `drop view` se lleva los privilegios por delante. Sin el grant de vuelta, Redacción
-- se queda con la página en blanco y un 42501 que no dice nada.
do $$
begin
  perform pg_temp.ok('T6 authenticated conserva el SELECT',
    has_table_privilege('authenticated', 'public.casos_difusion', 'select'));
  perform pg_temp.ok('T6 y anon sigue sin él',
    not has_table_privilege('anon', 'public.casos_difusion', 'select'));
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_pais;
  if v_n > 0 then
    raise exception 'PRUEBAS DEL PAÍS EN DIFUSIÓN (0236) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DEL PAÍS EN DIFUSIÓN (0236) PASARON ==';
end $$;
