-- ============================================================
-- Plataforma Unidos — Notificaciones automáticas (tablón y comentarios)
-- ============================================================

-- Al publicar en el tablón de un grupo, notifica a sus miembros (menos al autor).
create or replace function public.notificar_publicacion_grupo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.grupo_id is not null then
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select m.perfil_id, 'tablon', 'Nueva publicación en tu grupo',
           left(new.contenido, 140), '/tablon'
    from public.miembros_grupo m
    where m.grupo_id = new.grupo_id
      and m.perfil_id <> new.autor_id;
  end if;
  return new;
end; $$;

create trigger trg_pub_notificar
  after insert on public.publicaciones
  for each row execute function public.notificar_publicacion_grupo();

-- Al comentar una tarea, notifica a la persona asignada y al creador (menos al autor).
create or replace function public.notificar_comentario_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t_asignado uuid;
  t_creador  uuid;
begin
  select asignado_a, creado_por into t_asignado, t_creador
  from public.tareas where id = new.tarea_id;

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select distinct dest, 'comentario_tarea', 'Nuevo comentario en una tarea',
         left(new.contenido, 140), '/tareas/' || new.tarea_id
  from unnest(array[t_asignado, t_creador]) as dest
  where dest is not null and dest <> new.autor_id;

  return new;
end; $$;

create trigger trg_comtarea_notificar
  after insert on public.comentarios_tarea
  for each row execute function public.notificar_comentario_tarea();
