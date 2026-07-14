-- ============================================================
-- 0158 — El admin, el líder o un coordinador pueden EDITAR la descripción de su grupo
-- ------------------------------------------------------------
-- La descripción del grupo (grupos.descripcion) solo la podían cambiar el admin y el LÍDER
-- (política grupos_update de 0058: es_admin() or lider_id = auth.uid()). Los COORDINADORES
-- del grupo no podían actualizarla. Se pide que también puedan mantenerla al día.
--
-- En vez de ampliar grupos_update (que dejaría a un coordinador cambiar CUALQUIER columna:
-- líder, área, nombre…), se expone una RPC `security definer` acotada que:
--   · autoriza a admin / líder del grupo / coordinador del grupo, y
--   · actualiza ÚNICAMENTE la columna `descripcion`.
-- Así el coordinador mantiene la descripción sin ganar poder sobre el resto del grupo.
--
-- Idempotente. Ejecutar tras 0157.
-- ============================================================

create or replace function public.editar_descripcion_grupo(p_grupo uuid, p_descripcion text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.es_admin()
    or exists (select 1 from public.grupos g where g.id = p_grupo and g.lider_id = auth.uid())
    or exists (select 1 from public.miembros_grupo m
               where m.grupo_id = p_grupo and m.perfil_id = auth.uid()
                 and m.rol_en_grupo = 'coordinador')
  ) then
    raise exception 'Solo el admin, el líder o un coordinador del grupo pueden editar su descripción.'
      using errcode = '42501';
  end if;

  update public.grupos
     set descripcion = nullif(btrim(coalesce(p_descripcion, '')), '')
   where id = p_grupo;
end $$;

grant execute on function public.editar_descripcion_grupo(uuid, text) to authenticated;
