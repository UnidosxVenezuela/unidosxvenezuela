-- Semilla autónoma para las pruebas de 0231 (hilos de trabajo).
-- No depende de ninguna otra semilla: crea sus propios usuarios, casos, grupo y
-- solicitud de insumo. Se corre como superusuario (bypassa RLS).
--
-- session_replication_role = replica: NO dispara triggers (numeración de casos,
-- notificaciones de alta, etc.), que aquí solo añadirían ruido.
set session_replication_role = replica;

-- ── Usuarios: uno por cada rol que la prueba necesita distinguir ──
insert into auth.users (id, email) values
  ('aaaa0000-0000-4000-8000-00000000000a','admin.hilos@t.local'),
  ('aaaa1111-1111-4111-8111-111111111111','verificador.hilos@t.local'),
  ('aaaa2222-2222-4222-8222-222222222222','redaccion.hilos@t.local'),
  ('aaaa3333-3333-4333-8333-333333333333','logistica.hilos@t.local'),
  ('aaaa4444-4444-4444-8444-444444444444','miembro.hilos@t.local'),
  ('aaaa5555-5555-4555-8555-555555555555','observador.hilos@t.local'),
  ('aaaa6666-6666-4666-8666-666666666666','ajena.hilos@t.local')
on conflict (id) do nothing;

insert into public.perfiles (id, nombre_completo, rol, roles_extra, verificado) values
  ('aaaa0000-0000-4000-8000-00000000000a','Admin Hilos','admin','{}', true),
  ('aaaa1111-1111-4111-8111-111111111111','Vera Verificadora','verificador','{}', true),
  ('aaaa2222-2222-4222-8222-222222222222','Rita Redacción','redaccion','{}', true),
  ('aaaa3333-3333-4333-8333-333333333333','Luis Logística','logistica','{}', true),
  ('aaaa4444-4444-4444-8444-444444444444','Marta Miembro','voluntario','{}', true),
  ('aaaa5555-5555-4555-8555-555555555555','Olga Observadora','observador','{}', true),
  ('aaaa6666-6666-4666-8666-666666666666','Ana Ajena','voluntario','{}', true)
on conflict (id) do update
  set rol = excluded.rol, roles_extra = excluded.roles_extra, verificado = excluded.verificado;

-- Identidad aprobada: varias ramas de casos_select la exigen (identidad_aprobada()).
insert into public.verificaciones_identidad (perfil_id, estado, selfie_path, documento_path, consentimiento)
select p, 'aprobada', 's', 'd', true from unnest(array[
  'aaaa0000-0000-4000-8000-00000000000a','aaaa1111-1111-4111-8111-111111111111',
  'aaaa2222-2222-4222-8222-222222222222','aaaa3333-3333-4333-8333-333333333333',
  'aaaa4444-4444-4444-8444-444444444444','aaaa5555-5555-4555-8555-555555555555',
  'aaaa6666-6666-4666-8666-666666666666']::uuid[]) as p
on conflict (perfil_id) do update set estado = 'aprobada';

-- ── Dos casos: uno pendiente (para el hilo) y uno confirmado (ancla del insumo) ──
insert into public.casos (id, titulo, descripcion, categoria, es_requerimiento, estado, creado_por,
                          req_tipo, req_cantidad, req_urgencia, lat, lng) values
  ('e0000000-0000-4000-8000-000000000001','Caso de prueba para hilos','desc', null, true, 'pendiente',
   'aaaa0000-0000-4000-8000-00000000000a','alimentos','10','alta', 10.0, -66.0),
  ('e0000000-0000-4000-8000-000000000008','Caso confirmado para insumo','desc', null, true, 'confirmado',
   'aaaa0000-0000-4000-8000-00000000000a','otro','20','alta', 10.1, -66.1)
on conflict (id) do nothing;

-- ── Un grupo con Marta dentro y Ana fuera ──
insert into public.grupos (id, nombre, area, lider_id, clave)
values ('bbbb0000-0000-4000-8000-000000000001','Grupo Prueba Hilos','logistica',
        'aaaa0000-0000-4000-8000-00000000000a','grupo-prueba-hilos')
on conflict (id) do nothing;

insert into public.miembros_grupo (grupo_id, perfil_id, rol_en_grupo)
values ('bbbb0000-0000-4000-8000-000000000001','aaaa4444-4444-4444-8444-444444444444','miembro')
on conflict do nothing;

-- ── Una solicitud de insumo, ancla del ámbito 'insumo' ──
insert into public.solicitudes_insumo (id, titulo, descripcion, tipo, cantidad, urgencia, estado,
                                       solicitado_por, caso_id)
values ('dddd0000-0000-4000-8000-000000000001','Colchones para el refugio','20 colchones',
        'otro','20','alta','solicitado',
        'aaaa0000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-000000000008')
on conflict (id) do nothing;

set session_replication_role = origin;
