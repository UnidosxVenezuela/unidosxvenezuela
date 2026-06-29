-- ============================================================
-- 0025 — Adjuntos (imágenes/archivos) en mensajes fijados
-- ============================================================
-- El líder del grupo / coordinación puede fijar un anuncio con una imagen
-- o un archivo. Los archivos van al bucket privado 'grupos' en la ruta
-- '<grupo_id>/<archivo>'; se leen con URL firmada. Las reglas de quién
-- puede subir reusan puede_fijar_en_grupo() (0023).
-- ============================================================

alter table public.mensajes_fijados
  add column if not exists adjunto_path   text,
  add column if not exists adjunto_tipo   text check (adjunto_tipo in ('imagen','archivo')),
  add column if not exists adjunto_nombre text;

insert into storage.buckets (id, name, public)
  values ('grupos', 'grupos', false)
  on conflict (id) do nothing;

-- Lectura: cualquier verificado (igual que los anuncios del grupo).
drop policy if exists "grupos_storage_lectura" on storage.objects;
create policy "grupos_storage_lectura" on storage.objects for select to authenticated
  using (bucket_id = 'grupos' and public.es_verificado());

-- Subir: solo quien puede fijar en ese grupo (líder/coordinación).
drop policy if exists "grupos_storage_insert" on storage.objects;
create policy "grupos_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'grupos' and public.puede_fijar_en_grupo((storage.foldername(name))[1]::uuid));

-- Borrar: el dueño del archivo o coordinación.
drop policy if exists "grupos_storage_delete" on storage.objects;
create policy "grupos_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'grupos' and (owner = auth.uid() or public.es_coordinacion()));
