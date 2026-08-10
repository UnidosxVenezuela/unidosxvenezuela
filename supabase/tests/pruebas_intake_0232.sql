-- Pruebas de 0232 — el intake sensible fuera de `perfiles`.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql (reutiliza sus usuarios). Misma condición que
-- verificar_rls.sql y que cumple CI, que levanta una base limpia por ejecución.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_intake (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_intake (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ═══ T1 — Las columnas ya NO existen en `perfiles` ═══
-- Es el corazón del arreglo: mientras existieran, cualquier ruta de escritura vieja las
-- repoblaría y `perfiles_lectura` (0018) volvería a entregarlas a toda cuenta verificada.
do $$ begin
  perform pg_temp.ok('T1 perfiles.contacto_emergencia retirada',
    not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='perfiles'
                   and column_name='contacto_emergencia'));
  perform pg_temp.ok('T1 perfiles.experiencia retirada',
    not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='perfiles'
                   and column_name='experiencia'));
end $$;

-- ═══ T2 — Cada quien guarda lo suyo y lo lee ═══
do $$
declare v_ce text;
begin
  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');
  perform public.guardar_intake_perfil('Verificación de información',
                                       'Ana Pérez (hermana) · 0414-1234567', null);
  select contacto_emergencia into v_ce from public.perfiles_intake
   where perfil_id = 'aaaa1111-1111-4111-8111-111111111111';
  perform pg_temp.ok('T2 guarda y lee lo suyo', v_ce = 'Ana Pérez (hermana) · 0414-1234567');
end $$;

-- ═══ T3 — LA FUGA CERRADA: otra cuenta verificada no lo ve ═══
-- Antes de 0232 esto devolvía la fila entera, porque la RLS filtra filas y no columnas.
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  select count(*) into v_n from public.perfiles_intake;
  perform pg_temp.ok('T3 una cuenta verificada NO ve el intake de nadie', v_n = 0);

  -- Y sigue viendo el perfil, que es lo que sí debe ver: no se rompió el directorio.
  select count(*) into v_n from public.perfiles
   where id = 'aaaa1111-1111-4111-8111-111111111111';
  perform pg_temp.ok('T3 pero sí sigue viendo el perfil', v_n = 1);
end $$;

-- ═══ T4 — Administración sí lo ve (deber de cuidado) ═══
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  select count(*) into v_n from public.perfiles_intake
   where perfil_id = 'aaaa1111-1111-4111-8111-111111111111';
  perform pg_temp.ok('T4 administración lee el intake', v_n = 1);
end $$;

-- ═══ T5 — Nadie escribe el de otro salvo administración ═══
do $$
declare v_err text := ''; v_ce text;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  begin
    perform public.guardar_intake_perfil('me lo invento', 'robo de contacto',
                                         'aaaa1111-1111-4111-8111-111111111111');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T5 un voluntario no escribe el de otro', v_err <> '');

  -- Administración sí: lo necesita el importador de CSV.
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  perform public.guardar_intake_perfil('Logística de campo', 'Luis Pérez (padre) · 0412-7654321',
                                       'aaaa3333-3333-4333-8333-333333333333');
  perform set_config('role','postgres',true);
  select contacto_emergencia into v_ce from public.perfiles_intake
   where perfil_id = 'aaaa3333-3333-4333-8333-333333333333';
  perform pg_temp.ok('T5 administración sí, para el alta en lote',
                     v_ce = 'Luis Pérez (padre) · 0412-7654321');
end $$;

-- ═══ T6 — Escritura directa denegada: la RLS no publica INSERT/UPDATE ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');
  begin
    insert into public.perfiles_intake (perfil_id, contacto_emergencia)
    values ('aaaa5555-5555-4555-8555-555555555555', 'por la puerta de atrás');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T6 INSERT directo denegado', v_err <> '');
end $$;

-- ═══ T7 — La auditoría registra QUE cambió, nunca QUÉ dice ═══
-- Mudar el teléfono del familiar a `registro_auditoria` sería cambiar la fuga de sitio.
do $$
declare v_meta jsonb;
begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('role','postgres',true);
  select metadata into v_meta from public.registro_auditoria
   where accion = 'intake_perfil_guardado' order by id desc limit 1;
  perform pg_temp.ok('T7 hay asiento de auditoría', v_meta is not null);
  perform pg_temp.ok('T7 y NO contiene el teléfono',
    coalesce(v_meta::text, '') not like '%0412%' and coalesce(v_meta::text, '') not like '%0414%');
  perform pg_temp.ok('T7 solo dice si venía relleno', (v_meta ->> 'contacto_emergencia') in ('true','false'));
end $$;

-- ═══ T8 — ACL: ni PUBLIC ni anon ejecutan la RPC ═══
do $$
declare r record; v_mal text := '';
begin
  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'guardar_intake_perfil'
  loop
    if has_function_privilege('public', r.f, 'execute') then v_mal := v_mal || ' PUBLIC:' || r.f; end if;
    if has_function_privilege('anon',   r.f, 'execute') then v_mal := v_mal || ' anon:'   || r.f; end if;
  end loop;
  perform pg_temp.ok('T8 ni PUBLIC ni anon ejecutan la RPC' || v_mal, v_mal = '');
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_intake;
  if v_n > 0 then
    raise exception 'PRUEBAS DE INTAKE (0232) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DE INTAKE (0232) PASARON ==';
end $$;

-- ═══════════════════════════════════════════════════════════
-- Extra: contador de sin leer (0233)
-- ═══════════════════════════════════════════════════════════
create temporary table if not exists pg_fallos_sinleer (nombre text);
create or replace function pg_temp.ok2(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_sinleer (nombre) values (nom); end if;
end $$;

-- T9 — Un miembro del grupo que NUNCA abrió el hilo sí ve pendientes.
-- Es la rama (b): sin ella el contador diría cero para siempre y la insignia no serviría
-- para lo único que tiene que servir.
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  perform public.escribir_en_hilo('grupo','bbbb0000-0000-4000-8000-000000000001',
                                  'Equipo, mañana salimos a las 6.', null);

  perform pg_temp.como('aaaa5555-5555-4555-8555-555555555555');   -- Olga, miembro nueva
  select public.mis_hilos_sin_leer() into v_n;
  perform pg_temp.ok2('T9 el miembro que nunca abrió el hilo ve pendientes', v_n >= 1);
end $$;

-- T10 — Al marcarlo leído, baja a cero.
do $$
declare v_n int; v_hilo uuid;
begin
  perform set_config('role','postgres',true);
  select id into v_hilo from public.hilos where ambito='grupo' limit 1;

  perform pg_temp.como('aaaa5555-5555-4555-8555-555555555555');
  perform public.marcar_hilo_leido(v_hilo);
  select public.mis_hilos_sin_leer() into v_n;
  perform pg_temp.ok2('T10 al marcar leído baja a cero', v_n = 0);
end $$;

-- T11 — Lo propio nunca cuenta como pendiente.
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa0000-0000-4000-8000-00000000000a');
  perform public.marcar_hilo_leido((select id from public.hilos where ambito='grupo' limit 1));
  perform public.escribir_en_hilo('grupo','bbbb0000-0000-4000-8000-000000000001','Y llevo yo la camioneta.', null);
  select public.mis_hilos_sin_leer() into v_n;
  perform pg_temp.ok2('T11 mi propio mensaje no me cuenta como pendiente', v_n = 0);
end $$;

-- T12 — Quien no participa de nada tiene cero, no el conteo de otro.
do $$
declare v_n int;
begin
  perform pg_temp.como('aaaa6666-6666-4666-8666-666666666666');
  select public.mis_hilos_sin_leer() into v_n;
  perform pg_temp.ok2('T12 quien no participa de nada tiene cero', v_n = 0);
end $$;

-- T13 — ACL de la función.
do $$
declare v_mal text := '';
begin
  if has_function_privilege('public','public.mis_hilos_sin_leer()','execute') then v_mal := v_mal || ' PUBLIC'; end if;
  if has_function_privilege('anon','public.mis_hilos_sin_leer()','execute')   then v_mal := v_mal || ' anon';   end if;
  perform pg_temp.ok2('T13 ni PUBLIC ni anon ejecutan el contador' || v_mal, v_mal = '');
end $$;

do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_sinleer;
  if v_n > 0 then
    raise exception 'PRUEBAS DEL CONTADOR (0233) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DEL CONTADOR (0233) PASARON ==';
end $$;
