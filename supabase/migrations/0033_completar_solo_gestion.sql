-- ============================================================
-- 0033 — Dar una tarea por "completada": solo coordinación o líder del grupo
-- ============================================================
-- Regla de flujo: el responsable/voluntario sube entregables, pero quien
-- marca la tarea como completada es coordinación (admin/coordinador) o el
-- líder del grupo de la tarea. Reforzado en la BD (no solo en la UI).
-- ============================================================

create or replace function public.proteger_completar_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service_role / sistema
  if new.estado = 'completada' and old.estado is distinct from 'completada' then
    if not (
      public.es_coordinacion()
      or exists (select 1 from public.grupos g where g.id = new.grupo_id and g.lider_id = auth.uid())
    ) then
      raise exception 'Solo coordinación o el líder del grupo pueden dar una tarea por completada.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_completar_tarea on public.tareas;
create trigger trg_completar_tarea before update on public.tareas
  for each row execute function public.proteger_completar_tarea();
