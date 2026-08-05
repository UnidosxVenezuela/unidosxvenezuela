-- ============================================================
-- 0222 — Derivación SELECTIVA: se elige QUÉ ÍTEMS se envían a cada área
-- ------------------------------------------------------------
-- ANTES: derivar era todo o nada. `derivar_caso` (0177 → 0208) escribía UNA fila en
--   `casos_derivaciones` por área y el área receptora veía la solicitud ENTERA. Con el
--   desglose por ítem (0218) eso se quedó corto: una solicitud con cinco ítems no se
--   reparte —el agua y los colchones son de Logística, las medicinas hay que pedirlas a
--   una farmacéutica por Alianzas, y de la difusión solo interesa lo que sigue sin
--   cubrirse—. Hoy las tres áreas reciben lo mismo, trabajan sobre lo que no les toca y
--   nadie puede decir «este ítem se lo mandamos a Alianzas».
--
-- AHORA: al derivar se marcan los ítems que van a cada área. Cada área ve SOLO los suyos
--   y, en el seguimiento, cada ítem dice a qué área fue.
--
-- ── POR QUÉ UNA TABLA PUENTE Y NO UNA COLUMNA `item_id` EN `casos_derivaciones` ──
--   `idx_derivacion_caso_area` (0177) es UNIQUE(caso_id, area) y `derivar_caso` (0208)
--   hace `on conflict (caso_id, area) do update`: re-derivar la misma área ACTUALIZA la
--   fila (responsable/acción/prioridad/observaciones). Meter `item_id` ahí obligaría a
--   ampliar el índice único a (caso_id, area, item_id) y con eso el upsert dejaría de
--   ser «una tarea por área» para convertirse en N tareas por área — se romperían
--   `mis_derivaciones` (0202), la bandeja /mi-area, `tomar/avanzar/cerrar_derivacion`
--   (0177, que operan por `derivacion_id`), `seguimiento_casos` y el WHERE de
--   `casos_difusion` (0208: `exists (… d.area = 'redes')`).
--   Por eso el desglose va en `public.casos_derivacion_items(derivacion_id, item_id)` con
--   PK compuesta: el índice único, el upsert y la unidad de trabajo por área quedan
--   INTACTOS, y la selección de ítems se cuelga al lado.
--
-- ── NO EXISTE EL ÁREA 'redaccion' ──
--   `chk_derivacion_area` (0177) admite ('logistica','redes','donaciones','alianzas',
--   'coordinacion','otra'). «Derivar a Redacción» es el área **'redes'**; el otro carril,
--   `enviar_caso_redaccion()` (0167), es un cambio de `casos.estado`, no una derivación.
--   Inventar 'redaccion' aquí haría que la RPC lanzara 22023 en la primera llamada.
--
-- ── EL GATE DE VALIDACIÓN NO SE TOCA ──
--   `gate_derivacion_validada` (0177) es BEFORE INSERT sobre `casos_derivaciones` y exige
--   `caso_esta_validado(new.caso_id)` con errcode 23514 en CUALQUIER ruta —incluida la
--   inserción directa de `solicitar_cobertura_parcial` (0211)—. Se mantiene tal cual: la
--   validación sigue siendo POR CASO («el desglose completo está verificado», campo
--   'cantidad' del semáforo de 0172/0173, decisión explícita de 0218) y los ítems se
--   validan DENTRO de la RPC. Tocar el trigger obligaría a reescribirlo y a revisar 0211.
--
-- ── LA TRAMPA DEL TRIGGER DE LOGÍSTICA ──
--   `trg_crear_logistica_al_derivar` (0208) era AFTER **INSERT** únicamente. Re-derivar va
--   por el `do update` del upsert y NO disparaba el trigger, así que los ítems añadidos en
--   una segunda derivación no se proyectaban nunca. Se amplía a AFTER INSERT OR UPDATE,
--   con una guarda fina: solo actúa si `derivado_en` cambió —que es lo único que marca una
--   RE-DERIVACIÓN—, de modo que tomar/avanzar/cerrar la derivación (0177, que sí hacen
--   UPDATE) no reproyecten nada.
--   Aun así el trigger NO basta: se dispara ANTES de que la RPC escriba el puente (el
--   `derivacion_id` no existe hasta que la fila se inserta). Por eso `derivar_caso` llama
--   además a `solicitud_logistica_de_caso()` de forma EXPLÍCITA después de escribir la
--   selección. El helper es idempotente por caso, así que las dos rutas conviven.
--
-- ── QUÉ VE CADA ÁREA ──
--   · Logística → `items_de_caso_area(caso, 'logistica')` (RPC curada, misma forma que
--     `items_de_caso` de 0220/0221 + `n_desglose`).
--   · Redacción/Redes → la vista `public.casos_items_difusion`. Se crea NUEVA a propósito:
--     `casos_difusion` ya se reescribió cuatro veces (0189 → 0208 → 0209 → 0211) y cada
--     rewrite es un `drop view` + `create view` con las ~30 columnas copiadas a mano.
--     Ampliarla otra vez multiplicaría filas (una por ítem) y rompería a sus consumidores.
--     La vista nueva NO se apoya en `casos_difusion` —lo natural sería un join— porque un
--     `drop view if exists public.casos_difusion` en una migración futura fallaría con
--     «other objects depend on it». Replica su WHERE de visibilidad, con esta nota.
--   · Alianzas y las demás → la bandeja /mi-area, vía `mis_derivaciones()`, que ahora
--     devuelve los ítems enviados a esa derivación.
--
-- ── DEGRADACIÓN (lo que pasa con lo ya derivado) ──
--   Puente VACÍO para una derivación = «se derivó la solicitud completa». Todo lo derivado
--   antes de esta migración, y toda llamada que no mande ítems (0211 inserta su derivación
--   a 'redes' directamente), sigue comportándose EXACTAMENTE como antes: el área ve el
--   desglose entero. Nunca hay un área que se quede a cero filas en silencio.
--
-- ENUM-SAFETY: cero valores de enum nuevos y ninguna tabla con enum propio. La tabla
--   puente solo tiene claves ajenas.
--
-- ── DE PASO, UN AGUJERO QUE SE CIERRA AQUÍ ──
--   `solicitud_logistica_de_caso()` (0208) se creó sin `revoke ... from public`, así que
--   conservaba el EXECUTE por defecto de PUBLIC. Al ser SECURITY DEFINER y devolver void,
--   PostgREST la exponía como RPC a `anon`: cualquiera podía crear una `solicitudes_insumo`
--   saltándose la RLS y disparar el aviso a Logística. Esta migración la reescribe (y le
--   añade un UPDATE), así que le emite el `revoke` que le faltaba. Ver §(4).
--
-- Idempotente. Ejecutar tras 0221.
-- ============================================================

-- ═══ (1) La tabla puente ═══
create table if not exists public.casos_derivacion_items (
  derivacion_id uuid not null references public.casos_derivaciones(id) on delete cascade,
  item_id       uuid not null references public.casos_items(id)        on delete cascade,
  creado_por    uuid references public.perfiles(id) on delete set null,
  creado_en     timestamptz not null default now(),
  primary key (derivacion_id, item_id)
);
-- Para la pregunta inversa —«¿a qué áreas fue este ítem?»—, que es la del seguimiento.
create index if not exists idx_deriv_items_item on public.casos_derivacion_items (item_id);

comment on table public.casos_derivacion_items is
  'Qué ÍTEMS del desglose (0218) se enviaron en cada derivación (0222). PK compuesta (derivacion_id, item_id): NO se toca idx_derivacion_caso_area ni el upsert on conflict (caso_id, area) de derivar_caso, así que la unidad de trabajo por área sigue siendo UNA fila de casos_derivaciones. Puente vacío = la derivación es de la solicitud COMPLETA (comportamiento anterior a 0222, y el de todo lo ya derivado). Escritura solo por derivar_caso.';

-- ═══ (2) RLS — lectura para cuentas verificadas; escritura solo por RPC ═══
alter table public.casos_derivacion_items enable row level security;

-- SELECT: `es_verificado()` y NUNCA un `exists (select 1 from public.casos …)`. Desde
-- 0180 Redacción/Redes no leen `casos`: esa policy les devolvería CERO filas sin ningún
-- error visible —el modo de fallo dominante del repo— y con ello la vista de ítems
-- derivados se les quedaría vacía justo a ellos. Mismo criterio que `citems_select`
-- (0218), `citems_hist_select` (0219) y `citem_aportes_select` (0221). La fila no lleva
-- más información que dos claves ajenas.
drop policy if exists cderiv_items_select on public.casos_derivacion_items;
create policy cderiv_items_select on public.casos_derivacion_items for select to authenticated
  using (public.es_admin() or public.es_verificado());

-- INSERT / UPDATE / DELETE: SIN policy, a propósito (deny-by-default con RLS activa).
-- Los `drop … if exists` limpian cualquier policy suelta de un entorno de pruebas.
drop policy if exists cderiv_items_insert on public.casos_derivacion_items;
drop policy if exists cderiv_items_update on public.casos_derivacion_items;
drop policy if exists cderiv_items_delete on public.casos_derivacion_items;

grant select on public.casos_derivacion_items to authenticated;

-- ═══ (3) Helpers de lectura de la selección ═══
-- ¿Qué ítems se le enviaron a un área? Devuelve NULL cuando la derivación no tiene
-- selección explícita (o no existe): NULL significa «toda la solicitud», que es distinto
-- de un array vacío. Interna (sin grant): la usan la proyección a Logística y las RPC
-- curadas de más abajo, que sí llevan su propio gate.
create or replace function public.items_derivados_a_area(p_caso uuid, p_area text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select nullif(
           coalesce(
             (select array_agg(x.item_id order by i.orden, i.creado_en)
                from public.casos_derivacion_items x
                join public.casos_derivaciones d on d.id = x.derivacion_id
                join public.casos_items i        on i.id = x.item_id
               where d.caso_id = p_caso
                 and d.area = lower(btrim(coalesce(p_area, '')))),
             '{}'::uuid[]),
           '{}'::uuid[]);
$$;

revoke all on function public.items_derivados_a_area(uuid, text) from public;
-- Sin grant a `authenticated`: interna.

comment on function public.items_derivados_a_area(uuid, text) is
  'Ítems del desglose enviados a un área concreta (0222), en el orden del desglose. NULL = la derivación no tiene selección explícita, es decir, se derivó la solicitud COMPLETA (o no hay derivación a esa área). Interna: la usan la proyección a Logística y las RPC curadas.';

-- Proyección agregada de un subconjunto del desglose a los escalares de siempre
-- (`tipo` + texto de cantidad). Es el mismo formateo que `sincronizar_req_desde_items`
-- (0218) —«50 cajas de agua · 200 raciones»— aplicado a la SELECCIÓN en vez de a todo el
-- desglose. Se deja duplicado a propósito en vez de refactorizar 0218: aquella función
-- está verificada y su contrato (denormalizar TODO el desglose a `casos.req_*`) es otro.
--   · `p_items` NULL → todo el desglose del caso (idéntico a 0218).
--   · No filtra por estado, igual que 0218: así, sin selección, el texto que se proyecta
--     a Logística coincide exactamente con `casos.req_cantidad`.
create or replace function public.proyeccion_items_caso(p_caso uuid, p_items uuid[] default null)
returns table (n int, tipo public.tipo_insumo, texto text)
language plpgsql stable security definer set search_path = public as $$
declare v_n int; v_tipos int; v_tipo public.tipo_insumo; v_texto text;
begin
  select count(*), count(distinct i.tipo) into v_n, v_tipos
    from public.casos_items i
   where i.caso_id = p_caso
     and (p_items is null or i.id = any(p_items));

  if coalesce(v_n, 0) = 0 then
    return query select 0, null::public.tipo_insumo, null::text;
    return;
  end if;

  if v_tipos = 1 then
    select i.tipo into v_tipo from public.casos_items i
     where i.caso_id = p_caso and (p_items is null or i.id = any(p_items)) limit 1;
  else
    v_tipo := 'otro'::public.tipo_insumo;   -- varios tipos: el escalar ya no representa el desglose
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
         and (p_items is null or i.id = any(p_items))
    ) x;

  return query select v_n, v_tipo, v_texto;
end $$;

revoke all on function public.proyeccion_items_caso(uuid, uuid[]) from public;
-- Sin grant a `authenticated`: interna.

comment on function public.proyeccion_items_caso(uuid, uuid[]) is
  'Agrega un subconjunto del desglose (0222) a los escalares de siempre: nº de ítems, tipo único (o «otro» si hay varios) y el texto «50 cajas de agua · 200 raciones». Mismo formateo que sincronizar_req_desde_items (0218), pero sobre la SELECCIÓN derivada. p_items NULL = todo el desglose. Interna.';

-- ═══ (4) La proyección a Logística — ahora solo con lo que se le derivó ═══
-- Reescrita COMPLETA desde 0208 (mismos campos, misma auditoría, mismos avisos) con dos
-- cambios:
--   · `tipo`/`cantidad` salen del DESGLOSE DERIVADO A LOGÍSTICA cuando hay selección; sin
--     selección se usan los escalares del caso, exactamente como antes.
--   · Sigue siendo IDEMPOTENTE POR CASO (`uq_solins_caso`, 0113: una solicitud de insumo
--     por caso), pero ya no se limita a `return`: si la solicitud existe y la derivación
--     cambió, ACTUALIZA la proyección. Sin esto, ampliar la selección en una segunda
--     derivación no se reflejaba en ninguna parte.
--     El UPDATE nunca toca `estado`, así que no despierta a `auditar_estado_insumo`
--     (0210, BEFORE UPDATE OF estado), `gate_entrega_completa` (0221), `cerrar_caso_al_entregar`
--     (0114/0116/0221) ni `insig_entrega` (0165) — todos son `update of estado`. Y no
--     reproyecta sobre una solicitud ya entregada o cancelada: lo entregado no se reescribe.
create or replace function public.solicitud_logistica_de_caso(p_caso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caso   record;
  v_sol    record;
  v_sel    uuid[];
  v_proy   record;
  v_tipo   public.tipo_insumo;
  v_cant   text;
  v_nuevo  uuid;
begin
  select id, titulo, descripcion, req_tipo, req_cantidad, req_urgencia, creado_por, categoria
    into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then return; end if;
  if v_caso.categoria is not distinct from 'Desaparecidos' then return; end if;

  -- Qué ítems se le derivaron a Logística (NULL = la solicitud completa).
  v_sel := public.items_derivados_a_area(p_caso, 'logistica');
  select * into v_proy from public.proyeccion_items_caso(p_caso, v_sel);

  if coalesce(v_proy.n, 0) > 0 then
    v_tipo := coalesce(v_proy.tipo, v_caso.req_tipo, 'otro'::public.tipo_insumo);
    v_cant := coalesce(v_proy.texto, v_caso.req_cantidad);
  else
    v_tipo := coalesce(v_caso.req_tipo, 'otro'::public.tipo_insumo);
    v_cant := v_caso.req_cantidad;
  end if;

  select s.id, s.estado into v_sol from public.solicitudes_insumo s where s.caso_id = p_caso;

  if v_sol.id is not null then
    -- Ya existe (uq_solins_caso): se REPROYECTA, no se duplica. Solo si de verdad hay
    -- desglose y la solicitud sigue abierta.
    if coalesce(v_proy.n, 0) > 0
       and v_sol.estado::text not in ('entregado', 'cancelado') then
      update public.solicitudes_insumo s
         set tipo           = v_tipo,
             cantidad       = v_cant,
             actualizado_en = now()
       where s.id = v_sol.id
         and (s.tipo is distinct from v_tipo or s.cantidad is distinct from v_cant);
    end if;
    return;
  end if;

  insert into public.solicitudes_insumo
    (titulo, tipo, descripcion, cantidad, urgencia, estado, solicitado_por, caso_id)
  values (
    v_caso.titulo,
    v_tipo,
    v_caso.descripcion,
    v_cant,
    coalesce(v_caso.req_urgencia, 'media'::public.prioridad),
    'solicitado'::public.estado_insumo,
    v_caso.creado_por,
    p_caso
  ) returning id into v_nuevo;

  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'casos:derivado_logistica', 'casos', p_caso::text,
          jsonb_build_object('solicitud_id', v_nuevo, 'items', coalesce(v_proy.n, 0),
                             'seleccion', v_sel is not null));

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'insumo_nuevo', 'Nueva solicitud en Logística',
         'Una solicitud verificada entró para coordinar su entrega.'
           || case when coalesce(v_proy.n, 0) > 0 and v_sel is not null
                   then ' Se derivaron ' || v_proy.n || ' ítem(s) del desglose.' else '' end,
         '/insumos/' || v_nuevo
  from public.perfiles p
  where p.rol in ('logistica'::public.rol_usuario, 'admin_logistica'::public.rol_usuario)
     or 'logistica'::public.rol_usuario       = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]))
     or 'admin_logistica'::public.rol_usuario = any(coalesce(p.roles_extra, '{}'::public.rol_usuario[]));
end $$;

-- AGUJERO HEREDADO DE 0208, QUE ESTA MIGRACIÓN CIERRA: la función nació con
-- `create or replace` y SIN `revoke ... from public`, así que conservaba el EXECUTE por
-- defecto de PUBLIC. Es SECURITY DEFINER y `returns void`, de modo que PostgREST la
-- exponía como RPC a `anon`: cualquiera podía llamar
-- `POST /rest/v1/rpc/solicitud_logistica_de_caso` con un caso_id y CREAR una
-- `solicitudes_insumo` saltándose la RLS, más el aviso a todo el equipo de Logística
-- (verificado empíricamente: `set role anon` la ejecuta y deja la fila).
-- Desde 0222 la función además ACTUALIZA `tipo`/`cantidad` de una solicitud existente, así
-- que la superficie era mayor. No se le concede a `authenticated`: sus DOS únicos llamadores
-- —el trigger `crear_logistica_al_derivar` y la RPC `derivar_caso`— son SECURITY DEFINER
-- propiedad del dueño del esquema y la siguen ejecutando sin problema.
revoke all on function public.solicitud_logistica_de_caso(uuid) from public;

comment on function public.solicitud_logistica_de_caso(uuid) is
  'Crea (o REPROYECTA) la solicitud de insumo de un caso derivado a Logística. INTERNA: sin EXECUTE para public ni para authenticated (0222 cierra el agujero de 0208, que la dejaba llamable por `anon` vía PostgREST); la invocan solo el trigger crear_logistica_al_derivar y derivar_caso, ambos SECURITY DEFINER. Desde 0222 su tipo/cantidad salen de los ÍTEMS derivados a ''logistica'' cuando hay selección; sin selección, de los escalares del caso, exactamente como en 0208. Sigue siendo idempotente por caso (uq_solins_caso): si ya existe, actualiza la proyección en vez de crear otra, y nunca toca `estado` ni reescribe una entrega ya cerrada.';

-- El trigger se amplía a INSERT **OR UPDATE** (antes solo INSERT): re-derivar va por el
-- `do update` del upsert y no disparaba nada. La guarda `derivado_en` distingue una
-- RE-DERIVACIÓN de los UPDATE de trabajo (tomar / avanzar / cerrar, 0177), que no la tocan.
create or replace function public.crear_logistica_al_derivar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.area is distinct from 'logistica' then
    return new;
  end if;
  -- tomar_derivacion / avanzar_derivacion / cerrar_derivacion no mueven `derivado_en`.
  if tg_op = 'UPDATE' and new.derivado_en is not distinct from old.derivado_en then
    return new;
  end if;
  perform public.solicitud_logistica_de_caso(new.caso_id);
  return new;
end $$;

drop trigger if exists trg_crear_logistica_al_derivar on public.casos_derivaciones;
create trigger trg_crear_logistica_al_derivar
  after insert or update on public.casos_derivaciones
  for each row execute function public.crear_logistica_al_derivar();

comment on function public.crear_logistica_al_derivar() is
  'Al derivar (o RE-derivar, 0222) a ''logistica'', crea o reproyecta su solicitud de insumo. Ampliado de AFTER INSERT a AFTER INSERT OR UPDATE porque re-derivar va por el upsert; la guarda de `derivado_en` evita que tomar/avanzar/cerrar la derivación reproyecten nada. Como el trigger corre ANTES de que derivar_caso escriba el puente de ítems, la RPC vuelve a llamar al helper de forma explícita.';

-- ═══ (5) derivar_caso — 0208 VERBATIM + la selección de ítems ═══
-- Cambia la firma (entra `p_items uuid[]` en tercera posición), así que hay que soltar la
-- vieja de forma explícita: si no, conviven dos `derivar_caso` y PostgREST puede resolver
-- la equivocada. El cuerpo es el de 0208 palabra por palabra —gate, validaciones, upsert,
-- avisos con anti-spam de 6 h y AUTO-CONFIRMACIÓN (#3)— más el bloque del puente.
--
-- Contrato de `p_items`:
--   · NULL o array vacío → NO se toca el puente. La derivación es de la solicitud
--     COMPLETA y una re-derivación sin ítems CONSERVA la selección anterior (útil para
--     cambiar solo la prioridad o el responsable sin repetir el desglose).
--   · Con ids → la selección se REEMPLAZA por exactamente esos ítems, en TODAS las áreas
--     de esta llamada. Para mandar ítems distintos a áreas distintas se llama una vez por
--     grupo de áreas (es lo que hace la interfaz).
drop function if exists public.derivar_caso(uuid, text[], uuid, text, text, text);

create or replace function public.derivar_caso(
  p_caso uuid,
  p_areas text[],
  p_items uuid[] default null,
  p_responsable uuid default null,
  p_accion text default null,
  p_prioridad text default 'media',
  p_observaciones text default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_caso   record;
  v_area   text;
  v_prio   text;
  v_accion text;
  v_obs    text;
  v_roles  public.rol_usuario[];
  v_n      int := 0;
  v_items  uuid[];
  v_nit    int := 0;
  v_deriv  uuid;
  v_it     uuid;
  v_estado text;
begin
  -- Solo Verificación / Coordinación derivan (Paso 9: «Verificación selecciona»).
  if not (public.es_admin() or public.puede_verificar()) then
    raise exception 'No tienes permiso para derivar solicitudes' using errcode = '42501';
  end if;

  select id, titulo, estado, categoria into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  if v_caso.estado::text = 'falso' then
    raise exception 'No se puede derivar una solicitud descartada' using errcode = '22023';
  end if;

  -- Regla institucional crítica (Paso 9): SOLO casos Validados, bajo ninguna
  -- circunstancia se deriva un caso 🟡 o 🔴.
  if not public.caso_esta_validado(p_caso) then
    raise exception 'No se puede derivar: la solicitud no está Validada. Completá la verificación (todos los campos del semáforo en verde) antes de derivar.'
      using errcode = '42501';
  end if;

  v_prio := lower(coalesce(nullif(trim(p_prioridad), ''), 'media'));
  if v_prio not in ('alta','media','baja') then v_prio := 'media'; end if;
  v_accion := nullif(trim(coalesce(p_accion, '')), '');
  v_obs    := nullif(trim(coalesce(p_observaciones, '')), '');

  -- (0222) Selección de ítems: se normaliza (sin nulos, sin repetidos) y se valida ANTES
  -- de tocar nada, para que una selección equivocada no deje media derivación hecha.
  select array_agg(distinct x) into v_items
    from unnest(coalesce(p_items, '{}'::uuid[])) x where x is not null;
  if v_items is not null and coalesce(array_length(v_items, 1), 0) > 0 then
    foreach v_it in array v_items loop
      select i.estado into v_estado
        from public.casos_items i where i.id = v_it and i.caso_id = p_caso;
      if v_estado is null then
        raise exception 'Uno de los ítems seleccionados no pertenece a esta solicitud.'
          using errcode = '22023';
      end if;
      if v_estado = 'cancelado' then
        raise exception 'No se puede derivar un ítem cancelado: ya no se está pidiendo.'
          using errcode = '22023';
      end if;
    end loop;
    v_nit := array_length(v_items, 1);
  else
    v_items := null;   -- sin selección = la solicitud completa (contrato de la cabecera)
  end if;

  foreach v_area in array coalesce(p_areas, '{}'::text[]) loop
    if v_area is null or trim(v_area) = '' then continue; end if;
    if v_area not in ('logistica','redes','donaciones','alianzas','coordinacion','otra') then
      raise exception 'Área de destino no válida: %', v_area using errcode = '22023';
    end if;

    insert into public.casos_derivaciones
      (caso_id, area, responsable_id, accion, prioridad, observaciones, estado, derivado_por, derivado_en, actualizado_en)
    values
      (p_caso, v_area, p_responsable, v_accion, v_prio, v_obs, 'sin_tomar', auth.uid(), now(), now())
    on conflict (caso_id, area) do update
      set responsable_id = excluded.responsable_id,
          accion         = excluded.accion,
          prioridad      = excluded.prioridad,
          observaciones  = excluded.observaciones,
          derivado_por   = excluded.derivado_por,
          derivado_en    = now(),
          actualizado_en = now()
    returning id into v_deriv;

    -- (0222) El puente: la selección REEMPLAZA a la anterior de esa área.
    if v_items is not null then
      delete from public.casos_derivacion_items x
       where x.derivacion_id = v_deriv and x.item_id <> all(v_items);
      insert into public.casos_derivacion_items (derivacion_id, item_id, creado_por)
        select v_deriv, u, auth.uid() from unnest(v_items) u
      on conflict (derivacion_id, item_id) do nothing;
    end if;

    -- (0222) Logística proyecta el desglose DERIVADO a su solicitud de insumo. El trigger
    -- trg_crear_logistica_al_derivar ya corrió, pero ANTES de escribir el puente (el
    -- derivacion_id no existía); esta llamada explícita es la que ve la selección real.
    -- El helper es idempotente por caso, así que llamarlo dos veces no duplica nada.
    if v_area = 'logistica' then
      perform public.solicitud_logistica_de_caso(p_caso);
    end if;

    -- Aviso al área destino (anti-spam de 6 h por caso; el webhook 0060 empuja el push).
    v_roles := public.roles_area_derivacion(v_area);
    insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
    select p.id, 'caso_derivado',
           'Nueva derivación a ' || public.etiqueta_area_derivacion(v_area),
           'Se derivó una solicitud Validada: «' || coalesce(v_caso.titulo, 'solicitud') || '».'
             || case when v_nit > 0 then ' ' || v_nit || ' ítem(s) del desglose.' else '' end
             || case when v_accion is not null then ' Acción: ' || v_accion || '.' else '' end,
           '/casos?caso=' || p_caso
    from public.perfiles p
    where p.verificado
      and p.id is distinct from auth.uid()
      and (p.rol = any(v_roles) or p.roles_extra && v_roles)
      and not exists (
        select 1 from public.notificaciones n
        where n.destinatario_id = p.id
          and n.tipo = 'caso_derivado'
          and n.enlace = '/casos?caso=' || p_caso
          and n.creado_en > now() - interval '6 hours'
      );

    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'Debes elegir al menos un área de destino' using errcode = '22023';
  end if;

  -- #3 — Auto-confirmación: al derivar una solicitud VALIDADA que sigue sin confirmar,
  -- pásala a 'confirmado' para que aparezca en las áreas de destino (casos_select /
  -- casos_difusion filtran por estado). Excepto 'Desaparecidos' (decisión 6: su flujo de
  -- confirmación es de Búsqueda). El UPDATE pasa el candado gate_confirmacion_caso (ya está
  -- Validada, no lo debilita). El traslado/estado manual (cambiarEstadoCaso) se conserva.
  if v_caso.categoria is distinct from 'Desaparecidos'
     and v_caso.estado::text not in ('confirmado','enviado_redaccion','resuelto') then
    update public.casos set estado = 'confirmado', actualizado_en = now() where id = p_caso;
  end if;

  perform public.registrar_auditoria('derivar_caso', 'casos', p_caso::text,
    jsonb_build_object('areas', p_areas, 'prioridad', v_prio,
                       'items', v_nit,
                       'items_ids', to_jsonb(coalesce(v_items, '{}'::uuid[]))));
  return v_n;
end $$;

revoke all on function public.derivar_caso(uuid, text[], uuid[], uuid, text, text, text) from public;
grant execute on function public.derivar_caso(uuid, text[], uuid[], uuid, text, text, text) to authenticated;

comment on function public.derivar_caso(uuid, text[], uuid[], uuid, text, text, text) is
  'Deriva una solicitud VALIDADA a una o varias áreas (0177 → 0208) eligiendo además QUÉ ÍTEMS del desglose van (0222, p_items). Sin p_items la derivación es de la solicitud completa y la selección anterior se conserva. Los ítems se validan aquí (pertenencia al caso y que no estén cancelados); el gate de «solo casos Validados» sigue siendo POR CASO, en gate_derivacion_validada (0177), que no se toca. Para mandar ítems distintos a áreas distintas, se llama una vez por grupo de áreas.';

-- ═══ (6) items_de_caso_area — lo que ve el área receptora, y SOLO eso ═══
-- Misma forma que `items_de_caso` (0220 → rellenada en 0221) para que las pantallas y el
-- componente `ItemsSemaforo` no cambien, más `n_desglose`: cuántos ítems tiene el caso en
-- total, para poder decir «te derivaron 2 de 5». Gate `es_verificado()` con retorno VACÍO
-- (no excepción), igual que `items_de_caso` y `seguimiento_casos` (0209): la página degrada
-- sin romperse. Sin selección explícita devuelve TODO el desglose (ver «degradación» en la
-- cabecera): un área nunca se queda a cero filas por una migración recién aplicada.
create or replace function public.items_de_caso_area(p_caso uuid, p_area text)
returns table (
  id          uuid,
  orden       int,
  tipo        text,
  descripcion text,
  cantidad    numeric,
  unidad      text,
  estado      text,
  cubierto    numeric,
  pct         numeric,
  n_desglose  int
)
language plpgsql stable security definer set search_path = public as $$
declare v_sel uuid[]; v_total int;
begin
  if p_caso is null or not public.es_verificado() then
    return;
  end if;

  v_sel := public.items_derivados_a_area(p_caso, p_area);
  select count(*)::int into v_total from public.casos_items i where i.caso_id = p_caso;

  return query
    select i.id,
           i.orden,
           i.tipo::text,
           i.descripcion,
           i.cantidad,
           i.unidad,
           i.estado,
           coalesce(a.suma, 0)::numeric as cubierto,
           case when i.cantidad is null or i.cantidad <= 0 then null
                else least(100, round(coalesce(a.suma, 0) / i.cantidad * 100, 1)) end as pct,
           v_total as n_desglose
      from public.casos_items i
      left join lateral (
        select sum(x.cantidad) as suma
          from public.casos_item_aportes x
         where x.item_id = i.id
      ) a on true
     where i.caso_id = p_caso
       and (v_sel is null or i.id = any(v_sel))
     order by i.orden, i.creado_en;
end $$;

revoke all on function public.items_de_caso_area(uuid, text) from public;
grant execute on function public.items_de_caso_area(uuid, text) to authenticated;

comment on function public.items_de_caso_area(uuid, text) is
  'Desglose por ítem CURADO acotado a lo que se DERIVÓ a un área (0222). Misma forma que items_de_caso (0220/0221) + n_desglose (total de ítems del caso, para decir «2 de 5»). Sin selección explícita devuelve todo el desglose. Sin contacto ni PII; gate es_verificado() con retorno vacío.';

-- ═══ (7) casos_items_difusion — el desglose que le toca a Redacción/Redes ═══
-- Vista NUEVA (no se amplía `casos_difusion`, ver cabecera). `security_invoker = false`,
-- igual que `casos_difusion` y `casos_adjuntos_difusion`: la vista corre con los permisos
-- de su dueño y aplica el gate por rol EN EL WHERE, que es el molde de la casa.
-- El WHERE de visibilidad del caso es una COPIA del de `casos_difusion` (0208 → 0211): se
-- duplica a propósito para no crear una dependencia que haría fallar el `drop view if
-- exists public.casos_difusion` de una migración futura con «other objects depend on it».
drop view if exists public.casos_items_difusion;
create view public.casos_items_difusion
  with (security_invoker = false) as
  select
    i.id,
    i.caso_id,
    i.orden,
    i.tipo::text as tipo,
    i.descripcion,
    i.cantidad,
    i.unidad,
    i.cantidad_texto,
    i.estado,
    coalesce(a.suma, 0)::numeric         as cubierto,
    coalesce(a.suma_tercero, 0)::numeric as cubierto_tercero,
    case when i.cantidad is null or i.cantidad <= 0 then null
         else least(100, round(coalesce(a.suma, 0) / i.cantidad * 100, 1)) end as pct,
    d.id          as derivacion_id,
    d.derivado_en as derivado_en,
    d.estado      as derivacion_estado,
    -- false = a Redes le llegó la solicitud completa (sin selección o sin derivación).
    (d.id is not null and exists (
       select 1 from public.casos_derivacion_items x where x.derivacion_id = d.id)) as seleccionado
  from public.casos_items i
  join public.casos c on c.id = i.caso_id
  left join public.casos_derivaciones d
    on d.caso_id = i.caso_id and d.area = 'redes'
  left join lateral (
    select sum(x.cantidad)                                     as suma,
           sum(x.cantidad) filter (where x.origen = 'tercero') as suma_tercero
      from public.casos_item_aportes x
     where x.item_id = i.id
  ) a on true
  where c.categoria is distinct from 'Desaparecidos'
    and (
      c.publicado_en is not null
      or c.requiere_difusion
      or c.estado::text = 'enviado_redaccion'
      or exists (select 1 from public.casos_derivaciones dd where dd.caso_id = c.id and dd.area = 'redes')
    )
    -- Ruteo por ÍTEM (0222): si la derivación a 'redes' trae selección, solo esos ítems.
    and (
      d.id is null
      or not exists (select 1 from public.casos_derivacion_items x where x.derivacion_id = d.id)
      or exists (select 1 from public.casos_derivacion_items x where x.derivacion_id = d.id and x.item_id = i.id)
    )
    and public.es_verificado()
    and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'));

grant select on public.casos_items_difusion to authenticated;

comment on view public.casos_items_difusion is
  'Desglose por ítem para Redacción/Redes (0222): solo los ítems DERIVADOS al área ''redes'' de los casos que ya son visibles en casos_difusion, con su estado y su cobertura (incluido cuánto puso un TERCERO, 0221 — lo que un tercero cubrió no hace falta difundirlo). Sin contacto ni PII. Vista aparte a propósito: casos_difusion ya se reescribió cuatro veces (0189 → 0208 → 0209 → 0211) y ampliarla multiplicaría sus filas. No depende de casos_difusion para no bloquear su próximo drop/create.';

-- ═══ (8) mis_derivaciones — la bandeja de área, ahora con SUS ítems ═══
-- Cambia el tipo de retorno (se añaden tres columnas al final), así que va con
-- `drop function` + recreación + revoke/grant. Cuerpo de 0202 VERBATIM más:
--   · `n_desglose` — ítems que tiene el caso.
--   · `n_items`    — ítems derivados a ESTA área (0 = la solicitud completa).
--   · `items`      — el detalle curado de esos ítems, para pintarlos sin otra consulta.
-- Sin datos de contacto ni PII, igual que el resto de la RPC.
drop function if exists public.mis_derivaciones();
create function public.mis_derivaciones()
returns table (
  id             uuid,
  caso_id        uuid,
  area           text,
  accion         text,
  prioridad      text,
  observaciones  text,
  estado         text,
  derivado_en    timestamptz,
  tomado_por     uuid,
  tomado_en      timestamptz,
  caso_numero    bigint,   -- casos.numero es bigint (identity); debe coincidir con el tipo real
  caso_titulo    text,
  caso_estado    text,
  caso_categoria text,
  personas_afectadas int,
  n_desglose     int,
  n_items        int,
  items          jsonb
) language sql stable security definer set search_path = public as $$
  select d.id, d.caso_id, d.area, d.accion, d.prioridad, d.observaciones, d.estado,
         d.derivado_en, d.tomado_por, d.tomado_en,
         c.numero, c.titulo, c.estado::text, c.categoria, c.personas_afectadas,
         (select count(*)::int from public.casos_items i where i.caso_id = c.id),
         (select count(*)::int from public.casos_derivacion_items x where x.derivacion_id = d.id),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', i.id, 'orden', i.orden, 'tipo', i.tipo::text,
                    'descripcion', i.descripcion, 'cantidad', i.cantidad,
                    'unidad', i.unidad, 'cantidad_texto', i.cantidad_texto, 'estado', i.estado)
                  order by i.orden, i.creado_en)
             from public.casos_derivacion_items x
             join public.casos_items i on i.id = x.item_id
            where x.derivacion_id = d.id), '[]'::jsonb)
  from public.casos_derivaciones d
  join public.casos c on c.id = d.caso_id
  where public.puede_operar_area_derivacion(d.area)   -- sólo las áreas que opera el usuario
    and d.estado <> 'cerrada'                          -- la bandeja = trabajo abierto
    and c.categoria is distinct from 'Desaparecidos'   -- categoría restringida, flujo aparte
  order by
    case d.prioridad when 'alta' then 0 when 'media' then 1 else 2 end,
    case d.estado when 'sin_tomar' then 0 when 'tomada' then 1 else 2 end,
    d.derivado_en;
$$;

revoke all on function public.mis_derivaciones() from public;
grant execute on function public.mis_derivaciones() to authenticated;

comment on function public.mis_derivaciones() is
  'Bandeja «Mi área» (0202): las derivaciones abiertas de las áreas que opera el usuario, con los datos mínimos del caso. Desde 0222 devuelve además qué ÍTEMS del desglose se le enviaron a esa área (n_items = 0 → la solicitud completa) y cuántos tiene el caso en total (n_desglose). Sin contacto ni PII.';

-- ═══ (9) La regla de cierre de 0221, ahora consciente del reparto ═══
-- CONSECUENCIA DIRECTA DE ESTA MIGRACIÓN, y hay que arreglarla aquí o P8 rompe P5:
-- `gate_entrega_completa` (0221) impide poner una solicitud de insumo en 'entregado'
-- mientras queden ítems del CASO sin cubrir. En cuanto Verificación reparte el desglose
-- —dos ítems a Logística y tres a Alianzas—, Logística no podría cerrar NUNCA su entrega
-- sin forzarla como «parcial», aunque hubiese entregado todo lo que se le pidió.
--
-- Se resuelve con una SOBRECARGA de `cobertura_items_caso` acotada a un área (arity
-- distinta: la de un argumento, que ya usan la reportería y el cierre del caso, no se
-- toca ni se dropea). Reglas del reparto:
--   · La ENTREGA de la solicitud de insumo se mide contra lo derivado a 'logistica'.
--   · El CASO se resuelve solo si está cubierto TODO el desglose: `cerrar_caso_al_entregar`
--     sigue usando la versión por caso. Así puede pasar —y es lo correcto— que Logística
--     cierre su entrega como COMPLETA y el caso siga abierto porque Alianzas aún debe las
--     medicinas: el aviso «tu caso fue atendido» no sale antes de tiempo.
--   · Sin selección (todo lo derivado antes de 0222, o una derivación sin ítems) la
--     sobrecarga devuelve exactamente lo mismo que la versión por caso.
create or replace function public.cobertura_items_caso(p_caso uuid, p_area text)
returns table (
  n_items          int,
  n_cumplidos      int,
  n_terceros       int,
  total            numeric,
  cubierto         numeric,
  cubierto_tercero numeric,
  pct              numeric,
  pct_items        numeric
)
language sql stable security definer set search_path = public as $$
  with sel as (
    select public.items_derivados_a_area(p_caso, p_area) as ids
  ), it as (
    select i.id, i.cantidad, i.estado
      from public.casos_items i, sel
     where i.caso_id = p_caso
       and i.estado <> 'cancelado'
       and (sel.ids is null or i.id = any(sel.ids))
  ), ap as (
    select a.item_id,
           sum(a.cantidad)                                     as suma,
           sum(a.cantidad) filter (where a.origen = 'tercero')  as suma_tercero
      from public.casos_item_aportes a
      join it on it.id = a.item_id
     group by a.item_id
  ), j as (
    select it.id, it.cantidad, it.estado,
           coalesce(ap.suma, 0)         as suma,
           coalesce(ap.suma_tercero, 0) as suma_tercero
      from it left join ap on ap.item_id = it.id
  )
  select
    count(*)::int,
    count(*) filter (where j.estado = 'cumplido')::int,
    count(*) filter (where j.suma_tercero > 0)::int,
    coalesce(sum(j.cantidad)                        filter (where j.cantidad > 0), 0)::numeric,
    coalesce(sum(least(j.suma, j.cantidad))         filter (where j.cantidad > 0), 0)::numeric,
    coalesce(sum(least(j.suma_tercero, j.cantidad)) filter (where j.cantidad > 0), 0)::numeric,
    case when coalesce(sum(j.cantidad) filter (where j.cantidad > 0), 0) > 0
         then round(100 * coalesce(sum(least(j.suma, j.cantidad)) filter (where j.cantidad > 0), 0)
                        / sum(j.cantidad) filter (where j.cantidad > 0), 1)
         else null end,
    case when count(*) > 0
         then round(100.0 * count(*) filter (where j.estado = 'cumplido') / count(*), 1)
         else null end
  from j;
$$;

revoke all on function public.cobertura_items_caso(uuid, text) from public;
-- Sin grant a `authenticated`, igual que la de un argumento (0221): interna.

comment on function public.cobertura_items_caso(uuid, text) is
  'Cobertura agregada del desglose de un caso ACOTADA a lo derivado a un área (0222). Sobrecarga de la de 0221 —que sigue midiendo el caso ENTERO y la usa el cierre del caso—. Sin selección explícita devuelve lo mismo que aquella. Interna: sin gate y sin grant.';

-- `gate_entrega_completa` — cuerpo de 0221 VERBATIM, con la cobertura acotada a Logística.
create or replace function public.gate_entrega_completa()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_c record;
begin
  if new.estado::text = 'entregado' and old.estado::text is distinct from 'entregado' then
    -- Entrega parcial consciente (entregar_solicitud_insumo con p_forzar) o administración.
    if coalesce(current_setting('app.entrega_parcial_ok', true), '') = '1' or public.es_admin() then
      return new;
    end if;
    if new.caso_id is null then return new; end if;

    -- (0222) Se mide contra lo que se DERIVÓ A LOGÍSTICA, no contra todo el desglose.
    select * into v_c from public.cobertura_items_caso(new.caso_id, 'logistica');
    if coalesce(v_c.n_items, 0) > 0 and coalesce(v_c.n_cumplidos, 0) < v_c.n_items then
      raise exception 'La solicitud aún tiene ítems sin cubrir (% de % cubiertos). Registra lo que se consiguió o ciérrala como entrega parcial.',
        coalesce(v_c.n_cumplidos, 0), v_c.n_items using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_gate_entrega_completa on public.solicitudes_insumo;
create trigger trg_gate_entrega_completa
  before update of estado on public.solicitudes_insumo
  for each row execute function public.gate_entrega_completa();

comment on function public.gate_entrega_completa() is
  'Regla de cierre (0221): una solicitud no pasa a «entregado» mientras queden ítems sin cubrir. Desde 0222 se mide contra los ítems DERIVADOS A LOGÍSTICA (si Verificación repartió el desglose, lo que fue a otras áreas no bloquea esta entrega). Se salta con la compuerta de sesión app.entrega_parcial_ok o con es_admin(). Sin desglose, el comportamiento es el de siempre.';

-- `entregar_solicitud_insumo` — cuerpo de 0221 VERBATIM, misma firma, con la cobertura
-- acotada a Logística y el área en el asiento de auditoría.
create or replace function public.entregar_solicitud_insumo(
  p_solicitud uuid,
  p_forzar    boolean default false,
  p_nota      text    default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_sol     record;
  v_c       record;
  v_parcial boolean := false;
  v_nota    text := left(nullif(btrim(coalesce(p_nota, '')), ''), 500);
begin
  if not (public.es_admin() or public.puede_logistica()) then
    raise exception 'No tienes permiso para cerrar esta entrega.' using errcode = '42501';
  end if;

  select s.id, s.estado, s.caso_id, s.entrega_nota into v_sol
    from public.solicitudes_insumo s where s.id = p_solicitud;
  if v_sol.id is null then
    raise exception 'Solicitud de insumo no encontrada.' using errcode = 'P0002';
  end if;
  if v_sol.estado::text = 'entregado' then return 'entregado'; end if;   -- idempotente
  if v_sol.estado::text = 'cancelado' then
    raise exception 'Una solicitud cancelada no se puede entregar.' using errcode = '22023';
  end if;

  -- (0222) Lo que se le pidió a Logística, no todo el desglose del caso.
  select * into v_c from public.cobertura_items_caso(v_sol.caso_id, 'logistica');
  if coalesce(v_c.n_items, 0) > 0 and coalesce(v_c.n_cumplidos, 0) < v_c.n_items then
    if not coalesce(p_forzar, false) then
      raise exception 'Faltan ítems por cubrir: % de % (% %% de lo pedido). Registra los aportes o confirma la entrega parcial.',
        coalesce(v_c.n_cumplidos, 0), v_c.n_items, coalesce(v_c.pct, 0) using errcode = '22023';
    end if;
    v_parcial := true;
  end if;

  perform set_config('app.entrega_parcial_ok', '1', true);
  update public.solicitudes_insumo
     set estado = 'entregado'::public.estado_insumo,
         entrega_nota = case
                          when v_nota is null then entrega_nota
                          when coalesce(btrim(coalesce(entrega_nota, '')), '') = '' then v_nota
                          else left(entrega_nota || E'\n' || v_nota, 2000)
                        end,
         actualizado_en = now()
   where id = p_solicitud;
  perform set_config('app.entrega_parcial_ok', '', true);

  perform public.registrar_auditoria(
    case when v_parcial then 'entrega_parcial' else 'entrega_completa' end,
    'solicitudes_insumo', p_solicitud::text,
    jsonb_build_object('caso_id', v_sol.caso_id, 'items', coalesce(v_c.n_items, 0),
                       'cubiertos', coalesce(v_c.n_cumplidos, 0), 'pct', v_c.pct,
                       'ambito', 'logistica'));
  if v_sol.caso_id is not null then
    perform public.registrar_auditoria(
      case when v_parcial then 'entrega_parcial' else 'entrega_completa' end,
      'casos', v_sol.caso_id::text,
      jsonb_build_object('solicitud_id', p_solicitud, 'items', coalesce(v_c.n_items, 0),
                         'cubiertos', coalesce(v_c.n_cumplidos, 0), 'pct', v_c.pct,
                         'ambito', 'logistica'));
  end if;

  return case when v_parcial then 'parcial' else 'completa' end;
end $$;

revoke all on function public.entregar_solicitud_insumo(uuid, boolean, text) from public;
grant execute on function public.entregar_solicitud_insumo(uuid, boolean, text) to authenticated;

comment on function public.entregar_solicitud_insumo(uuid, boolean, text) is
  'Cierra una solicitud como ENTREGADA (0221). Desde 0222 mide la cobertura contra los ítems DERIVADOS A LOGÍSTICA: entregar todo lo que se le pidió es una entrega COMPLETA aunque el caso siga abierto por lo que fue a otras áreas (eso lo decide cerrar_caso_al_entregar, que sigue mirando el desglose entero). Con ítems propios pendientes exige p_forzar y deja el asiento ''entrega_parcial''. Idempotente si ya estaba entregada.';
