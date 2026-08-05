-- ============================================================
-- 0218 — Desglose por ÍTEM de la solicitud (keystone del bloque de ítems)
-- ------------------------------------------------------------
-- ANTES: lo que una solicitud necesita se guardaba en TRES columnas escalares de
--   `public.casos` (0112): `req_tipo` (enum tipo_insumo), `req_cantidad` (TEXTO LIBRE:
--   «50 cajas de agua y 200 raciones») y `req_urgencia`. Con una sola necesidad por
--   caso funcionaba; con varias, no: no se puede saber qué falta, ni medir cobertura,
--   ni derivar «solo lo que aún no se cubrió». Y tampoco se podía modelar como N filas
--   de `solicitudes_insumo`: el índice único parcial `uq_solins_caso` (0113) impone UNA
--   solicitud de insumo por caso, y `solicitud_logistica_de_caso()` (0208) es idempotente
--   por caso.
--
-- AHORA: una tabla hija, `public.casos_items`, con cantidad NUMÉRICA + unidad + tipo +
--   descripción. Es la pieza de la que cuelgan el semáforo por ítem, el cumplimiento,
--   la derivación selectiva y la reportería de cobertura.
--
-- ¿POR QUÉ CUELGA DE `casos` Y NO DE `solicitudes_insumo`?
--   · Recopilación y Verificación deben poder editar el desglose, y ambas viven en
--     `casos` (`casos_insert` 0207, `casos_update` 0147). `solicitudes_insumo` tiene
--     `solins_update = puede_logistica()`: Recopilación no la tocaría nunca.
--   · Colgar de `casos` tiene una trampa: desde `0180_redaccion_vista_curada.sql`,
--     Redacción/Redes NO leen `casos` (se les quitó la rama de `casos_select`; leen la
--     vista `casos_difusion`). Por eso la policy de lectura de esta tabla NO puede ser
--     un `exists (select 1 from public.casos ...)`: a Redacción le devolvería CERO filas
--     y sin ningún error visible — el modo de fallo dominante de este repo.
--     La lectura es `using (public.es_verificado())`, igual que `solins_lectura` (0050)
--     y `bitsol_select` (0163). Es coherente con la doctrina de privacidad por capa: un
--     ítem no lleva contacto ni PII (eso vive en `casos`, que sigue cerrado).
--   · Toda ESCRITURA pasa por RPC SECURITY DEFINER (molde `casos_verificacion_campo`,
--     0172: la tabla solo publica policy de SELECT).
--
-- `req_tipo` / `req_cantidad` NO se retiran: tienen consumidores verificados
--   (`solicitud_logistica_de_caso` 0208, `derivar_caso_a_logistica` 0113, la vista
--   `casos_difusion`, `seguimiento_casos` 0211, `solicitudes_ayuda_mapa` 0112,
--   `mapa_panorama` 0204, `solicitar_cobertura_parcial` 0211, `casos_requerimiento_chk`
--   0112, `lib/prioridad.ts`, `lib/export/solicitudes.ts`, `BloqueRequerimiento.tsx`).
--   Pasan a ser una DENORMALIZACIÓN agregada, recalculada por trigger desde los ítems.
--
-- EL BLINDAJE (lo más delicado de esta migración): ese UPDATE sobre `casos` despierta
--   dos triggers ya existentes —`auditar_correccion_caso` (0178, diffea req_tipo y
--   req_cantidad) y `reset_verificacion_al_editar` (0183, que mapea
--   req_tipo/req_cantidad/req_urgencia/personas_afectadas al campo 'cantidad' del
--   semáforo)—. Sin blindaje, CADA edición de un ítem devolvería 'cantidad' a 🟡
--   'sin_revisar', el caso dejaría de estar Validado y `gate_confirmacion_caso` (0173) y
--   `gate_derivacion_validada` (0177) lo volverían NO derivable, en bucle.
--   Se blinda con un flag de sesión, `app.items_ok`, igual que `app.publicado_ok` (0166)
--   y `app.devolver_ok` (0210): la función de sincronización lo pone en '1' justo antes
--   del UPDATE y lo limpia después, y `reset_verificacion_al_editar` se REESCRIBE
--   COMPLETA desde 0183 añadiendo esa condición de bypass SOLO en la rama 'cantidad'
--   (el resto de las ramas queda idéntico: si alguien edita la descripción o la
--   ubicación, el semáforo se sigue reseteando como siempre).
--   `auditar_correccion_caso` (0178) NO se toca a propósito: que el historial de
--   correcciones registre «Cantidad: antes → después» al cambiar el desglose es traza
--   útil, no un bucle. El asiento fino por ítem llega con 0219.
--
-- LO QUE NO SE TOCA (decisiones explícitas):
--   · `casos_requerimiento_chk` (0112) — sigue exigiendo lat/lng en un requerimiento.
--   · `caso_esta_validado()` (0173) — el campo 'cantidad' del semáforo de verificación
--     SIGUE SIENDO POR CASO («el desglose completo está verificado»). Cambiarlo obligaría
--     a reescribir además `CAMPOS_VERIFICACION_BASE/_REQ`, los tres componentes React
--     clonados y `solicitar_cobertura_parcial` (0211), que siembra 'ubicacion'/'cantidad'.
--   · `casos.req_urgencia` — la urgencia sigue siendo del caso, no del ítem.
--
-- ENUM-SAFETY: esta migración NO añade ningún valor de enum. `casos_items.tipo` reutiliza
--   `public.tipo_insumo` (0050 + 0149) y `casos_items.estado` es TEXT + CHECK (precedentes:
--   `tipo_difusion` 0189, `punto_tipo` 0145, `casos_derivaciones.area` 0177), de modo que
--   añadir un estado en el futuro sea un `drop constraint` + `add constraint` sin cast eager.
--
-- Idempotente. Ejecutar tras 0217.
-- ============================================================

-- ═══ (1) La tabla ═══
create table if not exists public.casos_items (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos(id) on delete cascade,
  orden          int  not null default 0,
  tipo           public.tipo_insumo not null default 'otro',
  descripcion    text not null,
  cantidad       numeric check (cantidad is null or cantidad > 0),
  unidad         text,
  cantidad_texto text,                 -- legado/incomparable: cantidad que no es numérica
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','en_gestion','en_ruta','cumplido','no_disponible','cancelado')),
  notas          text,
  creado_por     uuid references public.perfiles(id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_casos_items on public.casos_items (caso_id, orden);

comment on table public.casos_items is
  'Desglose por ÍTEM de lo que necesita una solicitud (0218): cantidad numérica + unidad + tipo + descripción. Cuelga de `casos` (no de solicitudes_insumo: uq_solins_caso impone 1 solicitud por caso, y Recopilación/Verificación no pueden escribir en solicitudes_insumo). Lectura para toda cuenta verificada (Redacción no lee `casos` desde 0180); escritura SOLO por guardar_item_caso / eliminar_item_caso / reordenar_items_caso. Un trigger denormaliza el agregado a casos.req_tipo/req_cantidad con el flag app.items_ok para no resetear el semáforo de verificación.';

comment on column public.casos_items.cantidad_texto is
  'Cantidad no numérica («un camión», «lo que se pueda»). No se compara ni se suma: el % de cumplimiento (0221) solo mira `cantidad`.';
comment on column public.casos_items.estado is
  'Paso del ítem. TEXT + CHECK a propósito (nunca un enum nuevo): añadir un valor será drop/add constraint. Lo gobierna 0220; aquí todo ítem nace ''pendiente''.';

-- ═══ (2) RLS — lectura abierta a cuentas verificadas; escritura solo por RPC ═══
alter table public.casos_items enable row level security;

-- REPLICA IDENTITY FULL: para que Realtime evalúe la RLS también en UPDATE/DELETE
-- (molde 0181). La fila «vieja» tampoco lleva datos sensibles, así que es seguro.
alter table public.casos_items replica identity full;

-- SELECT: `es_verificado()` y NUNCA un exists() sobre `casos` (ver cabecera).
drop policy if exists citems_select on public.casos_items;
create policy citems_select on public.casos_items for select to authenticated
  using (public.es_verificado());

-- INSERT / UPDATE / DELETE: SIN policy, a propósito. Con RLS activa eso las deniega a
-- todo el mundo; la única vía de escritura son las RPC SECURITY DEFINER de más abajo
-- (molde exacto de casos_verificacion_campo, 0172). Se dejan los `drop ... if exists`
-- para que la migración también limpie cualquier policy suelta de un entorno de pruebas.
drop policy if exists citems_insert on public.casos_items;
drop policy if exists citems_update on public.casos_items;
drop policy if exists citems_delete on public.casos_items;

-- El GRANT habilita el acceso base y el canal de realtime; la RLS decide las filas.
grant select on public.casos_items to authenticated;

-- ═══ (3) Quién puede editar el desglose ═══
-- Recopilación (quien reporta y completa), Verificación (quien corrige), Logística
-- (quien lo gestiona y afina cantidades reales), la administración y los MANDOS de esos
-- grupos —líder/coordinador— que la app ya reconoce como operadores de su área.
-- `puede_logistica()` ya incluye `es_mando_logistica()` desde 0214; se deja explícito
-- el resto. Se expone a la app para que la interfaz muestre (o no) el editor.
create or replace function public.puede_gestionar_items_caso()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin()
      or public.puede_verificar()
      or public.puede_logistica()
      or public.tiene_rol('recopilacion')
      or public.es_mando_recopilacion()
      or public.es_mando_verificacion();
$$;
revoke all on function public.puede_gestionar_items_caso() from public;
grant execute on function public.puede_gestionar_items_caso() to authenticated;

comment on function public.puede_gestionar_items_caso() is
  'Gate del desglose por ítem (0218): admin, Verificación, Logística, Recopilación y los mandos de Recopilación/Verificación. Lo usan las tres RPC de escritura y la interfaz.';

-- ═══ (4) Denormalización a casos.req_tipo / casos.req_cantidad ═══
-- Recalcula el agregado desde los ítems y lo escribe en `casos`, BLINDADO con
-- `app.items_ok`. Reglas:
--   · 0 ítems → NO se toca nada. Así los casos anteriores al desglose conservan su
--     texto libre, y borrar el último ítem no borra el histórico del caso.
--   · Un solo tipo entre los ítems → ese tipo; varios tipos → 'otro' (honesto: el
--     escalar ya no representa el desglose, y `otro` existe en el enum desde 0050).
--   · El texto agregado se arma en el orden del desglose: «50 cajas de agua · 200 raciones».
-- SECURITY DEFINER porque quien edita un ítem (p. ej. Logística) no tiene UPDATE sobre
-- `casos` por RLS; la autorización ya la hizo la RPC que provocó el cambio.
create or replace function public.sincronizar_req_desde_items(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_n     int;
  v_tipos int;
  v_tipo  public.tipo_insumo;
  v_texto text;
begin
  if p_caso is null then return; end if;

  select count(*), count(distinct tipo) into v_n, v_tipos
    from public.casos_items where caso_id = p_caso;
  if coalesce(v_n, 0) = 0 then return; end if;

  if v_tipos = 1 then
    select tipo into v_tipo from public.casos_items where caso_id = p_caso limit 1;
  else
    v_tipo := 'otro'::public.tipo_insumo;
  end if;

  select left(string_agg(x.linea, ' · ' order by x.orden, x.creado_en), 500)
    into v_texto
    from (
      select i.orden, i.creado_en,
             btrim(
               coalesce(
                 case
                   when i.cantidad is null then nullif(btrim(coalesce(i.cantidad_texto, '')), '')
                   when i.cantidad = trunc(i.cantidad)
                     then trunc(i.cantidad)::text || coalesce(' ' || nullif(btrim(coalesce(i.unidad, '')), ''), '')
                   else rtrim(rtrim(i.cantidad::text, '0'), '.') || coalesce(' ' || nullif(btrim(coalesce(i.unidad, '')), ''), '')
                 end || ' ', ''
               ) || i.descripcion
             ) as linea
        from public.casos_items i
       where i.caso_id = p_caso
    ) x;

  -- Blindaje: habilita el bypass de reset_verificacion_al_editar (0183 → reescrita abajo)
  -- para que recalcular el agregado NO devuelva el campo 'cantidad' del semáforo a 🟡.
  perform set_config('app.items_ok', '1', true);
  update public.casos c
     set req_tipo       = v_tipo,
         req_cantidad   = v_texto,
         actualizado_en = now()
   where c.id = p_caso
     and (c.req_tipo is distinct from v_tipo or c.req_cantidad is distinct from v_texto);
  perform set_config('app.items_ok', '', true);
end $$;

revoke all on function public.sincronizar_req_desde_items(uuid) from public;
-- No se concede a `authenticated`: la llama únicamente el trigger.

create or replace function public.denormalizar_items_caso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_caso uuid;
begin
  if tg_op = 'DELETE' then
    v_caso := old.caso_id;
  else
    v_caso := new.caso_id;
    -- Un ítem no debería cambiar de caso, pero si pasara hay que recalcular los DOS.
    if tg_op = 'UPDATE' and old.caso_id is distinct from new.caso_id then
      perform public.sincronizar_req_desde_items(old.caso_id);
    end if;
  end if;
  perform public.sincronizar_req_desde_items(v_caso);
  return null;
end $$;

drop trigger if exists trg_denormalizar_items_caso on public.casos_items;
create trigger trg_denormalizar_items_caso
  after insert or update or delete on public.casos_items
  for each row execute function public.denormalizar_items_caso();

-- ═══ (5) reset_verificacion_al_editar — REESCRITA COMPLETA desde 0183 + bypass ═══
-- Cuerpo idéntico al de 0183 (mismo mapeo columna(s) → campo del semáforo, mismas notas
-- de diseño) salvo UNA condición nueva en la rama 'cantidad': si el UPDATE viene de la
-- denormalización por ítems (`app.items_ok` = '1'), NO se resetea. Sin esto, cada edición
-- de un ítem dejaría el caso fuera de Validado y por tanto no confirmable (0173) ni
-- derivable (0177), en bucle.
create or replace function public.reset_verificacion_al_editar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campos text[] := array[]::text[];
begin
  if new.referente is distinct from old.referente
     or new.referente_rol is distinct from old.referente_rol
     or new.contacto is distinct from old.contacto
     or new.contacto_whatsapp is distinct from old.contacto_whatsapp
     or new.contacto_instagram is distinct from old.contacto_instagram then
    v_campos := array_append(v_campos, 'referente');
  end if;

  if new.descripcion is distinct from old.descripcion then
    v_campos := array_append(v_campos, 'descripcion');
  end if;

  if new.fuente is distinct from old.fuente
     or new.fuente_url is distinct from old.fuente_url
     or new.fuente_tipo is distinct from old.fuente_tipo then
    v_campos := array_append(v_campos, 'fuente');
  end if;

  if new.sigue_vigente is distinct from old.sigue_vigente then
    v_campos := array_append(v_campos, 'vigencia');
  end if;

  if new.ubicacion_estado is distinct from old.ubicacion_estado
     or new.ubicacion_municipio is distinct from old.ubicacion_municipio
     or new.ubicacion_parroquia is distinct from old.ubicacion_parroquia
     or new.ubicacion_sector is distinct from old.ubicacion_sector
     or new.ubicacion_direccion is distinct from old.ubicacion_direccion
     or new.lat is distinct from old.lat
     or new.lng is distinct from old.lng then
    v_campos := array_append(v_campos, 'ubicacion');
  end if;

  -- 'cantidad': igual que en 0183, PERO con el bypass del desglose por ítem (0218).
  -- `app.items_ok` lo marca sincronizar_req_desde_items() justo alrededor de su UPDATE.
  if (new.req_tipo is distinct from old.req_tipo
      or new.req_cantidad is distinct from old.req_cantidad
      or new.req_urgencia is distinct from old.req_urgencia
      or new.personas_afectadas is distinct from old.personas_afectadas)
     and coalesce(current_setting('app.items_ok', true), '') <> '1' then
    v_campos := array_append(v_campos, 'cantidad');
  end if;

  if array_length(v_campos, 1) is null then
    return new;
  end if;

  update public.casos_verificacion_campo v
     set estado = 'sin_revisar',
         verificado_por = null,
         verificado_en = now(),
         nota = left(trim(coalesce(v.nota, '') || ' · (auto) el dato cambió; requiere re-verificación'), 500)
   where v.caso_id = new.id
     and v.campo = any(v_campos)
     and v.estado is distinct from 'sin_revisar';

  return new;
end;
$$;

-- El trigger trg_reset_verificacion_al_editar (0183) ya apunta a esta función; recrear
-- la función basta (el enlace es por nombre). Se deja el create por idempotencia.
drop trigger if exists trg_reset_verificacion_al_editar on public.casos;
create trigger trg_reset_verificacion_al_editar
  after update on public.casos
  for each row
  execute function public.reset_verificacion_al_editar();

comment on function public.reset_verificacion_al_editar() is
  'Semáforo por campo (0183): al editar un dato ya verificado, ese campo vuelve a 🟡. Desde 0218 la rama ''cantidad'' respeta el flag de sesión app.items_ok, que marca la denormalización del desglose por ítem — sin ese bypass, editar un ítem dejaría el caso fuera de Validado y por tanto no confirmable ni derivable.';

-- ═══ (6) RPC de escritura ═══
-- Alta y edición en la misma función: `p_item` nulo = alta (se calcula el `orden`),
-- `p_item` presente = edición. Devuelve el id del ítem.
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
  end if;

  -- Auditoría con entidad='casos': así el «Historial de cambios» del detalle (que filtra
  -- por entidad='casos') muestra el movimiento. El asiento FINO por ítem llega con 0219.
  perform public.registrar_auditoria(
    case when p_item is null then 'item_agregado' else 'item_editado' end,
    'casos', v_caso::text,
    jsonb_build_object('item', v_id, 'descripcion', v_desc, 'tipo', v_tipo,
                       'cantidad', p_cantidad, 'unidad', v_unidad));
  return v_id;
end $$;

revoke all on function public.guardar_item_caso(uuid, text, text, numeric, text, text, uuid) from public;
grant execute on function public.guardar_item_caso(uuid, text, text, numeric, text, text, uuid) to authenticated;

create or replace function public.eliminar_item_caso(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso uuid; v_desc text;
begin
  if not public.puede_gestionar_items_caso() then
    raise exception 'No tienes permiso para editar el desglose de la solicitud.' using errcode = '42501';
  end if;
  select i.caso_id, i.descripcion into v_caso, v_desc from public.casos_items i where i.id = p_item;
  if v_caso is null then return; end if;   -- idempotente: ya no está

  delete from public.casos_items where id = p_item;

  perform public.registrar_auditoria('item_eliminado', 'casos', v_caso::text,
    jsonb_build_object('item', p_item, 'descripcion', v_desc));
end $$;

revoke all on function public.eliminar_item_caso(uuid) from public;
grant execute on function public.eliminar_item_caso(uuid) to authenticated;

-- Reordenar: `p_items` es la lista de ids EN EL ORDEN DESEADO. Los ítems del caso que no
-- vengan en la lista conservan su `orden` (quedan al final, porque el alta siempre suma
-- max(orden)+1). Solo toca ítems del caso indicado.
create or replace function public.reordenar_items_caso(p_caso uuid, p_items uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puede_gestionar_items_caso() then
    raise exception 'No tienes permiso para editar el desglose de la solicitud.' using errcode = '42501';
  end if;
  if p_caso is null or p_items is null or coalesce(array_length(p_items, 1), 0) = 0 then
    return;
  end if;

  update public.casos_items i
     set orden = t.pos::int,
         actualizado_en = now()
    from (select u.id, u.ord as pos from unnest(p_items) with ordinality as u(id, ord)) t
   where i.id = t.id
     and i.caso_id = p_caso
     and i.orden is distinct from t.pos::int;

  perform public.registrar_auditoria('items_reordenados', 'casos', p_caso::text,
    jsonb_build_object('n', coalesce(array_length(p_items, 1), 0)));
end $$;

revoke all on function public.reordenar_items_caso(uuid, uuid[]) from public;
grant execute on function public.reordenar_items_caso(uuid, uuid[]) to authenticated;

-- ═══ (7) Realtime ═══
do $$ begin
  alter publication supabase_realtime add table public.casos_items;
exception when duplicate_object then null; end $$;
