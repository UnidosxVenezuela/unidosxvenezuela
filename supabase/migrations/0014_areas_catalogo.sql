-- ============================================================
-- 0014 — Áreas extensibles por admin (enum -> catálogo de texto)
-- ============================================================
-- Las áreas dejan de ser un enum rígido para ser DATOS (filas en la
-- tabla areas) que un admin puede crear. Se conservan las 9 OCHA y se
-- agregan áreas de trabajo donde hay equipos: programación, diseño,
-- marketing, transcripción.
-- ============================================================

-- enum -> text (areas.clave PK y grupos.area FK).
alter table public.grupos drop constraint if exists grupos_area_fkey;
alter table public.areas  alter column clave type text using clave::text;
alter table public.grupos alter column area  type text using area::text;
alter table public.grupos add constraint grupos_area_fkey
  foreign key (area) references public.areas (clave) on update cascade;

-- Nuevas áreas de trabajo (idempotente).
insert into public.areas (clave, nombre, descripcion) values
  ('programacion',  'Programación',  'Desarrollo de la plataforma, bots y automatizaciones'),
  ('diseno',        'Diseño',        'Identidad visual, piezas e infografías'),
  ('marketing',     'Marketing',     'Campañas de donación y difusión'),
  ('transcripcion', 'Transcripción', 'Transcribir audios y listados de campo')
on conflict (clave) do nothing;

-- (La política areas_admin de 0002 ya permite a un admin crear/editar áreas.)
