-- 0041: Archivo final de la pieza (además del enlace).
-- Permite subir la gráfica/archivo a un bucket público 'contenido'.
-- Aplicar DESPUÉS de 0037 (usa puede_pipeline()).

alter table public.piezas_contenido add column if not exists adjunto_url text;
alter table public.piezas_contenido add column if not exists adjunto_nombre text;

-- Bucket público para las piezas finales (gráficas listas para publicar).
insert into storage.buckets (id, name, public)
  values ('contenido', 'contenido', true)
  on conflict (id) do nothing;

-- Subir/editar: cualquier miembro del pipeline. Ruta: contenido/<pieza_id>/archivo.
drop policy if exists "contenido_insert" on storage.objects;
create policy "contenido_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'contenido' and public.puede_pipeline());

drop policy if exists "contenido_update" on storage.objects;
create policy "contenido_update" on storage.objects for update to authenticated
  using (bucket_id = 'contenido' and public.puede_pipeline());

-- Borrar: el dueño del archivo o coordinación.
drop policy if exists "contenido_delete" on storage.objects;
create policy "contenido_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'contenido' and (owner = auth.uid() or public.es_coordinacion()));

-- Lectura: el bucket es público (la pieza final se publica), no requiere policy.
