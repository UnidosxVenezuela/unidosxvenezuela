-- ============================================================
-- 0229 · El desglose se puede tocar en CUALQUIER fase
--
-- Lo que pide la organización: poder AGREGAR, QUITAR y MODIFICAR ítems en
-- cualquier momento de la gestión de Logística —porque las necesidades cambian
-- sobre la marcha— y poder DESGLOSAR solicitudes anteriores al ítem, que se
-- manejaban con un texto libre («50 cajas de agua»).
--
-- LO QUE YA FUNCIONABA, y por eso esta migración es pequeña:
--   `guardar_item_caso` / `eliminar_item_caso` / `reordenar_items_caso` (0218,
--   0219) NO tienen ninguna puerta por estado. Su único gate es
--   `puede_gestionar_items_caso()`. Se puede editar el desglose de un caso
--   entregado, cancelado o de uno de hace tres meses sin ítems. La base nunca
--   fue el problema: lo era la interfaz, que solo pintaba el editor cuando
--   `casos.es_requerimiento` era cierto (y nace en false desde 0112).
--
-- LO QUE SÍ ROMPÍA — la trampa que arregla esta migración:
--   Desde 0222 la derivación es SELECTIVA: `casos_derivacion_items` dice qué
--   ítems se mandaron a cada área, y `items_de_caso_area` filtra por esa lista.
--   Un ítem NUEVO no está en ninguna selección, así que en un caso con
--   derivación selectiva Logística lo agregaba… y desaparecía de su propia
--   pantalla al recargar. El trabajo se hacía y no se veía: exactamente el modo
--   de fallo silencioso que este repositorio persigue.
--
--   Arreglo: al INSERTAR un ítem, si el caso ya tiene derivaciones CON selección
--   explícita, el ítem se engancha a la derivación del ÁREA DE QUIEN LO CREA. Si
--   lo agrega Logística, Logística lo ve. Si lo agrega Recopilación o
--   Verificación —que no operan un área de derivación— el ítem queda SIN
--   REPARTIR, que es lo correcto: repartir es trabajo de Verificación al derivar,
--   y para eso está `items_sin_repartir()` de más abajo.
--
--   No se engancha a TODAS las derivaciones a propósito: mandarle a Redacción un
--   ítem de medicinas porque Logística añadió uno de agua sería peor que el bug.
--
-- QUÉ NO TOCA ESTA MIGRACIÓN, y conviene dejarlo escrito:
--
--   · El blindaje `app.items_ok` (0218). Editar un ítem NO reabre la
--     verificación del caso. Es una decisión explícita de la organización:
--     «Logística trabaja directamente con datos verificados, así que no hay
--     problema en que estos sean modificados». Sin ese bypass, cada cambio de
--     Logística dejaría el caso fuera de Validado y por tanto no derivable
--     (0177) ni confirmable (0173), en bucle.
--
--   · `eliminar_item_caso`. Sigue siendo un DELETE duro, y debe seguir
--     existiendo para el error de tecleo recién cometido. Pero el borrado
--     CASCADEA a `casos_items_historial` (0219), `casos_item_aportes` (0221) y
--     `casos_derivacion_items` (0222): borrar un ítem con 4 de 5 colchones ya
--     entregados HACE DESAPARECER esas cuatro entregas y cambia la cobertura de
--     la reportería hacia atrás. Por eso «quitar» un ítem con algo registrado no
--     se borra: se CANCELA. El estado `cancelado` ya existe en `estados_item()`
--     (0220) y `avanzar_item` ya lo trata como terminal. La interfaz es la que
--     dirige a la salida correcta; aquí solo se añade el dato que necesita para
--     decidir (`tiene_rastro` en `items_de_caso_admin`).
--
-- Idempotente. Ejecutar tras 0228.
-- ============================================================

-- ═══ (1) ¿Qué área de derivación opera quien está llamando? ═══
-- Devuelve el área cuyo trabajo hace esta persona, para engancharle el ítem que
-- crea. Orden deliberado: Logística primero, porque es quien más ítems agrega en
-- caliente. `null` = no opera ninguna área de derivación (Recopilación,
-- Verificación): su ítem queda SIN REPARTIR, que es lo correcto — repartir es
-- trabajo de Verificación al derivar.
--
-- El ADMIN GENERAL también devuelve null, y a propósito: `puede_logistica()` y
-- `puede_alianzas()` son ciertas para él, así que sin este corte todo ítem creado
-- por administración caería en la derivación de Logística por puro orden de las
-- comprobaciones. Un admin no está «operando Logística» por ser admin.
--
-- Se usan `puede_logistica()` / `puede_alianzas()` y NO
-- `puede_operar_area_derivacion()`: esta última no reconoce a los MANDOS de grupo
-- (líder/coordinador), que sí pueden editar el desglose —`puede_logistica()` los
-- incluye desde 0214—. Con la otra, un líder de Logística agregaría un ítem y le
-- desaparecería: justo el bug que 0214 vino a cerrar. Para 'redes' no hay helper
-- de mando, así que ahí sí vale la canónica.
--
-- plpgsql y no `language sql`: es la regla de la casa para las funciones de
-- catálogo que tocan roles (`rol_de_grupo`, `clave_de_rol`,
-- `roles_area_derivacion`), porque un `language sql` se planifica de golpe y se
-- rompe si algún valor de enum de los que menciona aún no existe.
create or replace function public.area_derivacion_propia()
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if public.es_admin() then return null; end if;
  if public.puede_logistica() then return 'logistica'; end if;
  if public.puede_alianzas()  then return 'alianzas';  end if;
  if public.puede_operar_area_derivacion('redes') then return 'redes'; end if;
  return null;
end $$;

revoke all on function public.area_derivacion_propia() from public;
grant execute on function public.area_derivacion_propia() to authenticated;

comment on function public.area_derivacion_propia() is
  'Área de derivación (0177) que opera quien llama: logistica / alianzas / redes, o null si no opera ninguna (Recopilación, Verificación, admin general). La usa guardar_item_caso (0229) para enganchar un ítem NUEVO a la derivación de su propia área y que no desaparezca de su pantalla por el filtro selectivo de items_de_caso_area (0222). Usa puede_logistica()/puede_alianzas() —que reconocen a los mandos de grupo desde 0214— y no puede_operar_area_derivacion(), que no los reconoce.';

-- ═══ (2) Enganchar el ítem nuevo a la derivación del área de quien lo crea ═══
-- Solo actúa si esa derivación EXISTE y además YA TIENE selección explícita: si el
-- puente está vacío, la derivación es «de la solicitud completa» (0222) y el ítem
-- nuevo ya entra sin hacer nada —engancharlo ahí convertiría por accidente una
-- derivación completa en una selectiva, dejando fuera al resto del desglose.
create or replace function public.enganchar_item_a_mi_area(p_item uuid, p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_area  text := public.area_derivacion_propia();
  v_deriv uuid;
begin
  if p_item is null or p_caso is null or v_area is null then return; end if;

  select d.id into v_deriv
    from public.casos_derivaciones d
   where d.caso_id = p_caso and d.area = v_area
   limit 1;
  if v_deriv is null then return; end if;

  -- Puente vacío = derivación de la solicitud completa: no tocar.
  if not exists (select 1 from public.casos_derivacion_items x where x.derivacion_id = v_deriv) then
    return;
  end if;

  insert into public.casos_derivacion_items (derivacion_id, item_id, creado_por)
  values (v_deriv, p_item, auth.uid())
  on conflict (derivacion_id, item_id) do nothing;
end $$;

revoke all on function public.enganchar_item_a_mi_area(uuid, uuid) from public;
-- No se concede a `authenticated`: la llama únicamente guardar_item_caso.

comment on function public.enganchar_item_a_mi_area(uuid, uuid) is
  'Engancha un ítem recién creado (0229) a la derivación del área de quien lo crea, SOLO si esa derivación ya tiene selección explícita de ítems (0222). Sin esto, un ítem agregado por Logística en un caso con derivación selectiva no aparecería en su propia pantalla, porque items_de_caso_area filtra por el puente. No se engancha a las demás áreas a propósito: Redacción no debe recibir un ítem que nadie le mandó.';

-- ═══ (3) guardar_item_caso — MISMA firma; solo se suma el enganche en el alta ═══
-- Cuerpo idéntico al de 0219 salvo UNA línea nueva tras el INSERT. La firma no
-- varía, así que ningún llamador TS se toca
-- (`apps/web/app/(app)/casos/actions.ts::guardarItemCaso`).
create or replace function public.guardar_item_caso(
  p_caso        uuid,
  p_descripcion text,
  p_tipo        text default 'otro',
  p_cantidad    numeric default null,
  p_unidad      text default null,
  p_notas       text default null,
  p_item        uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_desc   text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_tipo   text := lower(coalesce(nullif(btrim(coalesce(p_tipo, '')), ''), 'otro'));
  v_unidad text := nullif(btrim(coalesce(p_unidad, '')), '');
  v_notas  text := nullif(btrim(coalesce(p_notas, '')), '');
  v_caso   uuid;
  v_id     uuid;
begin
  if not public.puede_gestionar_items_caso() then
    raise exception 'No tienes permiso para editar el desglose de la solicitud.' using errcode = '42501';
  end if;
  if v_desc is null then
    raise exception 'Describe qué se necesita en este ítem.' using errcode = '22023';
  end if;
  if p_cantidad is not null and p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;
  -- Validación del tipo SIN cast eager sobre un valor que pudiera no existir.
  if not exists (select 1 from unnest(enum_range(null::public.tipo_insumo)) as e(v) where e.v::text = v_tipo) then
    raise exception 'Tipo de ítem no válido: %', v_tipo using errcode = '22023';
  end if;

  v_desc   := left(v_desc, 300);
  v_unidad := left(v_unidad, 40);
  v_notas  := left(v_notas, 500);

  if p_item is not null then
    select i.caso_id into v_caso from public.casos_items i where i.id = p_item;
    if v_caso is null then
      raise exception 'Ítem no encontrado.' using errcode = 'P0002';
    end if;
    update public.casos_items
       set descripcion    = v_desc,
           tipo           = v_tipo::public.tipo_insumo,
           cantidad       = p_cantidad,
           unidad         = v_unidad,
           notas          = v_notas,
           actualizado_en = now()
     where id = p_item;
    v_id := p_item;
    -- La auditoría de la EDICIÓN la emite trg_auditar_cambio_item (0219), con el detalle
    -- de los campos que cambiaron y solo si realmente cambió alguno.
  else
    if p_caso is null then
      raise exception 'Falta la solicitud.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.casos c where c.id = p_caso) then
      raise exception 'Solicitud no encontrada.' using errcode = 'P0002';
    end if;
    v_caso := p_caso;
    insert into public.casos_items (caso_id, orden, tipo, descripcion, cantidad, unidad, notas, creado_por)
    values (
      p_caso,
      coalesce((select max(i.orden) from public.casos_items i where i.caso_id = p_caso), 0) + 1,
      v_tipo::public.tipo_insumo, v_desc, p_cantidad, v_unidad, v_notas, auth.uid()
    )
    returning id into v_id;

    -- 0229: que el ítem no se esfume de la pantalla de quien lo acaba de crear.
    perform public.enganchar_item_a_mi_area(v_id, p_caso);

    -- Alta: entidad='casos' para que se vea en el «Historial de cambios» del detalle.
    perform public.registrar_auditoria(
      'item_agregado', 'casos', v_caso::text,
      jsonb_build_object('item', v_id, 'descripcion', v_desc, 'tipo', v_tipo,
                         'cantidad', p_cantidad, 'unidad', v_unidad));
  end if;

  return v_id;
end $$;

revoke all on function public.guardar_item_caso(uuid, text, text, numeric, text, text, uuid) from public;
grant execute on function public.guardar_item_caso(uuid, text, text, numeric, text, text, uuid) to authenticated;

comment on function public.guardar_item_caso(uuid, text, text, numeric, text, text, uuid) is
  'Alta y edición de un ítem del desglose (0218; auditoría de la edición por trigger desde 0219). SIN puerta por estado, a propósito: se puede desglosar y corregir en cualquier fase, incluidas las solicitudes anteriores al ítem. Desde 0229, al dar de ALTA engancha el ítem a la derivación del área de quien lo crea si esa derivación ya es selectiva (0222) — sin eso, Logística agregaba un ítem y desaparecía de su propia pantalla.';

-- ═══ (4) Cuántos ítems del caso NO se han repartido a ninguna área ═══
-- Para que Verificación vea que hay desglose nuevo pendiente de derivar, y para que
-- la pantalla de un área pueda decir «hay N ítems del caso que no te tocan a ti».
-- Devuelve 0 —no excepción— para las cuentas sin permiso: la página degrada.
create or replace function public.items_sin_repartir(p_caso uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_n int;
begin
  if p_caso is null or not public.es_verificado() then return 0; end if;

  -- Solo cuenta cuando el caso YA tiene alguna derivación con selección explícita:
  -- si no hay ninguna, «sin repartir» no significa nada todavía.
  if not exists (
    select 1 from public.casos_derivacion_items x
      join public.casos_derivaciones d on d.id = x.derivacion_id
     where d.caso_id = p_caso
  ) then
    return 0;
  end if;

  select count(*)::int into v_n
    from public.casos_items i
   where i.caso_id = p_caso
     and not exists (
       select 1 from public.casos_derivacion_items x
         join public.casos_derivaciones d on d.id = x.derivacion_id
        where x.item_id = i.id and d.caso_id = p_caso
     );
  return coalesce(v_n, 0);
end $$;

revoke all on function public.items_sin_repartir(uuid) from public;
grant execute on function public.items_sin_repartir(uuid) to authenticated;

comment on function public.items_sin_repartir(uuid) is
  'Cuántos ítems del desglose no están en ninguna derivación (0229), y solo si el caso ya reparte por ítem (0222). Sirve para avisar a Verificación de que hay desglose nuevo sin derivar. Devuelve 0 sin permiso: la pantalla degrada, no rompe.';

-- ═══ (5) items_de_caso_admin — el desglose COMPLETO + si el ítem deja rastro ═══
-- La pantalla de Logística necesita dos cosas que `items_de_caso_area` no da:
--   · Ver TODO el desglose para poder editarlo, no solo la parte que le tocó. Se
--     puede: `citems_select` (0218) ya expone la tabla entera a toda cuenta
--     verificada, así que esto no abre nada nuevo — solo evita que la pantalla
--     tenga que consultar la tabla a pelo y reimplementar el cálculo de cobertura.
--   · `tiene_rastro`: si el ítem tiene aportes o historial. Es lo que decide si
--     «quitar» debe BORRAR (ítem limpio, error de tecleo) o CANCELAR (ya hay
--     entregas anotadas y borrarlas falsearía la reportería).
create or replace function public.items_de_caso_admin(p_caso uuid)
returns table (
  id           uuid,
  orden        int,
  tipo         text,
  descripcion  text,
  cantidad     numeric,
  unidad       text,
  notas        text,
  estado       text,
  cubierto     numeric,
  pct          numeric,
  tiene_rastro boolean,
  mi_area      boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_sel uuid[]; v_area text;
begin
  if p_caso is null or not public.es_verificado() then
    return;
  end if;
  v_area := public.area_derivacion_propia();
  v_sel  := case when v_area is null then null
                 else public.items_derivados_a_area(p_caso, v_area) end;

  return query
    select i.id,
           i.orden,
           i.tipo::text,
           i.descripcion,
           i.cantidad,
           i.unidad,
           i.notas,
           i.estado,
           coalesce(a.suma, 0)::numeric as cubierto,
           case when i.cantidad is null or i.cantidad <= 0 then null
                else least(100, round(coalesce(a.suma, 0) / i.cantidad * 100, 1)) end as pct,
           (coalesce(a.n, 0) > 0 or coalesce(h.n, 0) > 0) as tiene_rastro,
           (v_sel is null or i.id = any(v_sel))            as mi_area
      from public.casos_items i
      left join lateral (
        select sum(x.cantidad) as suma, count(*) as n
          from public.casos_item_aportes x where x.item_id = i.id
      ) a on true
      left join lateral (
        select count(*) as n
          from public.casos_items_historial x where x.item_id = i.id
      ) h on true
     where i.caso_id = p_caso
     order by i.orden, i.creado_en;
end $$;

revoke all on function public.items_de_caso_admin(uuid) from public;
grant execute on function public.items_de_caso_admin(uuid) to authenticated;

comment on function public.items_de_caso_admin(uuid) is
  'Desglose COMPLETO de un caso para la pantalla que lo EDITA (0229), con dos campos que no da items_de_caso_area: `tiene_rastro` (hay aportes o historial → «quitar» debe cancelar, no borrar, porque el DELETE cascadea y haría desaparecer entregas ya anotadas) y `mi_area` (si el ítem está en la derivación de quien mira). No expone nada que citems_select (0218) no exponga ya. Gate es_verificado() con retorno vacío.';
