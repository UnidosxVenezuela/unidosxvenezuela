-- ============================================================
-- 0130 — Registro de actividad más detallado
-- ------------------------------------------------------------
-- Dos arreglos:
--   1) `registrar_auditoria` aceptaba `p_accion` como ENUM `accion_auditoria`. Las
--      acciones nuevas que la app ya intentaba registrar —'verificacion_aprobada',
--      'verificacion_rechazada', 'alta_delegada'— NO estaban en el enum, así que la
--      llamada fallaba en SILENCIO y esas acciones sensibles no quedaban registradas.
--      Se redefine para aceptar TEXTO (accion + entidad), con la traza forzada a
--      auth.uid(); el gate se relaja a «cuenta verificada» (antes solo coordinación),
--      para que también un líder registre sus altas delegadas.
--   2) Se auditan tablas que no tenían traza: Captación (oportunidades), Digitalización
--      (listados_digitalizados, lugares) y movimientos/traspasos de Acopio, reutilizando
--      el trigger genérico y seguro `auditar_cambio()` (usa to_jsonb, captura auth.uid()).
-- Idempotente. Tras 0129.
-- ============================================================

-- 1) registrar_auditoria: parámetros de TEXTO + gate «verificado».
drop function if exists public.registrar_auditoria(public.accion_auditoria, text, jsonb);
create or replace function public.registrar_auditoria(
  p_accion text,
  p_entidad text default 'perfil',
  p_entidad_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Solo cuentas verificadas registran; la traza queda SIEMPRE a nombre de quien llama.
  if not public.es_verificado() then return; end if;
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (
    auth.uid(),
    p_accion,
    coalesce(nullif(p_entidad, ''), 'perfil'),
    p_entidad_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end $$;
revoke all on function public.registrar_auditoria(text, text, text, jsonb) from public;
grant execute on function public.registrar_auditoria(text, text, text, jsonb) to authenticated;

-- 2) Auditar las tablas que faltaban (trigger genérico, captura actor e id).
do $$
declare t text;
begin
  foreach t in array array[
    'oportunidades',            -- Captación de Oportunidades (0129)
    'listados_digitalizados',   -- Digitalización: guardar/verificar/observar
    'lugares',                  -- Digitalización: moderar/verificar lugar
    'movimientos_acopio',       -- Acopio: entradas/salidas/donaciones/ajustes/traspasos
    'solicitudes_traspaso'      -- Acopio: solicitudes de traspaso entre centros
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists aud_%1$s on public.%1$I', t);
      execute format('create trigger aud_%1$s after insert or update or delete on public.%1$I for each row execute function public.auditar_cambio()', t);
    end if;
  end loop;
end $$;
