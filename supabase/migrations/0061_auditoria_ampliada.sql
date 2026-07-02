-- ============================================================
-- 0061 — Auditoría ampliada (registro de actividad más completo)
-- ------------------------------------------------------------
-- Extiende la auditoría global para cubrir más acciones de usuario:
--   · perfiles            (ediciones de datos, además de rol/verificación
--                          que ya se registran de forma semántica)
--   · casos_adjuntos      (evidencias adjuntas en el flujo de casos)
--   · acopio_responsables (gestión de responsables de centros de acopio)
-- Además enriquece la metadata con `nombre_completo` y `caso_id` para que el
-- Registro de actividad muestre a quién/qué afecta cada cambio.
-- Idempotente. NO se auditan las tablas psicosociales (confidenciales) ni
-- notificaciones/pizarra/push (ruido).
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
    coalesce(rec->>'id', rec->>'tarea_id', rec->>'grupo_id', rec->>'caso_id'),
    jsonb_strip_nulls(jsonb_build_object(
      'titulo',          rec->>'titulo',
      'nombre',          rec->>'nombre',
      'nombre_completo', rec->>'nombre_completo',
      'estado',          rec->>'estado',
      'grupo_id',        rec->>'grupo_id',
      'caso_id',         rec->>'caso_id',
      'perfil_id',       rec->>'perfil_id'
    ))
  );
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

-- (Re)crea los triggers de las tablas nuevas a auditar. Las ya cubiertas por
-- 0030/0034 conservan sus triggers; aquí solo sumamos las que faltaban.
do $$
declare t text;
begin
  foreach t in array array['perfiles','casos_adjuntos','acopio_responsables'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists aud_%1$s on public.%1$I', t);
      execute format('create trigger aud_%1$s after insert or update or delete on public.%1$I for each row execute function public.auditar_cambio()', t);
    end if;
  end loop;
end $$;
