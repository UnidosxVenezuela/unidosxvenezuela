-- ============================================================
-- 0049 — Eliminar grupos: solo administradores
-- ============================================================
-- El borrado de un grupo pasa a ser EXCLUSIVO de admin (antes lo permitía toda
-- la coordinación). Borrar un grupo arrastra en cascada sus miembros, anuncios
-- fijados, reuniones, pizarra, vetados y publicaciones del tablón del grupo; las
-- TAREAS del grupo se conservan (su grupo_id queda en null). En la app la acción
-- pide confirmación. Idempotente.
-- ============================================================

drop policy if exists "grupos_delete_coord" on public.grupos;
drop policy if exists "grupos_delete_admin" on public.grupos;
create policy "grupos_delete_admin" on public.grupos for delete
  to authenticated using (public.es_admin());
