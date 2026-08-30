-- Pruebas de 0241/0242 — el reparto del flujo y la ficha de Alianzas.
--
-- Lo que de verdad hay que dejar clavado, porque es lo que alguien romperá sin querer:
--   · que la frontera FRENA de verdad, en las dos direcciones;
--   · que frena con un ERROR y no devolviendo cero filas (por eso la policy está abierta y
--     el trigger es quien decide: si se hiciera al revés, la app diría «Estado actualizado»);
--   · que Logística NO perdió lo suyo, que es la mitad del riesgo de este cambio;
--   · que la ficha de Alianzas cambió de firmante, y que su semáforo se cae al editar.
--
-- Se ejecutan UNA VEZ sobre una base recién migrada, después de
-- supabase/tests/semilla_hilos_0231.sql y de pruebas_gestor_0239.sql (que siembra a Gina
-- Gestora y a Lidia Líder del grupo de Verificación).
\set ON_ERROR_STOP off
\pset pager off

create temporary table if not exists pg_fallos_eje (nombre text);

create or replace function pg_temp.ok(nom text, cond boolean) returns void language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASA' else '*** FALLA ***' end, nom;
  if not cond then insert into pg_fallos_eje (nombre) values (nom); end if;
end $$;

create or replace function pg_temp.como(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── Semilla propia ──
set session_replication_role = replica;

insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                          req_tipo, req_cantidad, req_urgencia, pais)
values ('f4000000-0000-4000-8000-00000000000a','Caso del reparto','desc', null, true,
        'confirmado','aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta','VE')
on conflict (id) do nothing;

insert into public.solicitudes_insumo (id, titulo, descripcion, tipo, cantidad, urgencia, estado,
                                       solicitado_por, caso_id)
values ('dddd1000-0000-4000-8000-00000000000a','Colchones del reparto','20','otro','20','alta',
        'solicitado','aaaa0000-0000-4000-8000-00000000000a','f4000000-0000-4000-8000-00000000000a')
on conflict (id) do nothing;

set session_replication_role = origin;

-- ═══ T1 — El helper del área agrupa a los cinco ═══
-- `puede_verificar()` dejaba fuera al gestor de casos y al mando del grupo; si el helper
-- nuevo repitiera ese error, media área se quedaría fuera de su propio tablero.
do $$
begin
  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');   -- Vera, rol verificador
  perform pg_temp.ok('T1 el verificador es del área eje', public.puede_gestion_casos());
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');   -- Gina, gestor_casos
  perform pg_temp.ok('T1 la gestora de casos también', public.puede_gestion_casos());
  perform pg_temp.como('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');   -- Lidia, mando del grupo
  perform pg_temp.ok('T1 y el mando del grupo también', public.puede_gestion_casos());
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Luis Logística
  perform pg_temp.ok('T1 pero Logística NO', not public.puede_gestion_casos());
end $$;

-- ═══ T2 — El reparto de estados ═══
do $$
begin
  perform pg_temp.ok('T2 solicitado es del eje',    public.area_de_estado_insumo('solicitado') = 'gestion');
  perform pg_temp.ok('T2 en_gestion es del eje',    public.area_de_estado_insumo('en_gestion') = 'gestion');
  perform pg_temp.ok('T2 cancelado es del eje',     public.area_de_estado_insumo('cancelado') = 'gestion');
  perform pg_temp.ok('T2 no_disponible es del eje', public.area_de_estado_insumo('no_disponible') = 'gestion');
  perform pg_temp.ok('T2 en_ruta es de Logística',  public.area_de_estado_insumo('en_ruta') = 'logistica');
  perform pg_temp.ok('T2 entregado es de Logística', public.area_de_estado_insumo('entregado') = 'logistica');
end $$;

-- ═══ T3 — LO QUE IMPORTA: la frontera frena, y frena con ERROR ═══
-- Si la frontera viviera en la policy en vez de en el trigger, esto no daría excepción:
-- daría 0 filas, y la app diría «Estado actualizado» sin que nadie se enterara.
do $$
declare v_err text := ''; v_estado text;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Logística
  begin
    update public.solicitudes_insumo set estado = 'en_gestion'
     where id = 'dddd1000-0000-4000-8000-00000000000a';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T3 Logística NO puede llevarla a «en gestión»', v_err <> '');
  perform pg_temp.ok('T3 y el error dice de quién es el paso', v_err ilike '%Verificación y Gestión%');

  perform set_config('role','postgres',true);
  select estado::text into v_estado from public.solicitudes_insumo
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T3 la solicitud no se movió', v_estado = 'solicitado');
end $$;

-- ═══ T4 — El área eje sí la mueve, y llega hasta la frontera ═══
do $$
declare v_estado text; v_err text := '';
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');   -- Gina Gestora
  update public.solicitudes_insumo set estado = 'en_gestion'
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  perform set_config('role','postgres',true);
  select estado::text into v_estado from public.solicitudes_insumo
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T4 el área eje la lleva a «en gestión»', v_estado = 'en_gestion');

  -- Y NO puede cruzar: 'en_ruta' es de Logística.
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  begin
    update public.solicitudes_insumo set estado = 'en_ruta'
     where id = 'dddd1000-0000-4000-8000-00000000000a';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T4 pero NO la pone en ruta: eso lo toma Logística', v_err <> '');
  perform pg_temp.ok('T4 y el error nombra a Logística', v_err ilike '%Logística%');
end $$;

-- ═══ T5 — Logística no perdió lo suyo ═══
-- Es la mitad del riesgo del cambio: repartir sin romperle el trabajo al área que ya lo hacía.
do $$
declare v_estado text;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Logística
  update public.solicitudes_insumo set estado = 'en_ruta'
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  perform set_config('role','postgres',true);
  select estado::text into v_estado from public.solicitudes_insumo
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T5 Logística TOMA la entrega y la pone en ruta', v_estado = 'en_ruta');
end $$;

-- ═══ T6 — El otro lado de la frontera, ya en ruta ═══
do $$
declare v_err text := '';
begin
  perform pg_temp.como('aaaa9999-9999-4999-8999-999999999999');
  begin
    update public.solicitudes_insumo set estado = 'entregado'
     where id = 'dddd1000-0000-4000-8000-00000000000a';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T6 el área eje no da por entregada una solicitud', v_err <> '');
end $$;

-- ═══ T7 — Sin sesión NO se aplica la frontera, y es deliberado ═══
-- Las semillas del CI y los procesos internos escriben como postgres sin JWT. Si esto
-- fallara, media suite de pruebas se caería sin proteger nada.
do $$
declare v_estado text;
begin
  perform set_config('role','postgres',true);
  perform set_config('request.jwt.claims', '', true);
  update public.solicitudes_insumo set estado = 'solicitado'
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  select estado::text into v_estado from public.solicitudes_insumo
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T7 sin sesión la frontera no bloquea (semillas y procesos internos)',
                     v_estado = 'solicitado');
end $$;

-- ═══ T8 — La frontera NO opina de las demás columnas ═══
-- El área que no es dueña del estado sigue pudiendo trabajar la solicitud: anotar, asignar
-- un punto de acopio, escalar. Si el trigger bloqueara cualquier UPDATE, el reparto le
-- habría quitado a Logística el trabajo que sí es suyo.
do $$
declare v_cant text;
begin
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Logística, sobre 'solicitado'
  update public.solicitudes_insumo set cantidad = '25 colchones'
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  perform set_config('role','postgres',true);
  select cantidad into v_cant from public.solicitudes_insumo
   where id = 'dddd1000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T8 se puede editar la solicitud aunque el estado sea de la otra área',
                     v_cant = '25 colchones');
end $$;

-- ═══ T9 — La ficha de Alianzas cambió de firmante (0242) ═══
do $$
declare v_err text := ''; v_estado text;
begin
  perform set_config('role','postgres',true);
  insert into public.oportunidades (id, titulo, categoria, estado, origen, rubro, creado_por)
  values ('cccc0000-0000-4000-8000-00000000000a','Empresa de prueba','empresa','investigacion',
          'prospeccion','alimentos','aaaa0000-0000-4000-8000-00000000000a')
  on conflict (id) do nothing;

  -- Alianzas ya NO marca su propio semáforo (decisión: sustitución).
  perform pg_temp.como('aaaa8888-8888-4888-8888-888888888888');   -- Alba Alianzas (0237)
  begin
    perform public.marcar_campo_verif_prospeccion('cccc0000-0000-4000-8000-00000000000a',
              'identidad', 'verificado', null);
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.ok('T9 Alianzas ya no firma su propia ficha', v_err <> '');

  -- El área eje sí.
  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');   -- Vera Verificadora
  perform public.marcar_campo_verif_prospeccion('cccc0000-0000-4000-8000-00000000000a',
            'identidad', 'verificado', 'documento visto');
  perform set_config('role','postgres',true);
  select estado into v_estado from public.oportunidad_captacion_verif_campo
   where oportunidad_id = 'cccc0000-0000-4000-8000-00000000000a' and campo = 'identidad';
  perform pg_temp.ok('T9 y el área eje sí la firma', v_estado = 'verificado');
end $$;

-- ═══ T10 — La vista curada: el eje lee la ficha CON contactos ═══
do $$
declare v_tel text; v_n int;
begin
  perform set_config('role','postgres',true);
  update public.oportunidades set responsable_telefono = '0412-1234567'
   where id = 'cccc0000-0000-4000-8000-00000000000a';

  perform pg_temp.como('aaaa1111-1111-4111-8111-111111111111');
  select responsable_telefono into v_tel from public.ficha_alianza_verificacion
   where id = 'cccc0000-0000-4000-8000-00000000000a';
  perform pg_temp.ok('T10 el área eje ve el contacto que tiene que verificar', v_tel = '0412-1234567');

  -- Y quien no es del área no ve la vista.
  perform pg_temp.como('aaaa3333-3333-4333-8333-333333333333');   -- Logística
  select count(*) into v_n from public.ficha_alianza_verificacion;
  perform pg_temp.ok('T10 y Logística no la ve (sigue con alianzas_panel, sin contactos)', v_n = 0);
end $$;

-- ═══ T11 — Validado rancio: editar el dato tumba su verde ═══
-- Sin esto, Alianzas podría cambiar el teléfono después de la firma y el verde no se caería.
do $$
declare v_estado text;
begin
  perform set_config('role','postgres',true);
  -- Se firma el campo 'responsable' y luego se cambia el teléfono que verificaba.
  insert into public.oportunidad_captacion_verif_campo (oportunidad_id, campo, estado, verificado_en)
  values ('cccc0000-0000-4000-8000-00000000000a','responsable','verificado', now())
  on conflict (oportunidad_id, campo) do update set estado = 'verificado';

  update public.oportunidades set responsable_telefono = '0424-7654321'
   where id = 'cccc0000-0000-4000-8000-00000000000a';

  select estado into v_estado from public.oportunidad_captacion_verif_campo
   where oportunidad_id = 'cccc0000-0000-4000-8000-00000000000a' and campo = 'responsable';
  perform pg_temp.ok('T11 cambiar el teléfono tumba el verde de «responsable»', v_estado = 'sin_revisar');

  -- Y no tumba los demás: solo el campo cuyo dato cambió.
  select estado into v_estado from public.oportunidad_captacion_verif_campo
   where oportunidad_id = 'cccc0000-0000-4000-8000-00000000000a' and campo = 'identidad';
  perform pg_temp.ok('T11 y no tumba los que no se tocaron', v_estado = 'verificado');
end $$;

-- ═══ T12 — ACL ═══
do $$
declare r record; v_mal text := '';
begin
  for r in
    select p.oid::regprocedure::text as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('gate_area_estado_insumo','notificar_solicitud_al_eje',
                         'notificar_traspaso_a_logistica','reset_verif_ficha_al_editar',
                         'notificar_ficha_por_verificar')
  loop
    if has_function_privilege('public', r.f, 'execute') then v_mal := v_mal || ' PUBLIC:' || r.f; end if;
  end loop;
  perform pg_temp.ok('T12 los triggers no son ejecutables por PUBLIC' || v_mal, v_mal = '');
  perform pg_temp.ok('T12 authenticated lee la vista curada',
    has_table_privilege('authenticated', 'public.ficha_alianza_verificacion', 'select'));
  perform pg_temp.ok('T12 y anon no',
    not has_table_privilege('anon', 'public.ficha_alianza_verificacion', 'select'));
end $$;

-- ═══ Veredicto ═══
do $$
declare v_n int; v_lista text;
begin
  select count(*), string_agg(nombre, ' · ') into v_n, v_lista from pg_fallos_eje;
  if v_n > 0 then
    raise exception 'PRUEBAS DEL EJE (0241/0242) EN ROJO — % fallo(s): %', v_n, v_lista;
  end if;
  raise notice '== TODAS LAS PRUEBAS DEL EJE (0241/0242) PASARON ==';
end $$;
