-- ============================================================
-- 0184 — Ledger fiel del inventario: RPCs atómicas para salida / ajuste / fijar / eliminar
-- ------------------------------------------------------------
-- La bitácora del inventario (movimientos_acopio, 0069) ya cubre entradas,
-- donaciones y traspasos con RPCs atómicas (sumar_stock / traspasar_stock: bloquean
-- la fila con FOR UPDATE y escriben el asiento en la MISMA transacción). Pero el resto
-- de operaciones seguían haciéndose con UPDATE directo desde la app:
--   · registrarSalida  → leía la cantidad en JS y la reescribía (carrera «lost update»
--     con traspasos/otras salidas → sobre-descuento) y escribía el asiento por separado.
--   · ajustarCantidad  → carrera igual y, encima, NO dejaba asiento (el ledger mentía).
--   · fijarCantidad    → conteo físico sin asiento del ajuste (delta) aplicado.
--   · eliminarProducto → borraba stock sin dejar rastro en la bitácora.
--
-- Este parche añade RPCs `security definer` que hacen lo mismo que sumar/traspasar:
-- BLOQUEAN la fila (FOR UPDATE), aplican el cambio con clamp a >= 0 y escriben el
-- asiento correspondiente en movimientos_acopio, todo atómico. Así el ledger queda
-- FIEL: toda variación de `cantidad` deja su asiento y no hay carreras. La app se
-- reconecta a estas RPCs. Permiso: gestionar el centro (no los voluntarios, que solo
-- suman). Idempotente. Tras 0183.
-- ============================================================

-- ── Salida / consumo: descuenta (clamp a lo disponible) y deja asiento 'salida' ──
create or replace function public.registrar_salida(
  p_punto uuid, p_item uuid, p_cantidad numeric, p_motivo text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_it record;
  v_pedida numeric := greatest(coalesce(p_cantidad, 0), 0);
  v_salida numeric;
begin
  if not public.puede_gestionar_acopio(p_punto) then
    raise exception 'No tienes permiso para mover stock de este centro.' using errcode = '42501';
  end if;
  if v_pedida <= 0 then raise exception 'Indica cuánto sale.'; end if;

  select id, producto, cantidad, unidad into v_it
    from public.inventario_acopio where id = p_item and punto_id = p_punto for update;
  if v_it.id is null then raise exception 'Producto no encontrado en este centro.' using errcode = 'P0002'; end if;

  v_salida := least(v_pedida, v_it.cantidad);                 -- no se puede sacar lo que no hay
  if v_salida <= 0 then raise exception 'No hay stock disponible para descontar.'; end if;

  update public.inventario_acopio
     set cantidad = cantidad - v_salida, actualizado_por = auth.uid(), actualizado_en = now()
   where id = v_it.id;

  insert into public.movimientos_acopio (punto_id, item_id, producto, tipo, cantidad, unidad, nota, actor_id)
  values (p_punto, v_it.id, v_it.producto, 'salida', v_salida, v_it.unidad, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());

  return v_salida;
end; $$;
grant execute on function public.registrar_salida(uuid, uuid, numeric, text) to authenticated;

-- ── Ajuste por delta (+/-): corrección rápida; clamp a >= 0 y asiento 'ajuste' ──
create or replace function public.ajustar_stock(
  p_punto uuid, p_item uuid, p_delta numeric, p_nota text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_it record;
  v_delta numeric := coalesce(p_delta, 0);
  v_nueva numeric;
  v_real numeric;
begin
  if not public.puede_gestionar_acopio(p_punto) then
    raise exception 'No tienes permiso para ajustar el stock de este centro.' using errcode = '42501';
  end if;
  if v_delta = 0 then raise exception 'Indica el ajuste (positivo o negativo).'; end if;

  select id, producto, cantidad, unidad into v_it
    from public.inventario_acopio where id = p_item and punto_id = p_punto for update;
  if v_it.id is null then raise exception 'Producto no encontrado en este centro.' using errcode = 'P0002'; end if;

  v_nueva := greatest(v_it.cantidad + v_delta, 0);
  v_real  := v_nueva - v_it.cantidad;                          -- delta realmente aplicado (tras clamp)
  if v_real = 0 then return v_it.cantidad; end if;             -- sin cambios (ya estaba en 0 y se bajaba)

  update public.inventario_acopio
     set cantidad = v_nueva, actualizado_por = auth.uid(), actualizado_en = now()
   where id = v_it.id;

  insert into public.movimientos_acopio (punto_id, item_id, producto, tipo, cantidad, unidad, nota, actor_id)
  values (p_punto, v_it.id, v_it.producto, 'ajuste', abs(v_real), v_it.unidad,
          left(btrim(coalesce(p_nota || ' · ', '') || 'ajuste ' || v_it.cantidad || ' → ' || v_nueva), 300), auth.uid());

  return v_nueva;
end; $$;
grant execute on function public.ajustar_stock(uuid, uuid, numeric, text) to authenticated;

-- ── Fijar cantidad exacta (conteo físico): asiento 'ajuste' con el delta corregido ──
create or replace function public.fijar_stock(
  p_punto uuid, p_item uuid, p_cantidad numeric, p_nota text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_it record;
  v_nueva numeric := greatest(coalesce(p_cantidad, 0), 0);
  v_real numeric;
begin
  if not public.puede_gestionar_acopio(p_punto) then
    raise exception 'No tienes permiso para gestionar el stock de este centro.' using errcode = '42501';
  end if;

  select id, producto, cantidad, unidad into v_it
    from public.inventario_acopio where id = p_item and punto_id = p_punto for update;
  if v_it.id is null then raise exception 'Producto no encontrado en este centro.' using errcode = 'P0002'; end if;

  v_real := v_nueva - v_it.cantidad;
  if v_real = 0 then return v_nueva; end if;                   -- el conteo coincide: nada que registrar

  update public.inventario_acopio
     set cantidad = v_nueva, actualizado_por = auth.uid(), actualizado_en = now()
   where id = v_it.id;

  insert into public.movimientos_acopio (punto_id, item_id, producto, tipo, cantidad, unidad, nota, actor_id)
  values (p_punto, v_it.id, v_it.producto, 'ajuste', abs(v_real), v_it.unidad,
          left(btrim(coalesce(p_nota || ' · ', '') || 'conteo físico ' || v_it.cantidad || ' → ' || v_nueva), 300), auth.uid());

  return v_nueva;
end; $$;
grant execute on function public.fijar_stock(uuid, uuid, numeric, text) to authenticated;

-- ── Eliminar un producto dejando rastro en la bitácora (si tenía stock) ──
-- item_id en movimientos_acopio es `on delete set null`: el asiento se inserta ANTES
-- del delete y sobrevive (con producto en texto) aunque el item desaparezca.
create or replace function public.eliminar_producto_acopio(
  p_punto uuid, p_item uuid, p_nota text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_it record;
begin
  if not public.puede_gestionar_acopio(p_punto) then
    raise exception 'No tienes permiso para eliminar productos de este centro.' using errcode = '42501';
  end if;

  select id, producto, cantidad, unidad into v_it
    from public.inventario_acopio where id = p_item and punto_id = p_punto for update;
  if v_it.id is null then raise exception 'Producto no encontrado en este centro.' using errcode = 'P0002'; end if;

  if v_it.cantidad > 0 then
    insert into public.movimientos_acopio (punto_id, item_id, producto, tipo, cantidad, unidad, nota, actor_id)
    values (p_punto, v_it.id, v_it.producto, 'ajuste', v_it.cantidad, v_it.unidad,
            left(btrim(coalesce(p_nota || ' · ', '') || 'producto eliminado (baja de ' || v_it.cantidad || ')'), 300), auth.uid());
  end if;

  delete from public.inventario_acopio where id = v_it.id;
end; $$;
grant execute on function public.eliminar_producto_acopio(uuid, uuid, text) to authenticated;
