-- ============================================================
-- 0157 — Asignar una tarea a VARIAS personas: aviso a todos los asignados
-- ------------------------------------------------------------
-- Una tarea ya podía tener varias personas (tabla `tarea_personas` + `cupo`, 0026), pero
-- el aviso de asignación (trigger `notificar_asignacion` de 0001) solo avisaba al ÚNICO
-- `asignado_a` (el responsable principal). Al permitir asignar a varias personas del grupo
-- desde el formulario de creación (cada una entra como fila en `tarea_personas`), esas
-- personas también deben recibir su notificación (+ push).
--
-- Se unifica el aviso en `tarea_personas`: se avisa a CADA persona añadida a la tarea —sea
-- por asignación múltiple del líder/coordinador o porque se une por cupo (`tomar_tarea`)—.
-- Antes, quien se unía por cupo NO recibía aviso; ahora sí. Se retira el aviso del trigger
-- de `tareas` (que solo cubría al principal) para no duplicar el aviso al responsable.
--
-- Idempotente. Ejecutar tras 0156.
-- ============================================================

-- Aviso (+ push por el webhook de notificaciones) a cada persona añadida a una tarea.
create or replace function public.notificar_persona_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_titulo text;
begin
  select titulo into v_titulo from public.tareas where id = new.tarea_id;
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  values (new.perfil_id, 'tarea_asignada', 'Nueva tarea asignada',
          coalesce(v_titulo, 'Tarea'), '/tareas/' || new.tarea_id);
  return new;
end $$;

drop trigger if exists trg_tarea_persona_notificar on public.tarea_personas;
create trigger trg_tarea_persona_notificar
  after insert on public.tarea_personas
  for each row execute function public.notificar_persona_tarea();

-- El aviso pasa a `tarea_personas` (cubre a TODOS los asignados y a quien se une por cupo),
-- así que se retira el del trigger de `tareas` para no avisar dos veces al responsable.
-- (La función public.notificar_asignacion queda sin uso, inofensiva.)
drop trigger if exists trg_tareas_notificar on public.tareas;
