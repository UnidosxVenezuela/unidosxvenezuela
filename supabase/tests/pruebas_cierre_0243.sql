-- Pruebas de 0243 — cierre con criterios y reapertura (Gestor de Casos, Fase 3).
--
-- Lo que importa dejar clavado:
--   · que los criterios se CALCULAN y reflejan la realidad (si aparece una petición sin
--     cerrar, el criterio se cae solo);
--   · que «avisa, no bloquea» tiene DIENTES: sin nota no se cierra incompleto;
--   · que queda la FOTO de los criterios, no solo el hecho de haber cerrado;
--   · que reabrir existe, exige motivo y devuelve el caso a la cola con reloj nuevo.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql y de pruebas_gestor_0239.sql.
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_cie (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_cie (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── Semilla propia: un caso confirmado con Gina de gestora ──
set session_replication_role = replica;
insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                          req_tipo, req_cantidad, req_urgencia, pais, gestor_id)
values ('f5000000-0000-4000-8000-00000000000a','Caso para cerrar','desc', null, true,
        'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE',
        'aaaa9999-9999-4999-8999-999999999999')
on conflict (id) do nothing;
set session_replication_role = origin;

-- ═══ T1 — Los criterios se calculan, y dicen la verdad ═══
do $$
declare v_n int; v_evid boolean;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');   -- Gina Gestora
  select count(*) into v_n from public.criterios_cierre_caso('f5000000-0000-4000-8000-00000000000a');
  perform pg_temp.ok('T1 devuelve los cinco criterios', v_n = 5);

  select cumplido into v_evid from public.criterios_cierre_caso('f5000000-0000-4000-8000-00000000000a')
   where criterio = 'evidencia';
  perform pg_temp.ok('T1 sin adjuntos, «evidencia» NO se cumple', v_evid = false);
end $$;

-- ═══ T2 — LO QUE IMPORTA: sin nota no se cierra incompleto ═══
do $$
declare v_err text := ''; v_estado text;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  begin
    perform public.cerrar_caso_gestion('f5000000-0000-4000-8000-00000000000a', null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T2 sin nota no se cierra con criterios sin cumplir', v_err <> '');
  perform pg_temp.ok('T2 y el error enumera qué falta', v_err ilike '%adjunto%');

  perform set_config('role','postgres',true);
  select estado::text into v_estado from public.casos where id = 'f5000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T2 el caso sigue abierto', v_estado = 'confirmado');
end $$;

-- ═══ T3 — Con nota SÍ se cierra, y queda la foto de los criterios ═══
do $$
declare v_estado text; v_completo boolean; v_crit jsonb; v_nota text;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  perform public.cerrar_caso_gestion('f5000000-0000-4000-8000-00000000000a',
            'La familia se mudó y no se pudo tomar la foto.');
  perform set_config('role','postgres',true);
  select estado::text into v_estado from public.casos where id = 'f5000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T3 el caso queda resuelto', v_estado = 'resuelto');

  select completo, criterios, nota into v_completo, v_crit, v_nota
    from public.casos_cierres
   where caso_id = 'f5000000-0000-4000-8000-00000000000a' and accion = 'cierre'
   order by creado_en desc limit 1;
  perform pg_temp.ok('T3 y marcado como cierre INCOMPLETO', v_completo = false);
  perform pg_temp.ok('T3 con la nota guardada', v_nota like 'La familia%');
  -- La foto: los cinco criterios con su estado, no solo «se cerró».
  perform pg_temp.ok('T3 y con la FOTO de los cinco criterios', jsonb_array_length(v_crit) = 5);
end $$;

-- ═══ T4 — Reabrir: existe, exige motivo, y devuelve el reloj ═══
do $$
declare v_err text := ''; v_estado text; v_prox timestamptz; v_accion text;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  begin
    perform public.reabrir_caso('f5000000-0000-4000-8000-00000000000a', '   ');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T4 sin motivo no se reabre', v_err <> '');

  perform public.reabrir_caso('f5000000-0000-4000-8000-00000000000a',
            'La familia dice que solo llegó la mitad');
  perform set_config('role','postgres',true);
  select estado::text, proxima_revision, proxima_accion into v_estado, v_prox, v_accion
    from public.casos where id = 'f5000000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T4 vuelve a «confirmado», no a «pendiente»', v_estado = 'confirmado');
  -- Urgencia 'alta' → 48 h. Un caso reabierto sin fecha vuelve a ser un caso a la deriva.
  perform pg_temp.ok('T4 y con fecha de seguimiento nueva',
    v_prox is not null and v_prox > now() + interval '47 hours');
  perform pg_temp.ok('T4 y con la próxima acción escrita', v_accion like 'Reabierto:%');
end $$;

-- ═══ T5 — Solo se reabre lo resuelto ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  begin
    perform public.reabrir_caso('f5000000-0000-4000-8000-00000000000a', 'otra vez');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T5 un caso ya abierto no se reabre', v_err <> '');
end $$;

-- ═══ T6 — El criterio se cae solo cuando aparece una petición sin cerrar ═══
-- Es la prueba de que los criterios se CALCULAN y no son casillas guardadas.
do $$
declare v_ok boolean;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  select cumplido into v_ok from public.criterios_cierre_caso('f5000000-0000-4000-8000-00000000000a')
   where criterio = 'sin_peticiones';
  perform pg_temp.ok('T6 sin peticiones, el criterio se cumple', v_ok = true);

  perform public.pedir_info_caso('f5000000-0000-4000-8000-00000000000a',
            'Foto del acta', null, null, 'logistica', null, null);
  select cumplido into v_ok from public.criterios_cierre_caso('f5000000-0000-4000-8000-00000000000a')
   where criterio = 'sin_peticiones';
  perform pg_temp.ok('T6 y al abrir una, se cae solo', v_ok = false);
end $$;

-- ═══ T7 — Quien no gestiona el caso no lo cierra ni lo reabre ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Luis Logística
  begin
    perform public.cerrar_caso_gestion('f5000000-0000-4000-8000-00000000000a', 'lo cierro yo');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T7 Logística no cierra un caso ajeno', v_err <> '');
end $$;

-- ═══ T8 — Desaparecidos, fuera también de esto ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');   -- Lidia Líder
  begin
    perform public.cerrar_caso_gestion('f2000000-0000-4000-8000-00000000000c', 'nota');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T8 no se cierra desde aquí un caso de Desaparecidos', v_err <> '');
end $$;

-- ═══ T9 — El registro no se maquilla ═══
do $$
declare v_err text := ''; v_borradas int;
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  begin
    insert into public.casos_cierres (caso_id, accion, actor_sello)
    values ('f5000000-0000-4000-8000-00000000000a', 'cierre', 'A mano');
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T9 no se inserta un cierre a mano', v_err <> '');

  delete from public.casos_cierres;
  get diagnostics v_borradas = row_count;
  perform pg_temp.ok('T9 y no se borra el historial', v_borradas = 0);
end $$;

-- ═══ T10 — ACL ═══
do $$
declare r record; v_mal text := '';
begin
  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('cerrar_caso_gestion','reabrir_caso','criterios_cierre_caso')
  loop
    if has_function_privilege('public', r.f, 'execute') then v_mal := v_mal || ' PUBLIC:' || r.f; end if;
    if has_function_privilege('anon',   r.f, 'execute') then v_mal := v_mal || ' anon:'   || r.f; end if;
  end loop;
  perform pg_temp.ok('T10 ni PUBLIC ni anon ejecutan el cierre' || v_mal, v_mal = '');
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_cie;
  if v_n > 0 then
    raise exception 'PRUEBAS DE CIERRE Y REAPERTURA (0243) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DE CIERRE Y REAPERTURA (0243) PASARON ==';
end $$;
