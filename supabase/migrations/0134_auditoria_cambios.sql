-- ============================================================
-- 0134 — Registro de actividad: menos ruido y más descriptivo
-- ------------------------------------------------------------
-- El trigger genérico `auditar_cambio()` (0061) audita CUALQUIER UPDATE de las
-- tablas cubiertas, incluida `perfiles`. Como la presencia (0117) refresca
-- `ultima_conexion` con un latido cada ~60s (perfil/actions.ts `latido`), el
-- registro se llenaba de «editó un perfil» sin valor. Además, ni las ediciones
-- reales decían QUÉ cambió (el trigger guardaba toda la fila, no el diff).
--
-- Se mejora `auditar_cambio()` para:
--   1) en UPDATE, calcular las columnas que realmente cambiaron (OLD vs NEW);
--   2) NO auditar si SOLO cambiaron columnas de ruido (timestamps + presencia) →
--      mata el flujo del latido de presencia;
--   3) guardar en metadata la lista de columnas cambiadas (`cambios`), para que el
--      Registro de actividad pueda describir qué se editó.
-- Aplica a TODAS las tablas auditadas (el ahorro de ruido y el detalle son generales;
-- las columnas de presencia solo existen en `perfiles`).
--
-- Y se purgan las filas históricas «perfiles:update»: no distinguían qué cambió y
-- en su mayoría son latidos (sin información). Los cambios de rol/verificación se
-- registran APARTE de forma semántica (accion 'cambio_rol'/'cambio_verificacion' vía
-- registrar_auditoria) y se CONSERVAN. Idempotente. Ejecutar tras 0133.
-- ============================================================

create or replace function public.auditar_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  v_cambios text[];
  -- Columnas "ruido": si un UPDATE solo toca estas, no se audita.
  v_ignorar constant text[] := array['actualizado_en','updated_at','creado_en',
                                     'ultima_conexion','estado_presencia'];
begin
  if tg_op = 'UPDATE' then
    -- columnas cuyo valor realmente cambió (OLD vs NEW)
    select array_agg(e.key order by e.key) into v_cambios
    from jsonb_each(to_jsonb(new)) e
    where e.value is distinct from (to_jsonb(old) -> e.key);
    -- nada relevante (solo timestamps/presencia, o nada) → no auditar
    if coalesce(array_length(v_cambios, 1), 0) = 0 or v_cambios <@ v_ignorar then
      return new;
    end if;
  end if;

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
      'perfil_id',       rec->>'perfil_id',
      'cambios',         case when v_cambios is not null then to_jsonb(v_cambios) end
    ))
  );
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

-- Purga del ruido histórico de presencia (filas «perfiles:update» previas, sin
-- información útil). Los cambios de rol/verificación tienen otra `accion` y se conservan.
delete from public.registro_auditoria where accion = 'perfiles:update';
