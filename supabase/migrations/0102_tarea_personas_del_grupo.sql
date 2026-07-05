-- ============================================================
-- 0102 — Participar en una tarea de grupo exige ser del grupo (defensa en profundidad)
-- ------------------------------------------------------------
-- Complementa 0101: además del `asignado_a`, la lista de participantes
-- (`tarea_personas`, modelo de cupo) de una tarea CON grupo solo admite a MIEMBROS de
-- ese grupo (o su líder). Hoy no hay ninguna vía de app que sume a un ajeno —el alta
-- pasa por la asignación validada— pero se blinda a nivel de BD para que las
-- asignaciones/participaciones sean siempre del propio grupo. Tareas sin grupo: libres.
-- Idempotente. Ejecutar tras 0101.
-- ============================================================

create or replace function public.tarea_persona_del_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_grupo uuid;
begin
  select grupo_id into v_grupo from public.tareas where id = new.tarea_id;
  if v_grupo is not null
     and not exists (
       select 1 from public.miembros_grupo m
       where m.grupo_id = v_grupo and m.perfil_id = new.perfil_id)
     and not exists (
       select 1 from public.grupos g
       where g.id = v_grupo and g.lider_id = new.perfil_id) then
    raise exception 'Esta tarea es de un grupo; solo sus miembros pueden participar en ella.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_tarea_persona_del_grupo on public.tarea_personas;
create trigger trg_tarea_persona_del_grupo
  before insert on public.tarea_personas
  for each row execute function public.tarea_persona_del_grupo();
