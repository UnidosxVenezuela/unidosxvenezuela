-- ============================================================
-- 0053 — Storage: buckets + políticas RLS (autoritativo)
-- ============================================================
-- Consolida y DEJA EFECTIVAS las políticas de Storage para que las subidas
-- funcionen con la sesión del usuario (sin depender de la service key). Crea los
-- 4 buckets y sus políticas juntos, para que no falle por "bucket inexistente" o
-- por políticas que quedaron sin aplicar en migraciones anteriores. Idempotente.
--
-- Buckets:
--   avatares  (público)  — foto de perfil; cada quien escribe SOLO en su carpeta.
--   contenido (público)  — pieza final de contenido; escribe cualquier autenticado.
--   grupos    (privado)  — adjuntos de anuncios de grupo; autenticados.
--   adjuntos  (privado)  — adjuntos de tareas; autenticados.
-- ============================================================

-- 1) Crear/asegurar los buckets (público según corresponda).
insert into storage.buckets (id, name, public) values
  ('avatares',  'avatares',  true),
  ('contenido', 'contenido', true),
  ('grupos',    'grupos',    false),
  ('adjuntos',  'adjuntos',  false)
on conflict (id) do update set public = excluded.public;

-- 2) Políticas sobre storage.objects. La RLS de storage.objects ya viene activada
--    en Supabase; solo (re)creamos políticas permisivas correctas.

-- avatares: lectura pública; cada usuario escribe en su carpeta avatares/<uid>/…
drop policy if exists "avatares_select" on storage.objects;
create policy "avatares_select" on storage.objects for select
  using ( bucket_id = 'avatares' );
drop policy if exists "avatares_insert" on storage.objects;
create policy "avatares_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text );
drop policy if exists "avatares_update" on storage.objects;
create policy "avatares_update" on storage.objects for update to authenticated
  using ( bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text )
  with check ( bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text );
drop policy if exists "avatares_delete" on storage.objects;
create policy "avatares_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text );

-- contenido: lectura pública; escribe cualquier autenticado.
drop policy if exists "contenido_select" on storage.objects;
create policy "contenido_select" on storage.objects for select
  using ( bucket_id = 'contenido' );
drop policy if exists "contenido_insert" on storage.objects;
create policy "contenido_insert" on storage.objects for insert to authenticated
  with check ( bucket_id = 'contenido' );
drop policy if exists "contenido_update" on storage.objects;
create policy "contenido_update" on storage.objects for update to authenticated
  using ( bucket_id = 'contenido' ) with check ( bucket_id = 'contenido' );
drop policy if exists "contenido_delete" on storage.objects;
create policy "contenido_delete" on storage.objects for delete to authenticated
  using ( bucket_id = 'contenido' );

-- grupos (privado): lectura/escritura de autenticados (la RLS de las tablas que
-- referencian estos archivos gobierna quién crea el registro).
drop policy if exists "grupos_all" on storage.objects;
create policy "grupos_all" on storage.objects for all to authenticated
  using ( bucket_id = 'grupos' ) with check ( bucket_id = 'grupos' );

-- adjuntos (privado): igual que grupos.
drop policy if exists "adjuntos_all" on storage.objects;
create policy "adjuntos_all" on storage.objects for all to authenticated
  using ( bucket_id = 'adjuntos' ) with check ( bucket_id = 'adjuntos' );
