-- ============================================================
-- 0015 — Storage: bucket privado 'adjuntos' + policies
-- ============================================================
-- La lectura usa puede_ver_tarea() (0012, SIN la rama de tareas
-- abiertas) → un voluntario NO puede firmar URLs de adjuntos de
-- tareas abiertas ajenas. La ruta de objeto es '<tarea_id>/<archivo>'.
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('adjuntos', 'adjuntos', false)
  on conflict (id) do nothing;

drop policy if exists "adj_storage_lectura" on storage.objects;
create policy "adj_storage_lectura" on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and public.puede_ver_tarea((storage.foldername(name))[1]::uuid));

drop policy if exists "adj_storage_insert" on storage.objects;
create policy "adj_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and public.puede_editar_tarea((storage.foldername(name))[1]::uuid));

drop policy if exists "adj_storage_delete" on storage.objects;
create policy "adj_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and (owner = auth.uid() or public.es_coordinacion()));
