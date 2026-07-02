-- ============================================================
-- 0056 — El coordinador publica en su grupo (tareas + anuncios fijados)
-- ============================================================
-- El COORDINADOR (miembro de su grupo) puede, igual que el líder y el admin:
-- crear tareas del grupo y fijar/quitar anuncios con documentos o fotos.
-- Sigue SIN poder agregar/quitar miembros ni gestionar el grupo. Idempotente.
-- ============================================================

-- ¿Puede publicar en este grupo? admin, líder del grupo, o coordinador miembro.
create or replace function public.puede_publicar_en_grupo(g uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.tiene_rol('admin')
      or exists (select 1 from public.grupos gr where gr.id = g and gr.lider_id = auth.uid())
      or (public.tiene_rol('coordinador') and public.es_miembro_de(g));
end $$;
grant execute on function public.puede_publicar_en_grupo(uuid) to authenticated;

-- Tareas: el coordinador también crea tareas de SU grupo.
drop policy if exists "tareas_insert" on public.tareas;
create policy "tareas_insert" on public.tareas for insert to authenticated
  with check (public.es_verificado() and creado_por = auth.uid()
    and (public.es_admin()
         or (grupo_id is not null and public.puede_publicar_en_grupo(grupo_id))));

-- Anuncios fijados: publicar/quitar según puede_publicar_en_grupo.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='mensajes_fijados' loop
    execute format('drop policy if exists %I on public.mensajes_fijados', p.policyname); end loop;
end $$;
create policy "fijados_select" on public.mensajes_fijados for select to authenticated
  using (public.es_admin() or public.es_miembro_de(grupo_id)
         or exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()));
create policy "fijados_insert" on public.mensajes_fijados for insert to authenticated
  with check (autor_id = auth.uid() and public.puede_publicar_en_grupo(grupo_id));
create policy "fijados_delete" on public.mensajes_fijados for delete to authenticated
  using (public.es_admin() or autor_id = auth.uid()
         or exists (select 1 from public.grupos g where g.id = grupo_id and g.lider_id = auth.uid()));
