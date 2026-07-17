-- ============================================================
-- 0173 — Candado de verificación + campos estructurados de la solicitud
-- ------------------------------------------------------------
-- El requerimiento (Pasos 4, 5 y 6) pide dos cosas que hoy faltan:
--
--  (A) LLENADO ORDENADO POR BLOQUES. La solicitud debe capturar datos en campos
--      estructurados —no todo en la descripción libre—: ubicación administrativa
--      separada (estado/municipio/parroquia/sector/dirección), vigencia (¿sigue
--      vigente? + última confirmación), rol del referente y tipo de fuente. Se
--      agregan de forma ADITIVA (nullable): no rompen filas ni flujos existentes.
--
--  (B) EL CANDADO DE VERIFICACIÓN (Paso 6.6 / 9.2 — la regla clave del documento).
--      Hoy el semáforo por campo (0172) es solo VISUAL: nada impide confirmar/derivar
--      un caso con campos sin revisar o en amarillo. Esta migración lo hace REAL:
--      un caso (que no sea «Desaparecidos») NO puede entrar a `confirmado` si no tiene
--      TODOS sus campos de verificación en 🟢 `verificado`. Como la derivación a
--      Logística/Redacción exige `confirmado`, el candado en la confirmación cierra
--      todo el circuito con un único punto de control.
--
--      «Desaparecidos» queda EXENTO: tiene su propio flujo (Grupo de Búsqueda con su
--      2ª verificación), y la auto-derivación (0156) ya lo excluye.
--
-- Nota de despliegue: al aplicar esta migración, confirmar una solicitud pasa a exigir
-- que Verificación marque en verde todos los campos del semáforo. Es el comportamiento
-- que pide el documento. Idempotente. Ejecutar tras 0172.
-- ============================================================

-- ═══ (A) Campos estructurados (aditivos, nullable) ═══
-- Identificación
alter table public.casos add column if not exists referente_rol text;
-- Fuente
alter table public.casos add column if not exists fuente_tipo text;
-- Ubicación administrativa (separada del pin lat/lng, que se conserva)
alter table public.casos add column if not exists ubicacion_estado text;
alter table public.casos add column if not exists ubicacion_municipio text;
alter table public.casos add column if not exists ubicacion_parroquia text;
alter table public.casos add column if not exists ubicacion_sector text;
alter table public.casos add column if not exists ubicacion_direccion text;
-- Vigencia
alter table public.casos add column if not exists sigue_vigente text;
alter table public.casos add column if not exists ultima_confirmacion timestamptz;

-- ¿sigue vigente? solo acepta sí/no/pendiente (o vacío). Idempotente: se recrea.
alter table public.casos drop constraint if exists chk_casos_sigue_vigente;
alter table public.casos add constraint chk_casos_sigue_vigente
  check (sigue_vigente is null or sigue_vigente in ('si', 'no', 'pendiente'));

-- ═══ (B1) ¿Está el caso completamente verificado? ═══
-- Devuelve true solo si CADA campo requerido tiene una fila en verde (`verificado`).
-- El conjunto de campos DEBE coincidir con la app (CAMPOS_VERIFICACION_BASE/_REQ en
-- apps/web/lib/constantes.ts): base siempre; ubicación y cantidad solo si es un
-- requerimiento (solicitud de ayuda con ubicación). Si a un campo le falta su fila,
-- no cuenta como verde → no valida. STABLE + SECURITY DEFINER (lo llama el trigger).
create or replace function public.caso_esta_validado(p_caso uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_es_req boolean;
  v_requeridos text[] := array['referente', 'descripcion', 'fuente', 'vigencia', 'evidencia'];
  v_verdes int;
begin
  select es_requerimiento into v_es_req from public.casos where id = p_caso;
  if not found then return false; end if;

  if coalesce(v_es_req, false) then
    v_requeridos := v_requeridos || array['ubicacion', 'cantidad'];
  end if;

  select count(*) into v_verdes
  from public.casos_verificacion_campo v
  where v.caso_id = p_caso
    and v.campo = any(v_requeridos)
    and v.estado = 'verificado';

  return v_verdes >= array_length(v_requeridos, 1);
end $$;

revoke all on function public.caso_esta_validado(uuid) from public;
grant execute on function public.caso_esta_validado(uuid) to authenticated;

-- ═══ (B2) El candado: impedir confirmar sin todo en verde ═══
-- BEFORE UPDATE OF estado: si el caso ENTRA a 'confirmado' (desde otro estado) y no
-- está validado, aborta el UPDATE. Al abortar en BEFORE, el AFTER de auto-derivación
-- (0156) no llega a correr, así que nada se deriva sin verificación. «Desaparecidos»
-- exento (flujo propio). Enum-safe (`::text`).
create or replace function public.gate_confirmacion_caso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado::text is distinct from 'confirmado' then return new; end if;         -- no va a confirmado
  if old.estado::text is not distinct from 'confirmado' then return new; end if;      -- ya estaba confirmado
  if new.categoria is not distinct from 'Desaparecidos' then return new; end if;      -- flujo de Búsqueda

  if not public.caso_esta_validado(new.id) then
    raise exception 'No se puede confirmar la solicitud: faltan campos por verificar. Marca en verde 🟢 todos los datos del semáforo antes de confirmar.'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_gate_confirmacion_caso on public.casos;
create trigger trg_gate_confirmacion_caso
  before update of estado on public.casos
  for each row execute function public.gate_confirmacion_caso();
