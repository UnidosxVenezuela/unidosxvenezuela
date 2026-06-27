-- ============================================================
-- Plataforma Unidos — Datos semilla (catálogo de áreas)
-- ============================================================
-- Áreas operativas basadas en los clusters humanitarios (IASC/OCHA),
-- adaptadas al contexto del terremoto de Venezuela (junio 2026).

insert into public.areas (clave, nombre, descripcion) values
  ('salud',              'Salud',                     'Atención médica, hospitales de campaña, salud mental.'),
  ('agua_saneamiento',   'Agua y Saneamiento (WASH)', 'Agua potable, saneamiento, higiene, control de enfermedades.'),
  ('refugio',            'Refugio y Albergues',       'Albergues temporales, registro de damnificados, distribución de carpas.'),
  ('alimentacion',       'Alimentación',              'Seguridad alimentaria, cocinas comunitarias, distribución de víveres.'),
  ('logistica',          'Logística',                 'Transporte, almacenes, cadena de suministro, combustible.'),
  ('busqueda_rescate',   'Búsqueda y Rescate',        'Rescate en estructuras colapsadas, primeros auxilios en zona.'),
  ('telecomunicaciones', 'Telecomunicaciones',        'Conectividad de emergencia, radios, enlaces satelitales.'),
  ('proteccion',         'Protección',                'Protección de menores, personas vulnerables, datos sensibles.'),
  ('gestion_informacion','Gestión de Información',    'Mapeo, reportes de situación (3W: quién hace qué y dónde).')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- NOTA: Los usuarios se crean vía Supabase Auth (no aquí), y su
-- perfil se genera con el trigger on_auth_user_created.
-- Para promover a alguien a 'admin' tras registrarse, ejecuta
-- (con la service key o desde el SQL editor):
--
--   update public.perfiles set rol = 'admin', verificado = true
--   where id = '<uuid-del-usuario>';
--
-- Datos de ejemplo (grupos/tareas) se pueden cargar luego con un
-- script de seed que primero cree usuarios de prueba vía Auth Admin API.
-- ------------------------------------------------------------
