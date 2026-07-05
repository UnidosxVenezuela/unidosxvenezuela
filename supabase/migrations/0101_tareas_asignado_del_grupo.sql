-- ============================================================
-- 0101 — La asignación de una tarea debe ser del propio grupo
-- ------------------------------------------------------------
-- Una tarea de un grupo solo puede asignarse (o ser tomada) por un MIEMBRO de ese
-- grupo, para que las tareas y las asignaciones de un grupo no se mezclen con las de
-- otro. La atribución de la tarea al grupo ya la blinda la RLS (puede_publicar_en_grupo);
-- aquí se blinda además el destinatario. Se acepta al LÍDER del grupo aunque su
-- membresía formal aún no se haya sincronizado (defensivo si 0099 no se ha aplicado).
-- Las tareas SIN grupo (grupo_id null) quedan abiertas: no las restringe.
-- Idempotente. Ejecutar tras 0100.
-- ============================================================

create or replace function public.tareas_asignado_del_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.asignado_a is not null and new.grupo_id is not null
     and not exists (
       select 1 from public.miembros_grupo m
       where m.grupo_id = new.grupo_id and m.perfil_id = new.asignado_a)
     and not exists (
       select 1 from public.grupos g
       where g.id = new.grupo_id and g.lider_id = new.asignado_a) then
    raise exception 'Esta tarea es de un grupo; solo un miembro del grupo puede recibirla o tomarla.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_tareas_asignado_del_grupo on public.tareas;
create trigger trg_tareas_asignado_del_grupo
  before insert or update of asignado_a, grupo_id on public.tareas
  for each row execute function public.tareas_asignado_del_grupo();
