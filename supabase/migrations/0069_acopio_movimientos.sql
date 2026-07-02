-- ============================================================
-- 0069 — Movimientos de inventario, traspasos, donaciones y rol voluntario
-- ------------------------------------------------------------
-- Añade una BITÁCORA de inventario (movimientos_acopio) que registra las
-- operaciones deliberadas: entradas, donaciones, salidas/consumo y traspasos
-- entre centros. Con eso se cubre:
--   · Traspasos entre centros CON registro (dos asientos ligados).
--   · Donaciones → inventario (entrada marcada como donación, con donante).
--   · Un rol VOLUNTARIO por centro que SOLO SUMA (registra entradas/donaciones,
--     nunca descuenta ni borra).
-- Idempotente. La RLS sigue siendo la fuente de verdad.
-- ============================================================

-- ── Voluntarios de acopio (solo suman) ──
-- Un voluntario asignado a un centro puede registrar entradas/donaciones desde
-- el teléfono (QR), pero NO puede descontar, fijar conteos ni eliminar.
create table if not exists public.acopio_voluntarios (
  punto_id     uuid not null references public.puntos_acopio (id) on delete cascade,
  perfil_id    uuid not null references public.perfiles (id) on delete cascade,
  asignado_por uuid references public.perfiles (id),
  creado_en    timestamptz not null default now(),
  primary key (punto_id, perfil_id)
);
create index if not exists idx_acopio_vol_perfil on public.acopio_voluntarios (perfil_id);

alter table public.acopio_voluntarios enable row level security;
-- Ver: los gestores del centro y el propio voluntario.
drop policy if exists av_select on public.acopio_voluntarios;
create policy av_select on public.acopio_voluntarios for select to authenticated
  using (public.puede_gestionar_acopio(punto_id) or perfil_id = auth.uid());
-- Asignar/quitar voluntarios: solo el admin (igual criterio que responsables).
drop policy if exists av_insert on public.acopio_voluntarios;
create policy av_insert on public.acopio_voluntarios for insert to authenticated
  with check (public.es_admin());
drop policy if exists av_delete on public.acopio_voluntarios;
create policy av_delete on public.acopio_voluntarios for delete to authenticated
  using (public.es_admin());

-- ¿Puede SUMAR al inventario de ESTE centro? (gestor o voluntario asignado)
create or replace function public.puede_sumar_acopio(p_punto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.puede_gestionar_acopio(p_punto)
     or exists (select 1 from public.acopio_voluntarios av
                 where av.punto_id = p_punto and av.perfil_id = auth.uid());
$$;
grant execute on function public.puede_sumar_acopio(uuid) to authenticated;

-- ── Bitácora de movimientos del inventario ──
create table if not exists public.movimientos_acopio (
  id                   uuid primary key default gen_random_uuid(),
  punto_id             uuid not null references public.puntos_acopio (id) on delete cascade,
  item_id              uuid references public.inventario_acopio (id) on delete set null,
  producto             text not null,
  tipo                 text not null check (tipo in
                         ('entrada','donacion','salida','ajuste','traspaso_entrada','traspaso_salida')),
  cantidad             numeric not null default 0 check (cantidad >= 0),  -- magnitud del movimiento
  unidad               text,
  donante              text,     -- para donaciones
  relacionado_punto_id uuid references public.puntos_acopio (id) on delete set null, -- otro centro en un traspaso
  nota                 text,
  actor_id             uuid references public.perfiles (id),
  creado_en            timestamptz not null default now()
);
create index if not exists idx_mov_punto on public.movimientos_acopio (punto_id, creado_en desc);

alter table public.movimientos_acopio enable row level security;
-- Ver la bitácora: quien puede sumar en el centro (gestores + voluntarios).
drop policy if exists mov_select on public.movimientos_acopio;
create policy mov_select on public.movimientos_acopio for select to authenticated
  using (public.puede_sumar_acopio(punto_id));
-- Registrar movimientos: quien puede sumar, y siempre a nombre propio.
drop policy if exists mov_insert on public.movimientos_acopio;
create policy mov_insert on public.movimientos_acopio for insert to authenticated
  with check (public.puede_sumar_acopio(punto_id) and actor_id = auth.uid());
-- Append-only: sin update/delete (la bitácora no se altera).

-- ── RPC: sumar stock (entrada o donación) ──
-- La usan los voluntarios (que no pueden escribir el inventario directamente) y
-- también unifica el alta de los gestores. Crea el producto si no existe.
create or replace function public.sumar_stock(
  p_punto uuid, p_producto text, p_cantidad numeric,
  p_categoria text default null, p_unidad text default null, p_codigo text default null,
  p_tipo text default 'entrada', p_donante text default null, p_nota text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_item uuid;
  v_cant numeric := greatest(coalesce(p_cantidad, 0), 0);
  v_tipo text := case when p_tipo = 'donacion' then 'donacion' else 'entrada' end;
  v_prod text := btrim(p_producto);
begin
  if not public.puede_sumar_acopio(p_punto) then
    raise exception 'No tienes permiso para sumar al inventario de este centro.' using errcode = '42501';
  end if;
  if coalesce(v_prod, '') = '' then raise exception 'Indica el producto.'; end if;

  select id into v_item from public.inventario_acopio
    where punto_id = p_punto and producto = v_prod for update;
  if v_item is null then
    insert into public.inventario_acopio (punto_id, producto, categoria, unidad, cantidad, codigo, actualizado_por)
    values (p_punto, v_prod, p_categoria, coalesce(nullif(p_unidad, ''), 'unidades'), v_cant, p_codigo, auth.uid())
    returning id into v_item;
  else
    update public.inventario_acopio
       set cantidad = cantidad + v_cant,
           categoria = coalesce(nullif(p_categoria, ''), categoria),
           unidad    = coalesce(nullif(p_unidad, ''), unidad),
           codigo    = coalesce(nullif(p_codigo, ''), codigo),
           actualizado_por = auth.uid(), actualizado_en = now()
     where id = v_item;
  end if;

  insert into public.movimientos_acopio (punto_id, item_id, producto, tipo, cantidad, unidad, donante, nota, actor_id)
  values (p_punto, v_item, v_prod, v_tipo, v_cant, nullif(p_unidad, ''), nullif(p_donante, ''), nullif(p_nota, ''), auth.uid());
end; $$;
grant execute on function public.sumar_stock(uuid, text, numeric, text, text, text, text, text, text) to authenticated;

-- ── RPC: traspasar stock de un centro a otro ──
-- Descuenta del origen, suma al destino y deja DOS asientos ligados. Requiere
-- poder gestionar el ORIGEN (de ahí sale el stock).
create or replace function public.traspasar_stock(
  p_origen uuid, p_destino uuid, p_producto text, p_cantidad numeric, p_nota text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_src record;
  v_dst uuid;
  v_cant numeric := greatest(coalesce(p_cantidad, 0), 0);
  v_prod text := btrim(p_producto);
begin
  if p_origen = p_destino then raise exception 'El origen y el destino deben ser distintos.'; end if;
  if not public.puede_gestionar_acopio(p_origen) then
    raise exception 'No tienes permiso para mover stock de este centro.' using errcode = '42501';
  end if;
  if v_cant <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;

  select id, cantidad, categoria, unidad, codigo into v_src
    from public.inventario_acopio where punto_id = p_origen and producto = v_prod for update;
  if v_src.id is null then raise exception 'El producto no existe en el centro de origen.'; end if;
  if v_src.cantidad < v_cant then
    raise exception 'No hay suficiente stock (disponible: %).', v_src.cantidad;
  end if;

  update public.inventario_acopio
     set cantidad = cantidad - v_cant, actualizado_por = auth.uid(), actualizado_en = now()
   where id = v_src.id;

  select id into v_dst from public.inventario_acopio where punto_id = p_destino and producto = v_prod for update;
  if v_dst is null then
    insert into public.inventario_acopio (punto_id, producto, categoria, unidad, cantidad, codigo, actualizado_por)
    values (p_destino, v_prod, v_src.categoria, v_src.unidad, v_cant, v_src.codigo, auth.uid())
    returning id into v_dst;
  else
    update public.inventario_acopio
       set cantidad = cantidad + v_cant, actualizado_por = auth.uid(), actualizado_en = now()
     where id = v_dst;
  end if;

  insert into public.movimientos_acopio
    (punto_id, item_id, producto, tipo, cantidad, unidad, relacionado_punto_id, nota, actor_id)
  values
    (p_origen,  v_src.id, v_prod, 'traspaso_salida',  v_cant, v_src.unidad, p_destino, nullif(p_nota, ''), auth.uid()),
    (p_destino, v_dst,    v_prod, 'traspaso_entrada', v_cant, v_src.unidad, p_origen,  nullif(p_nota, ''), auth.uid());
end; $$;
grant execute on function public.traspasar_stock(uuid, uuid, text, numeric, text) to authenticated;

-- Realtime para la bitácora (se actualiza en vivo entre teléfonos).
do $$ begin alter publication supabase_realtime add table public.movimientos_acopio; exception when duplicate_object then null; end $$;
