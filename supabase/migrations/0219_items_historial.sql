-- ============================================================
-- 0219 — Historial de cambios de los ÍTEMS del desglose
-- ------------------------------------------------------------
-- ANTES: `public.casos_items` (0218) nació sin memoria. Sus tres RPC escriben el
--   valor nuevo encima del anterior, y el único rastro que quedaba de una edición era
--   un asiento genérico en `registro_auditoria` («Ítem del desglose editado») que NO
--   dice QUÉ cambió: ni el valor de antes, ni el de después. Como el desglose lo
--   mantienen TRES áreas a la vez —Recopilación (quien lo reporta), Verificación (quien
--   lo corrige) y Logística (quien lo gestiona y afina las cantidades reales)—, y las
--   necesidades cambian con el tiempo, esa pérdida es justo la información que hace
--   falta para saber por qué hoy se piden 200 raciones si ayer eran 50, y quién lo dijo.
--
-- AHORA: `public.casos_items_historial`, append-only, con una fila por CAMPO que cambia
--   (valor anterior → valor nuevo, quién y cuándo). Molde exacto de
--   `0206_tarea_historial_cambios.sql`, que a su vez espeja `0178_historial_correcciones_caso.sql`.
--   La escritura va SOLO por el trigger (SECURITY DEFINER); la tabla publica únicamente
--   policy de SELECT. «Nada se borra».
--
-- QUÉ SE DIFFEA: descripcion, tipo, cantidad, unidad y estado, vía `to_jsonb(new/old)`
--   con etiquetas en español. Deliberadamente NO se diffean:
--     · `orden` — reordenar el desglose no cambia lo que se necesita, y llenaría el
--       historial de ruido cada vez que alguien pulsa ↑/↓. `reordenar_items_caso` ya
--       deja su propio asiento ('items_reordenados').
--     · `notas` — es una indicación operativa para Logística, no el requerimiento.
--     · `cantidad_texto` / `actualizado_en` / `creado_por` — legado o metadatos.
--   `cantidad` es `numeric`: se compara NORMALIZADA (mismo formateo que usa
--   `sincronizar_req_desde_items` en 0218), para que reescribir «50.0» sobre «50» no
--   invente un cambio que no existe.
--
-- POR QUÉ UN TRIGGER Y NO UN `insert` DENTRO DE CADA RPC: el desglose ya no lo tocan
--   solo las RPC de 0218. El semáforo por ítem (0220) y el cumplimiento por aportes
--   (0221) van a mover `estado` desde sus propias funciones y triggers. Un trigger
--   AFTER UPDATE sobre la tabla capta TODAS esas rutas —las de hoy y las de mañana—
--   sin que cada migración nueva tenga que acordarse de registrar nada.
--
-- ── EL DOBLE ASIENTO (molde `0201_derivacion_historial_caso.sql`) ──
--   El bloque «Historial de cambios» del detalle de la solicitud lee
--   `registro_auditoria` filtrando `entidad='casos'` (`casos/[id]/page.tsx` y el drawer
--   de `casos/page.tsx`). Un asiento con entidad='casos_items' sería INVISIBLE ahí. Por
--   eso el trigger, además de la fila fina, emite
--   `registrar_auditoria('item_editado','casos', caso_id, …)`.
--
--   0218 YA emitía ese asiento desde `guardar_item_caso`. Para no duplicarlo, aquí el
--   trigger lo SUSTITUYE en la rama de edición: `guardar_item_caso` se reescribe (MISMA
--   firma, ningún llamador TS cambia) para auditar solo el ALTA ('item_agregado'), que
--   es un INSERT y por tanto no diffeable. Se gana además precisión:
--     · el asiento sale UNA sola vez por edición, aunque cambien varios campos, y lleva
--       en `metadata.campos` la lista de lo que cambió (la UI lo muestra);
--     · guardar el formulario SIN cambiar nada ya no ensucia el historial (antes sí:
--       la RPC auditaba siempre, hubiese o no diferencia).
--   `eliminar_item_caso` ('item_eliminado') y `reordenar_items_caso` ('items_reordenados')
--   se quedan como están: un DELETE no es diffeable y el orden no se audita fino.
--
--   NOTA PARA 0220/0221: cualquier UPDATE de `casos_items.estado` —venga de
--   `avanzar_item` o del recálculo por aportes— YA queda registrado por este trigger, en
--   el historial fino y en el «Historial de cambios» del caso. No repitáis el asiento
--   con entidad='casos' para el mismo cambio: sería una entrada duplicada.
--
-- ── LECTURA (RLS) ──
--   `using (public.es_admin() or public.es_verificado())`, en línea con `citems_select`
--   (0218). NO se usa un `exists (select 1 from public.casos …)`: desde
--   `0180_redaccion_vista_curada.sql` Redacción/Redes no leen `casos`, y esa policy les
--   devolvería CERO filas sin ningún error visible — el modo de fallo dominante del repo.
--   Tampoco hace falta encadenar un `exists` sobre `casos_items`: su propia policy ya es
--   `es_verificado()`, así que el resultado sería el mismo con un subplan por fila.
--   El historial no añade superficie de privacidad: guarda los mismos valores que la fila
--   de `casos_items` que cualquier cuenta verificada ya puede leer (un ítem no lleva
--   contacto ni PII; eso vive en `casos`, que sigue cerrado).
--
-- ALCANCE DEL BORRADO: `on delete cascade` desde `casos_items` (igual que 0206 y 0178).
--   Al eliminar un ítem su historial fino se va con él; la constancia de que existió y
--   se quitó permanece en `registro_auditoria` ('item_eliminado', con la descripción).
--
-- ENUM-SAFETY: esta migración no añade ningún valor de enum ni crea ninguno.
--
-- Idempotente. Ejecutar tras 0218.
-- ============================================================

-- ═══ (1) La tabla ═══
create table if not exists public.casos_items_historial (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.casos_items(id) on delete cascade,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  actor_id       uuid references public.perfiles(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_casos_items_hist on public.casos_items_historial (item_id, creado_en);

comment on table public.casos_items_historial is
  'Historial append-only de los cambios de un ítem del desglose (0219): descripción, tipo, cantidad, unidad y estado, con valor anterior → nuevo, quién y cuándo. Lo escribe SOLO el trigger trg_auditar_cambio_item; la tabla publica únicamente policy de SELECT. La lectura es es_verificado() (nunca un exists() sobre `casos`: Redacción no lo lee desde 0180).';
comment on column public.casos_items_historial.campo is
  'Etiqueta EN ESPAÑOL del campo que cambió («Cantidad», «Estado»…), no el nombre de la columna: es lo que se muestra tal cual en la interfaz.';

-- ═══ (2) RLS — solo SELECT; la escritura es del trigger ═══
alter table public.casos_items_historial enable row level security;

drop policy if exists citems_hist_select on public.casos_items_historial;
create policy citems_hist_select on public.casos_items_historial for select to authenticated
  using (public.es_admin() or public.es_verificado());

-- INSERT / UPDATE / DELETE: SIN policy, a propósito (deny-by-default con RLS activa).
-- Los `drop ... if exists` limpian cualquier policy suelta de un entorno de pruebas.
drop policy if exists citems_hist_insert on public.casos_items_historial;
drop policy if exists citems_hist_update on public.casos_items_historial;
drop policy if exists citems_hist_delete on public.casos_items_historial;

grant select on public.casos_items_historial to authenticated;

-- ═══ (3) El trigger: asiento fino por campo + asiento del caso ═══
create or replace function public.auditar_cambio_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old   jsonb := to_jsonb(old);
  v_new   jsonb := to_jsonb(new);
  v_actor uuid  := auth.uid();
  -- {columna|etiqueta en español}
  v_campos constant text[] := array[
    'descripcion|Descripción',
    'tipo|Tipo',
    'cantidad|Cantidad',
    'unidad|Unidad',
    'estado|Estado'
  ];
  v_item text; v_parts text[]; v_col text; v_lbl text;
  v_ant text; v_nue text;
  v_tocados text[] := array[]::text[];
begin
  foreach v_item in array v_campos loop
    v_parts := string_to_array(v_item, '|');
    v_col := v_parts[1]; v_lbl := v_parts[2];
    v_ant := v_old ->> v_col;
    v_nue := v_new ->> v_col;

    -- `cantidad` es numeric: 50, 50.0 y 50.00 son el MISMO número pero tres textos
    -- distintos en jsonb. Se normaliza con el mismo formateo de 0218 para no registrar
    -- un cambio inexistente (y para que el historial se lea «50» y no «50.00»).
    if v_col = 'cantidad' then
      v_ant := case when old.cantidad is null then null
                    when old.cantidad = trunc(old.cantidad) then trunc(old.cantidad)::text
                    else rtrim(rtrim(old.cantidad::text, '0'), '.') end;
      v_nue := case when new.cantidad is null then null
                    when new.cantidad = trunc(new.cantidad) then trunc(new.cantidad)::text
                    else rtrim(rtrim(new.cantidad::text, '0'), '.') end;
    end if;

    if v_ant is distinct from v_nue then
      insert into public.casos_items_historial (item_id, campo, valor_anterior, valor_nuevo, actor_id)
      values (new.id, v_lbl, v_ant, v_nue, v_actor);
      v_tocados := array_append(v_tocados, v_lbl);
    end if;
  end loop;

  -- Nada cambió de lo que se audita (p. ej. un reordenamiento, o guardar sin tocar):
  -- ni fila fina ni asiento. Así el historial no se llena de ruido.
  if array_length(v_tocados, 1) is null then
    return new;
  end if;

  -- Segundo asiento (molde 0201): con entidad='casos' para que el bloque «Historial de
  -- cambios» del detalle —que filtra por entidad='casos'— muestre la edición. UNA sola
  -- entrada por edición, con la lista de campos tocados en el metadata.
  perform public.registrar_auditoria(
    'item_editado', 'casos', new.caso_id::text,
    jsonb_build_object('item', new.id, 'descripcion', new.descripcion,
                       'campos', to_jsonb(v_tocados), 'n', array_length(v_tocados, 1)));

  return new;
end $$;

comment on function public.auditar_cambio_item() is
  'Trigger de trazabilidad del desglose (0219): diffea descripcion/tipo/cantidad/unidad/estado de casos_items y escribe una fila por campo en casos_items_historial, más UN asiento en registro_auditoria con entidad=''casos'' (doble asiento, molde 0201) para que la edición se vea en el «Historial de cambios» del detalle. Capta cualquier ruta de escritura, presente o futura (0220 semáforo, 0221 aportes).';

drop trigger if exists trg_auditar_cambio_item on public.casos_items;
create trigger trg_auditar_cambio_item
  after update on public.casos_items
  for each row execute function public.auditar_cambio_item();

-- ═══ (4) guardar_item_caso — MISMA firma; solo cambia quién audita la EDICIÓN ═══
-- Cuerpo idéntico al de 0218 salvo el bloque final de auditoría: el alta sigue
-- registrándose aquí ('item_agregado': un INSERT no es diffeable), y la edición pasa a
-- registrarla el trigger de arriba, que además sabe QUÉ cambió y no escribe nada si no
-- cambió nada. Sin este cambio, cada edición dejaría DOS asientos idénticos en el
-- historial del caso. La firma no varía, así que ningún llamador TS se toca
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
  'Alta y edición de un ítem del desglose (0218). Desde 0219 solo audita el ALTA: la edición la registra trg_auditar_cambio_item, que además guarda el valor anterior → nuevo de cada campo en casos_items_historial.';
