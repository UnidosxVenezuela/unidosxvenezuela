-- 0035: Avatar de perfil (foto)
-- Agrega la columna perfiles.avatar_url y un bucket público 'avatares' donde
-- cada persona sube SOLO su propia foto (ruta: avatares/<uid>/archivo).
-- El componente Avatar ya muestra la foto si hay avatar_url, o iniciales si no.

alter table public.perfiles add column if not exists avatar_url text;

-- Bucket público (la foto de perfil se sirve por URL pública; la ruta lleva el uid).
insert into storage.buckets (id, name, public)
  values ('avatares', 'avatares', true)
  on conflict (id) do nothing;

-- Subir: solo a la carpeta propia (avatares/<uid>/...).
drop policy if exists "avatares_insert" on storage.objects;
create policy "avatares_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- Reemplazar: solo el dueño, y siempre dentro de su carpeta.
drop policy if exists "avatares_update" on storage.objects;
create policy "avatares_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and owner = auth.uid())
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- Borrar: el dueño o coordinación.
drop policy if exists "avatares_delete" on storage.objects;
create policy "avatares_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (owner = auth.uid() or public.es_coordinacion()));

-- Lectura: el bucket es público, la URL pública no requiere policy de SELECT.
-- La actualización de perfiles.avatar_url usa la policy de "editar mi perfil" ya existente.
