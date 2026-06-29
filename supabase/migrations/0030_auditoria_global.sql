-- ============================================================
-- 0030 — Auditoría global (quién hizo qué y cuándo)
-- ============================================================
-- Trigger genérico que registra INSERT/UPDATE/DELETE de las tablas clave en
-- registro_auditoria. Captura la actividad venga de la web, la móvil o la API
-- (no depende del frontend). Lectura: solo coordinación (policy ya existente).
-- pizarra_grupo y notificaciones se excluyen a propósito (ruido/autosave).
-- ============================================================

create or replace function public.auditar_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  rec := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (
    auth.uid(),
    tg_table_name || ':' || lower(tg_op),
    tg_table_name,
    coalesce(rec->>'id', rec->>'tarea_id', rec->>'grupo_id'),
    jsonb_strip_nulls(jsonb_build_object(
      'titulo',    rec->>'titulo',
      'nombre',    rec->>'nombre',
      'grupo_id',  rec->>'grupo_id',
      'perfil_id', rec->>'perfil_id'
    ))
  );
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

do $$
declare t text;
begin
  foreach t in array array[
    'tareas','tarea_personas','comentarios_tarea','adjuntos_tarea',
    'grupos','miembros_grupo','miembros_baneados','mensajes_fijados',
    'publicaciones','registro_horas','puntos_acopio','reuniones','endpoints_aliados'
  ] loop
    execute format('drop trigger if exists aud_%1$s on public.%1$I', t);
    execute format('create trigger aud_%1$s after insert or update or delete on public.%1$I for each row execute function public.auditar_cambio()', t);
  end loop;
end $$;
