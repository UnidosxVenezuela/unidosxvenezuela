-- ============================================================
-- 0220 — Semáforo de PASOS por ÍTEM (visible desde todas las áreas)
-- ------------------------------------------------------------
-- ANTES: el semáforo de pasos era POR SOLICITUD. La barra «Paso N de 4» de Logística
--   se derivaba de `solicitudes_insumo.estado` y la de la solicitud de ayuda, de
--   `casos.estado` (`apps/web/lib/flujo.ts` → `apps/web/components/FlujoProgreso.tsx`).
--   Con el desglose por ítem de 0218 eso se quedó corto: una solicitud con cinco ítems
--   avanza a trozos —el agua ya va en ruta, las medicinas siguen sin conseguirse— y con
--   un solo estado agregado no hay forma de decir cuál de los cinco va por dónde. Peor:
--   Redacción y las demás áreas no podían seguir ese avance de ninguna manera.
--
-- AHORA: cada ítem tiene su propio semáforo de pasos, gobernado por una RPC con
--   transiciones explícitas (`avanzar_item`), y ese avance se puede LEER desde cualquier
--   área por una RPC curada (`items_de_caso`).
--
-- ⚠ SON DOS SEMÁFOROS DISTINTOS Y AQUÍ SOLO SE TOCA UNO:
--   · El de VERIFICACIÓN POR CAMPO (🟢🟡🔴, `casos_verificacion_campo`, 0172/0173) NO se
--     toca. `caso_esta_validado()` sigue igual y su campo 'cantidad' SIGUE SIENDO POR
--     CASO («el desglose completo está verificado»). Replicarlo por ítem obligaría a
--     reescribir `CAMPOS_VERIFICACION_BASE/_REQ`, los tres componentes React clonados y
--     `solicitar_cobertura_parcial` (0211) — y además `referente`/`fuente`/`vigencia`/
--     `evidencia` son atributos del CASO, no del ítem.
--   · El de PASOS (el de `FlujoProgreso`) es el que se lleva al ítem. Es lo que se pidió.
--
-- POR QUÉ UNA RPC CURADA Y NO LA TABLA A SECAS: `casos_items` ya tiene lectura para toda
--   cuenta verificada (`citems_select`, 0218), así que Redacción PUEDE leerla. La RPC
--   `items_de_caso` existe igualmente por tres razones: (a) devuelve una forma estable
--   —columnas fijas, `tipo` y `estado` como texto— que 0221 rellenará con `cubierto`/`pct`
--   sin que la interfaz cambie; (b) deja explícito y auditable QUÉ ve una área que no lee
--   `casos` (0180), sin datos de contacto ni PII; (c) es el punto único donde endurecer el
--   gate el día que el desglose deje de ser público para el personal verificado.
--
-- REFRESCO EN VIVO DE REDACCIÓN: por `casos_difusion_senal` (0181), NUNCA por `casos`.
--   Redacción no lee `casos` desde 0180 y el realtime de Supabase entrega la FILA COMPLETA
--   —con `contacto`— a quien pueda leerla: suscribirla a `casos` reabriría exactamente el
--   hueco que cerró 0180. Un trigger sobre `casos_items` sella la tabla-señal (que solo
--   lleva caso_id + estado + fecha) y Redacción refresca su vista curada. Como la señal
--   solo tiene fila para los casos ya relevantes para difusión, tocar un ítem de un caso
--   que aún no es difundible no crea ni filtra nada.
--
-- AUDITORÍA: no la escribe esta migración. `trg_auditar_cambio_item` (0219) es AFTER
--   UPDATE sobre `casos_items` y ya diffea `estado`, así que cada avance deja la fila fina
--   en `casos_items_historial` («Estado: en_ruta → cumplido») MÁS un asiento 'item_editado'
--   con entidad='casos' —el filtro del «Historial de cambios» del detalle—. 0219 lo pide
--   explícitamente en su cabecera; repetirlo aquí pintaría dos renglones por un solo clic.
--
-- ENUM-SAFETY: cero valores de enum nuevos. Los estados del ítem son los SEIS que ya
--   define el CHECK de `casos_items.estado` (0218) — TEXT + CHECK a propósito (precedentes
--   `tipo_difusion` 0189, `punto_tipo` 0145, `casos_derivaciones.area` 0177).
--
-- POR QUÉ LAS TRANSICIONES VIVEN EN LA RPC Y NO EN UN TRIGGER: `casos_items` no tiene
--   policy de escritura (0218), así que la única puerta es una función SECURITY DEFINER.
--   Un trigger BEFORE UPDATE que rechazara transiciones bloquearía a 0221, que sube el
--   ítem a 'cumplido' automáticamente al llegar al 100 % de cobertura — el mismo choque
--   que `auditar_estado_insumo` (0210) provoca hoy en `solicitudes_insumo`. Se evita de
--   raíz dejando la regla en la puerta, no en la tabla.
--
-- Idempotente. Ejecutar tras 0219.
-- ============================================================

-- ═══ (1) Catálogos del semáforo por ítem ═══
-- Espejo EXACTO del CHECK de `casos_items.estado` (0218). En plpgsql, como el resto de
-- funciones-catálogo del repo (`rol_de_grupo`, `clave_de_rol`, `roles_area_derivacion`):
-- una función `language sql` con literales de enum arrastra el problema del cast eager,
-- y aunque aquí sean TEXT se mantiene el molde de la casa por coherencia.
create or replace function public.estados_item()
returns text[] language plpgsql immutable as $$
begin
  return array['pendiente', 'en_gestion', 'en_ruta', 'cumplido', 'no_disponible', 'cancelado'];
end $$;

revoke all on function public.estados_item() from public;
grant execute on function public.estados_item() to authenticated;

comment on function public.estados_item() is
  'Los SEIS estados de un ítem (0218), espejo del CHECK de casos_items.estado. Su espejo en la app es ESTADOS_ITEM (apps/web/lib/constantes.ts). No se reutiliza ESTADOS_INSUMO: ese array solo lista cuatro y por eso las tarjetas «no se pudo cubrir» desaparecen del tablero de /insumos.';

-- Los PASOS del camino feliz: lo que pinta la barra «Paso N de 4». 'no_disponible' y
-- 'cancelado' NO son pasos — son salidas del flujo (la barra los muestra en rojo, igual
-- que `pasoDeCaso` hace con 'falso'/'desestimado').
create or replace function public.pasos_item()
returns text[] language plpgsql immutable as $$
begin
  return array['pendiente', 'en_gestion', 'en_ruta', 'cumplido'];
end $$;

revoke all on function public.pasos_item() from public;
grant execute on function public.pasos_item() to authenticated;

comment on function public.pasos_item() is
  'Camino feliz del ítem en 4 pasos (0220), para la barra de progreso. Espejo de PASOS_ITEM en apps/web/lib/flujo.ts. Los estados no_disponible/cancelado quedan FUERA a propósito: son salida del flujo, no un paso más.';

-- A dónde puede ir un ítem desde donde está. Se permiten saltos hacia adelante (Logística
-- consigue el ítem de una vez y lo cierra) y UN paso atrás (corregir un clic), pero no
-- resucitar lo que ya está cerrado: 'cumplido' y 'cancelado' son terminales y solo un
-- administrador los reabre — mismo criterio que `auditar_estado_insumo` (0210) aplica a
-- 'entregado'/'cancelado' en las solicitudes de insumo.
create or replace function public.transiciones_item(p_desde text)
returns text[] language plpgsql immutable as $$
begin
  return case lower(coalesce(nullif(btrim(coalesce(p_desde, '')), ''), 'pendiente'))
    when 'pendiente'     then array['en_gestion', 'en_ruta', 'cumplido', 'no_disponible', 'cancelado']
    when 'en_gestion'    then array['en_ruta', 'cumplido', 'pendiente', 'no_disponible', 'cancelado']
    when 'en_ruta'       then array['cumplido', 'en_gestion', 'no_disponible', 'cancelado']
    -- «No se pudo cubrir» no es el final del camino: se puede reintentar (mismo botón
    -- «Reactivar» que ya tiene la solicitud de insumo en /insumos/[id]).
    when 'no_disponible' then array['pendiente', 'en_gestion', 'cancelado']
    else array[]::text[]   -- 'cumplido' y 'cancelado': terminales (solo admin)
  end;
end $$;

revoke all on function public.transiciones_item(text) from public;
grant execute on function public.transiciones_item(text) to authenticated;

comment on function public.transiciones_item(text) is
  'Transiciones válidas del semáforo por ítem (0220). Fuente de verdad: avanzar_item la consulta en cada llamada. Su espejo en la app (TRANSICIONES_ITEM, constantes.ts) solo decide qué botones se pintan.';

-- ═══ (2) avanzar_item — la ÚNICA puerta para mover el semáforo de un ítem ═══
-- Gate: Logística (que incluye a su mando desde 0214) o la administración. Recopilación y
-- Verificación editan el CONTENIDO del desglose (`guardar_item_caso`, 0218) pero no su
-- avance operativo: conseguir el insumo es trabajo de Logística.
create or replace function public.avanzar_item(p_item uuid, p_estado text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_estado text := lower(nullif(btrim(coalesce(p_estado, '')), ''));
  v_id     uuid;
  v_desde  text;
begin
  if not (public.puede_logistica() or public.es_admin()) then
    raise exception 'Solo Logística puede mover el avance de un ítem.' using errcode = '42501';
  end if;
  if p_item is null then
    raise exception 'Falta el ítem.' using errcode = '22023';
  end if;
  if v_estado is null then
    raise exception 'Falta el estado al que se quiere avanzar.' using errcode = '22023';
  end if;
  if not (v_estado = any(public.estados_item())) then
    raise exception 'Estado de ítem no válido: %', v_estado using errcode = '22023';
  end if;

  select i.id, i.estado into v_id, v_desde
    from public.casos_items i where i.id = p_item;
  if v_id is null then
    raise exception 'Ítem no encontrado.' using errcode = 'P0002';
  end if;

  -- Idempotente: repetir el mismo estado (doble clic, reintento del formulario) no es un
  -- error ni deja asiento duplicado.
  if v_estado = v_desde then
    return v_desde;
  end if;

  if not public.es_admin() then
    if v_desde in ('cumplido', 'cancelado') then
      raise exception 'El ítem ya está cerrado como «%»; solo un administrador puede reabrirlo.', v_desde
        using errcode = '42501';
    end if;
    if not (v_estado = any(public.transiciones_item(v_desde))) then
      raise exception 'No se puede pasar el ítem de «%» a «%».', v_desde, v_estado using errcode = '22023';
    end if;
  end if;

  -- AUDITORÍA — la escribe el trigger, no esta función. `trg_auditar_cambio_item` (0219)
  -- es AFTER UPDATE sobre `casos_items` y diffea `estado`, así que este UPDATE deja solo
  -- las DOS trazas correctas: la fila fina en `casos_items_historial` («Estado: en_ruta →
  -- cumplido», con actor y fecha) y UN asiento 'item_editado' con entidad='casos' —el
  -- filtro que usa el «Historial de cambios» del detalle—. 0219 lo pide por escrito
  -- («NOTA PARA 0220/0221: … No repitáis el asiento con entidad='casos' para el mismo
  -- cambio: sería una entrada duplicada»), y con razón: un `registrar_auditoria` aquí
  -- pintaría DOS renglones por un solo clic, y el slug nuevo ni siquiera estaría en los
  -- mapas de `admin/logs/page.tsx` ni de `casos/DetalleCaso.tsx`.
  update public.casos_items
     set estado = v_estado, actualizado_en = now()
   where id = p_item;

  return v_estado;
end $$;

revoke all on function public.avanzar_item(uuid, text) from public;
grant execute on function public.avanzar_item(uuid, text) to authenticated;

comment on function public.avanzar_item(uuid, text) is
  'Mueve el semáforo de PASOS de un ítem (0220). Gate: puede_logistica() or es_admin(). Valida la transición contra transiciones_item(); ''cumplido'' y ''cancelado'' son terminales salvo para admin. Idempotente si el estado no cambia. La auditoría la deja el trigger trg_auditar_cambio_item (0219): fila fina en casos_items_historial + UN asiento ''item_editado'' con entidad=''casos'' — esta función NO lo repite, para no duplicar el renglón del «Historial de cambios».';

-- ═══ (3) items_de_caso — la vista CURADA del desglose para todas las áreas ═══
-- Es lo que hace visible el avance por ítem a Redacción, que NO lee `casos` desde 0180.
-- Sin datos de contacto ni PII: un ítem solo dice qué hace falta, cuánto y por dónde va.
-- Gate `es_verificado()` con retorno VACÍO (no excepción), igual que `seguimiento_casos()`
-- (0209): la página degrada sin romperse. La exposición es exactamente la misma que ya
-- concede `citems_select` (0218) sobre la tabla, así que no abre nada nuevo.
--
-- `cubierto` y `pct` van en la firma DESDE YA aunque hoy devuelvan 0: los rellena 0221
-- (aportes por ítem) con un `create or replace` que no cambia la firma, y así ninguna
-- pantalla tiene que tocarse cuando llegue. Hasta entonces la interfaz debe pintar el
-- avance por `estado`, nunca por `pct`.
drop function if exists public.items_de_caso(uuid);
create function public.items_de_caso(p_caso uuid)
returns table (
  id          uuid,
  orden       int,
  tipo        text,
  descripcion text,
  cantidad    numeric,
  unidad      text,
  estado      text,
  cubierto    numeric,
  pct         numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_caso is null or not public.es_verificado() then
    return;
  end if;

  return query
    select i.id,
           i.orden,
           i.tipo::text,
           i.descripcion,
           i.cantidad,
           i.unidad,
           i.estado,
           0::numeric as cubierto,   -- 0221: suma de casos_item_aportes
           0::numeric as pct         -- 0221: cubierto / cantidad * 100
      from public.casos_items i
     where i.caso_id = p_caso
     order by i.orden, i.creado_en;
end $$;

revoke all on function public.items_de_caso(uuid) from public;
grant execute on function public.items_de_caso(uuid) to authenticated;

comment on function public.items_de_caso(uuid) is
  'Desglose por ítem CURADO y cross-área (0220): id, orden, tipo, descripción, cantidad, unidad, estado + cubierto/pct (que rellena 0221; hoy 0). Sin contacto ni PII. Gate es_verificado() con retorno vacío. Es la vía por la que Redacción —que no lee `casos` desde 0180— sigue el avance de cada ítem.';

-- ═══ (4) Realtime de Redacción: por la tabla-SEÑAL, nunca por `casos` ═══
-- Al moverse un ítem, se sella `casos_difusion_senal` para que Redacción refresque su
-- vista curada. Solo se sellan casos que YA tienen señal (es decir, que ya son relevantes
-- para difusión): si no la tienen, el update no afecta ninguna fila y no se crea nada.
-- Nunca viaja contacto por el canal: la señal solo lleva caso_id + estado + fecha (0181).
create or replace function public.tocar_senal_difusion_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_caso uuid;
begin
  if tg_op = 'DELETE' then
    v_caso := old.caso_id;
  else
    v_caso := new.caso_id;
  end if;

  -- En UPDATE, solo si cambió algo que Redacción llegue a ver (evita tormentas de
  -- refresco por toques internos como `actualizado_en`).
  if tg_op = 'UPDATE'
     and new.estado      is not distinct from old.estado
     and new.descripcion is not distinct from old.descripcion
     and new.cantidad    is not distinct from old.cantidad
     and new.unidad      is not distinct from old.unidad
     and new.tipo        is not distinct from old.tipo
     and new.orden       is not distinct from old.orden
     and new.caso_id     is not distinct from old.caso_id then
    return null;
  end if;

  update public.casos_difusion_senal set actualizado_en = now() where caso_id = v_caso;

  if tg_op = 'UPDATE' and old.caso_id is distinct from new.caso_id then
    update public.casos_difusion_senal set actualizado_en = now() where caso_id = old.caso_id;
  end if;

  return null;
end $$;

drop trigger if exists trg_senal_difusion_items on public.casos_items;
create trigger trg_senal_difusion_items
  after insert or update or delete on public.casos_items
  for each row execute function public.tocar_senal_difusion_items();

comment on function public.tocar_senal_difusion_items() is
  'Sella casos_difusion_senal (0181) cuando cambia el desglose por ítem (0220), para que Redacción reciba el avance EN VIVO sin suscribirse a `casos` —que le entregaría la fila completa con el contacto por el WebSocket—. Solo toca casos que ya tienen señal (ya son difundibles): nunca crea una.';
