-- ============================================================
-- 0170 — Avisos con imagen (notificaciones + bucket público «avisos»)
-- ------------------------------------------------------------
-- Un administrador ya puede enviar avisos (filas en `notificaciones` con
-- tipo='aviso_admin', abanico de una fila por destinatario). Hasta ahora solo
-- llevaban texto; esta migración les agrega una IMAGEN opcional:
--   1) Columna `notificaciones.imagen_url` (URL pública de la imagen del aviso).
--   2) Bucket PÚBLICO `avisos` para alojar esas imágenes.
--
-- Por qué público: la imagen viaja por canales que la buscan por URL desde fuera
-- (Telegram `sendPhoto` la descarga; el push `image` lo baja el navegador/SW). Son
-- imágenes de AVISOS de difusión (anuncios a todo el equipo/grupos), NO evidencias
-- de casos ni datos sensibles — esos siguen en buckets privados (adjuntos/grupos).
--
-- Escritura: solo administradores (o el service_role del servidor, que ya usa la
-- acción `enviarAviso`). La validación de tipo/peso de la imagen se hace en la
-- Server Action antes de subir. Idempotente. Tras 0168.
-- ============================================================

-- 1) Columna de imagen en las notificaciones (una por fila del abanico).
alter table public.notificaciones add column if not exists imagen_url text;

-- 2) Bucket público para las imágenes de avisos.
insert into storage.buckets (id, name, public) values ('avisos', 'avisos', true)
on conflict (id) do update set public = excluded.public;

-- 3) Políticas de storage.objects para el bucket `avisos`.
--    Lectura pública (para que Telegram/el navegador puedan bajar la imagen).
drop policy if exists "avisos_select" on storage.objects;
create policy "avisos_select" on storage.objects for select
  using ( bucket_id = 'avisos' );

--    Escritura SOLO administradores (defensa en profundidad; el servidor usa la
--    service_role, que evade la RLS de todos modos). `es_admin()` resuelve el rol
--    de quien llama vía auth.uid().
drop policy if exists "avisos_insert" on storage.objects;
create policy "avisos_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'avisos' and public.es_admin() );
drop policy if exists "avisos_update" on storage.objects;
create policy "avisos_update" on storage.objects for update to authenticated
  using ( bucket_id = 'avisos' and public.es_admin() )
  with check ( bucket_id = 'avisos' and public.es_admin() );
drop policy if exists "avisos_delete" on storage.objects;
create policy "avisos_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'avisos' and public.es_admin() );
