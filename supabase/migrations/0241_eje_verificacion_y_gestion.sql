-- ============================================================
-- 0241 — El EJE: Verificación y Gestión de Casos toma la primera mitad del flujo
-- ------------------------------------------------------------
-- ENCARGO DE LA ORGANIZACIÓN: «los roles y área de Verificación y Gestión pasan a ser el
--   eje central del proyecto; en el panel de Logística deben tener acceso y tomar control
--   de solicitado y en gestión del flujo; ya luego pasa a Logística solamente acorde a su
--   área, en ruta y entregado». El análisis completo, con lo que se miró y lo que no, está
--   en docs/PLAN-EJE-VERIFICACION-Y-GESTION.md.
--
-- LA REGLA, en una frase: MANDA EL ÁREA DUEÑA DEL ESTADO DE DESTINO.
--   'solicitado' · 'en_gestion' · 'cancelado' · 'no_disponible'  → Verificación y Gestión
--   'en_ruta' · 'entregado'                                      → Logística
--   Así `solicitado → en_gestion` lo da el área eje, y `en_gestion → en_ruta` lo TOMA
--   Logística («lo recibí, salgo»), que es como lo describió la organización.
--
-- POR QUÉ EL ENUM TIENE SEIS ESTADOS Y EL ENCARGO REPARTÍA CUATRO: 0050:17 crea cinco y
--   0149:35 añade 'no_disponible'. La organización decidió que 'cancelado' y
--   'no_disponible' son también del área eje: cerrar una solicitud sin entregarla es una
--   decisión de gestión del caso.
--
-- DÓNDE VA LA FRONTERA, y por qué NO en el helper de área:
--   `puede_logistica()` sostiene ~30 políticas sobre 15 relaciones (lo avisa su propia
--   cabecera en 0214). Restringirla habría roto acopio, proveedores, envíos, el bucket de
--   entregas y las vistas cruzadas de 0226 —y en silencio, devolviendo 0 filas en vez de un
--   error—. La frontera va en la PUERTA DEL ESTADO: policy amplia + trigger BEFORE que
--   separa por estado. Es el molde EXACTO de `proteger_campos_oportunidad` (0161:33-74),
--   que ya hace esto mismo entre Logística y Verificación sobre `oportunidades_donacion`.
--
-- POR QUÉ LA POLICY SE ABRE EN VEZ DE PARTIRSE: si la frontera viviera solo en
--   `solins_update`, un intento del área equivocada NO daría error: daría CERO FILAS, y la
--   app diría «Estado actualizado» tan tranquila (insumos/actions.ts:179 hace un UPDATE
--   crudo). Con la policy abierta a las dos áreas y el trigger levantando 42501, el que se
--   equivoca lee de quién es ese paso.
--
-- «ELLOS» EN LA RLS: no existía ningún helper que agrupara al área. `puede_verificar()`
--   (0058:67) es admin + verificador y deja fuera al mando del grupo (0147), al admin de
--   área (0106) y al propio `gestor_casos` (0239). Es el mismo agujero que 0214 tuvo que
--   tapar para Logística. Se crea `puede_gestion_casos()` con los cinco.
--
-- TRES FUNCIONES SE REEMITEN, Y SU CUERPO ESTÁ COPIADO A MÁQUINA, no a mano:
--   · `crear_solicitud_logistica_base` — 0223:129-400 (0230 la renombró sin tocar el
--     cuerpo, precisamente para no copiar ~270 líneas de validaciones). Cambia UNA cosa:
--     el gate del alta, que ahora admite también al área eje.
--   · `desestimar_caso` — 0214:54-110. Se le añade UNA línea: la compuerta de sesión
--     `app.cancelar_cascada_ok` antes de cancelar la solicitud ligada. Sin ella, la
--     frontera nueva le rompería a Logística y a Redacción su propio botón de desestimar,
--     que es una decisión sobre el caso y no sobre el flujo de insumos.
--   · `avanzar_item` — 0220:122-179. Cambia UNA cosa: el gate.
--   Se dice explícitamente porque el repositorio evitó copiar estos cuerpos en 0230; aquí
--   la copia la hizo un script sobre el fichero original, así que no hay erratas de
--   transcripción, y cualquiera puede reproducirla con `sed -n`.
--
-- LO QUE ESTE CAMBIO NO TOCA, a propósito:
--   · `entregar_solicitud_insumo` (0222:791) y `devolver_entrega_insumo` (0210:109) siguen
--     con su gate de Logística: 'entregado' y 'en_ruta' siguen siendo suyos.
--   · La lectura del tablero: `solins_lectura` (0050:98) ya era `es_verificado()`, así que
--     Logística conserva la vista de las columnas que dejan de ser suyas — necesita saber
--     qué le va a llegar.
--   · `puede_alianzas()`: 0216:28-33 avisa que sostiene 12 permisos.
--
-- Idempotente. Ejecutar tras 0240.
-- ============================================================

-- ═══ (1) El helper del área eje ═══
-- Los cinco perfiles que la componen. `es_gestor_casos()` compara por TEXTO (0239, molde
-- 0129), así que este helper es seguro aunque el valor de enum sea reciente.
create or replace function public.puede_gestion_casos()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin()
      or public.tiene_rol('verificador')
      or public.es_gestor_casos()
      or public.es_mando_verificacion()
      or public.opera_verificacion();
$$;
grant execute on function public.puede_gestion_casos() to authenticated;

comment on function public.puede_gestion_casos() is
  'El área «Verificación y Gestión de Casos» al completo (0241): admin, rol verificador, gestor_casos (0239), el mando del grupo (0147) y el admin de área (0106). Existe porque puede_verificar() dejaba fuera a tres de los cinco — el mismo agujero que 0214 tapó para Logística.';

-- ═══ (2) De quién es cada estado ═══
-- plpgsql y no `language sql`: se planifica al llamarla, no al crearla (regla escrita en
-- 0216). Su espejo en la app es AREA_DE_ESTADO_INSUMO, en apps/web/lib/flujo-insumos.ts.
create or replace function public.area_de_estado_insumo(p_estado text)
returns text language plpgsql immutable as $$
begin
  return case lower(coalesce(p_estado, ''))
    when 'en_ruta'   then 'logistica'
    when 'entregado' then 'logistica'
    -- solicitado · en_gestion · cancelado · no_disponible, y cualquier valor futuro que se
    -- añada sin repartir: por defecto al área eje, que es la dueña de la entrada.
    else 'gestion'
  end;
end $$;
grant execute on function public.area_de_estado_insumo(text) to authenticated;

comment on function public.area_de_estado_insumo(text) is
  'Reparto del flujo de insumos por área (0241). en_ruta y entregado son de Logística; el resto —incluidos cancelado y no_disponible, por decisión de la organización— de Verificación y Gestión de Casos. Un estado nuevo cae del lado del área eje: es el lado seguro, porque es quien coordina.';

-- ═══ (3) ¿Puedo llevar una solicitud a este estado? ═══
create or replace function public.puede_mover_solicitud_a(p_estado text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.area_de_estado_insumo(p_estado)
    when 'logistica' then public.es_admin() or public.puede_logistica()
    else                  public.es_admin() or public.puede_gestion_casos()
  end;
$$;
grant execute on function public.puede_mover_solicitud_a(text) to authenticated;

-- ═══ (4) Las policies se abren a las DOS áreas ═══
-- La frontera la pone el trigger de (5), no estas policies. Ver la cabecera.
drop policy if exists "solins_update" on public.solicitudes_insumo;
create policy "solins_update" on public.solicitudes_insumo for update to authenticated
  using (public.puede_logistica() or public.puede_gestion_casos())
  with check (public.puede_logistica() or public.puede_gestion_casos());

-- El alta también, por la decisión de la organización («mueve, trabaja y además crea»).
-- Se conserva `solicitado_por = auth.uid()` de 0223: nadie da de alta a nombre de otro.
drop policy if exists "solins_insert" on public.solicitudes_insumo;
create policy "solins_insert" on public.solicitudes_insumo for insert to authenticated
  with check ((public.puede_logistica() or public.puede_gestion_casos())
              and solicitado_por = auth.uid());

-- ═══ (5) La frontera ═══
create or replace function public.gate_area_estado_insumo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_area text;
begin
  if new.estado is not distinct from old.estado then
    return new;   -- no se movió el estado: esta compuerta no opina de las demás columnas
  end if;

  -- SIN SESIÓN no se aplica la frontera. Es deliberado y hay que decirlo: las semillas de
  -- las pruebas y los procesos internos escriben como `postgres` sin JWT (verificar_rls.sql
  -- :682, semilla_hilos_0231.sql:69, pruebas_contexto_0237.sql:59). Bloquearlos pondría
  -- media suite en rojo sin proteger nada — no hay área a la que atribuir el movimiento.
  if auth.uid() is null then
    return new;
  end if;

  -- Compuerta de la cascada de `desestimar_caso` (ver cabecera): desestimar es una decisión
  -- sobre el CASO, y la puede tomar también Logística o Redacción desde su área.
  if coalesce(current_setting('app.cancelar_cascada_ok', true), '') = '1' then
    return new;
  end if;

  if public.es_admin() then
    return new;
  end if;

  v_area := public.area_de_estado_insumo(new.estado::text);
  if v_area = 'logistica' then
    if not public.puede_logistica() then
      raise exception 'Llevar una solicitud a «%» es de Logística: ese paso lo da su equipo.', new.estado
        using errcode = '42501';
    end if;
  else
    if not public.puede_gestion_casos() then
      raise exception 'Llevar una solicitud a «%» es de Verificación y Gestión de Casos: ese paso lo da su equipo.', new.estado
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.gate_area_estado_insumo() from public;

drop trigger if exists trg_gate_area_estado_insumo on public.solicitudes_insumo;
create trigger trg_gate_area_estado_insumo
  before update of estado on public.solicitudes_insumo
  for each row execute function public.gate_area_estado_insumo();

comment on function public.gate_area_estado_insumo() is
  'Frontera de áreas del flujo de insumos (0241). Manda el área dueña del estado de DESTINO. Molde 0161. Tolera auth.uid() nulo (semillas y procesos internos) y la cascada de desestimar_caso.';

-- ═══ (6) Ver la evidencia de entrega ═══
-- La galería de la solicitud (0212, abierta en 0213 a Verificación y Redacción) se lee con
-- `puede_logistica() or puede_ver_casos() or puede_pipeline()`. Un `gestor_casos` PURO no
-- entra en ninguno de los tres —`puede_ver_casos()` (0058:71) es admin, verificador y
-- recopilación—, así que coordinaría la entrega sin poder abrir la foto que la prueba.
-- Se amplían LAS DOS: la fila y el bucket. Sin la segunda, la fila se lee y la imagen no
-- se abre (es la lección que 0213 dejó escrita).
drop policy if exists insadj_select on public.insumos_adjuntos;
create policy insadj_select on public.insumos_adjuntos for select to authenticated
  using (public.puede_logistica() or public.puede_ver_casos() or public.puede_pipeline()
         or public.puede_gestion_casos());

drop policy if exists entregas_obj_select on storage.objects;
create policy entregas_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'entregas'
         and (public.puede_logistica() or public.puede_ver_casos() or public.puede_pipeline()
              or public.puede_gestion_casos()));


-- ═══ (7) El alta, ahora también del área eje ═══
-- CUERPO COPIADO A MÁQUINA de 0223:129-400 (ver cabecera). Único cambio: el gate.
create or replace function public.crear_solicitud_logistica_base(
  p_titulo         text,
  p_descripcion    text,
  p_items          jsonb            default null,
  p_referente      text             default null,
  p_referente_rol  text             default null,
  p_whatsapp       text             default null,
  p_instagram      text             default null,
  p_ubi_estado     text             default null,
  p_ubi_municipio  text             default null,
  p_ubi_parroquia  text             default null,
  p_ubi_sector     text             default null,
  p_ubi_direccion  text             default null,
  p_lat            double precision default null,
  p_lng            double precision default null,
  p_urgencia       text             default 'media',
  p_personas       int              default null,
  p_fuente         text             default null,
  p_punto          uuid             default null,
  p_notas          text             default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_titulo  text;
  v_desc    text;
  v_ref     text;
  v_rol     text;
  v_wa      text;
  v_ig      text;
  v_cont    text;
  v_fuente  text;
  v_notas   text;
  v_urg     text;
  v_prio    text;
  v_req     boolean;
  v_pers    int;
  v_punto   uuid;
  v_nuevo   uuid;
  v_deriv   uuid;
  v_sol     uuid;
  v_it      jsonb;
  v_it_desc text;
  v_it_tipo text;
  v_it_cant numeric;
  v_it_txt  text;
  v_it_uni  text;
  v_it_nota text;
  v_bruto   text;
  v_orden   int := 0;
  v_id      uuid;
  v_ids     uuid[] := '{}'::uuid[];
  v_n       int;
begin
  -- ── Gate del área (AMPLIADO en 0241). Antes solo Logística; ahora también Verificación
  --    y Gestión de Casos, que desde este cambio es dueña de 'solicitado' y 'en_gestion'
  --    y por tanto de dar el alta. `puede_logistica()` incluye al mando del grupo desde
  --    0214; `puede_gestion_casos()` agrupa a los cinco perfiles del área eje. ──
  if not (public.es_admin() or public.puede_logistica() or public.puede_gestion_casos()) then
    raise exception 'El alta de una solicitud es de Logística o de Verificación y Gestión de Casos.'
      using errcode = '42501';
  end if;

  -- ── Datos obligatorios: los MISMOS que exige el alta de Recopilación (crearCaso) ──
  v_titulo := nullif(btrim(coalesce(p_titulo, '')), '');
  if v_titulo is null then
    raise exception 'Ponle un título a la solicitud.' using errcode = '22023';
  end if;
  v_desc := nullif(btrim(coalesce(p_descripcion, '')), '');
  if v_desc is null then
    raise exception 'Describe qué se necesita y para quién.' using errcode = '22023';
  end if;

  -- Contacto estructurado (0171). Misma normalización que `datosContacto` en la app:
  -- si el teléfono parece un número se deja en dígitos y «+»; si no, se guarda tal cual.
  v_ref := nullif(btrim(coalesce(p_referente, '')), '');
  v_rol := nullif(btrim(coalesce(p_referente_rol, '')), '');
  v_wa  := nullif(btrim(coalesce(p_whatsapp, '')), '');
  if v_wa is not null and length(regexp_replace(v_wa, '[^0-9]', '', 'g')) >= 6 then
    v_wa := regexp_replace(v_wa, '[^0-9+]', '', 'g');
  end if;
  v_ig := nullif(btrim(coalesce(p_instagram, '')), '');
  if v_ig is not null then
    v_ig := regexp_replace(v_ig, '^https?://(www\.)?instagram\.com/', '', 'i');
    v_ig := regexp_replace(v_ig, '[/?#].*$', '');
    v_ig := nullif(btrim(ltrim(v_ig, '@')), '');
  end if;
  if v_ref is null then
    raise exception 'Falta el referente: la persona o institución que solicita.' using errcode = '22023';
  end if;
  if v_wa is null and v_ig is null then
    raise exception 'Indica al menos un contacto: WhatsApp/teléfono o Instagram.' using errcode = '22023';
  end if;
  -- Campo `contacto` compuesto (columna vieja, la leen las pantallas de siempre).
  v_cont := nullif(concat_ws(' · ',
    case when v_wa is not null then 'WhatsApp/tel: ' || v_wa end,
    case when v_ig is not null then 'Instagram: @'  || v_ig end), '');

  if nullif(btrim(coalesce(p_ubi_estado, '')), '') is null then
    raise exception 'Indica al menos el Estado donde se necesita la ayuda.' using errcode = '22023';
  end if;

  -- Urgencia: TEXTO validado contra el enum (sin cast eager sobre un valor cualquiera).
  v_urg := lower(coalesce(nullif(btrim(coalesce(p_urgencia, '')), ''), 'media'));
  if not exists (select 1 from unnest(enum_range(null::public.prioridad)) as e(v) where e.v::text = v_urg) then
    v_urg := 'media';
  end if;
  -- `chk_derivacion_prioridad` (0177) solo admite alta/media/baja: «crítica» entra como «alta».
  v_prio := case when v_urg = 'critica' then 'alta' else v_urg end;

  -- `casos_requerimiento_chk` (0112) exige lat/lng cuando es_requerimiento. Sin pin, la
  -- solicitud se registra igual (es_requerimiento=false) y se podrá ubicar después: el
  -- mapa no carga en todos los equipos y eso NUNCA debe bloquear un alta.
  v_req := p_lat is not null and p_lng is not null
           and p_lat between -90 and 90 and p_lng between -180 and 180;

  v_pers   := case when p_personas is not null then greatest(0, p_personas) end;
  v_fuente := left(coalesce(nullif(btrim(coalesce(p_fuente, '')), ''),
                            'Logística — levantamiento del área'), 200);
  v_notas  := left(nullif(btrim(coalesce(p_notas, '')), ''), 2000);

  -- El centro de acopio es opcional; si viene uno que no existe se ignora en vez de
  -- reventar el alta con una violación de clave ajena.
  if p_punto is not null and exists (select 1 from public.puntos_acopio p where p.id = p_punto) then
    v_punto := p_punto;
  end if;

  -- ── El desglose es OBLIGATORIO: es lo que hace «completa» a esta solicitud ──
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Añade al menos un ítem al desglose: qué hace falta, cuánto y en qué unidad.'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'El desglose admite hasta 50 ítems.' using errcode = '22023';
  end if;

  -- ── El caso. NACE 'confirmado' (gate_confirmacion_caso es BEFORE UPDATE, 0173/0211) ──
  insert into public.casos (
    titulo, descripcion, categoria, fuente, fuente_tipo, fecha_publicacion, sigue_vigente,
    estado, creado_por, es_nna, es_requerimiento, req_urgencia,
    lat, lng, ubicacion_estado, ubicacion_municipio, ubicacion_parroquia,
    ubicacion_sector, ubicacion_direccion,
    contacto, referente, referente_rol, contacto_whatsapp, contacto_instagram,
    autoriza_difusion, personas_afectadas, notas, requiere_difusion, origen_area
  ) values (
    v_titulo, v_desc, 'Otras informaciones', v_fuente, 'organizacion', current_date, 'si',
    'confirmado', auth.uid(), false, v_req, v_urg::public.prioridad,
    case when v_req then p_lat end, case when v_req then p_lng end,
    left(nullif(btrim(coalesce(p_ubi_estado,    '')), ''), 80),
    left(nullif(btrim(coalesce(p_ubi_municipio, '')), ''), 80),
    left(nullif(btrim(coalesce(p_ubi_parroquia, '')), ''), 80),
    left(nullif(btrim(coalesce(p_ubi_sector,    '')), ''), 120),
    left(nullif(btrim(coalesce(p_ubi_direccion, '')), ''), 200),
    v_cont, left(v_ref, 160), left(v_rol, 80), left(v_wa, 40), left(v_ig, 60),
    false, v_pers, v_notas, false, 'logistica'
  ) returning id into v_nuevo;

  -- ── Verificación sembrada: los SIETE campos del semáforo, con su procedencia ──
  -- Sin esto, `gate_derivacion_validada` (0177) rechazaría la derivación de más abajo
  -- con 23514 y la solicitud se quedaría sin tarea de Logística.
  insert into public.casos_verificacion_campo (caso_id, campo, estado, nota, verificado_por, verificado_en)
  select v_nuevo, c.campo, 'verificado',
         'Levantado por Logística (0223): el área recogió y confirmó este dato. No pasó por Verificación.',
         auth.uid(), now()
  from (values ('referente'), ('descripcion'), ('fuente'), ('vigencia'),
               ('evidencia'), ('ubicacion'), ('cantidad')) as c(campo)
  on conflict (caso_id, campo) do nothing;

  -- ── El desglose por ítem (0218) ──
  for v_it in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_it) <> 'object' then continue; end if;
    v_it_desc := nullif(btrim(coalesce(v_it ->> 'descripcion', '')), '');
    if v_it_desc is null then continue; end if;   -- una fila vacía del formulario no es un ítem

    v_it_tipo := lower(coalesce(nullif(btrim(coalesce(v_it ->> 'tipo', '')), ''), 'otro'));
    if not exists (select 1 from unnest(enum_range(null::public.tipo_insumo)) as e(v) where e.v::text = v_it_tipo) then
      v_it_tipo := 'otro';
    end if;

    -- Cantidad numérica ↔ cantidad de texto (0218): «50» va a `cantidad` y cuenta para el
    -- porcentaje; «un camión» va a `cantidad_texto`, que el porcentaje no mira. Un número
    -- que no es una cantidad —«0», «-5»— no es ninguna de las dos: se descarta (el CHECK
    -- de 0218 exige cantidad > 0 y guardarlo como texto solo ensuciaría el agregado).
    v_bruto   := nullif(btrim(coalesce(v_it ->> 'cantidad', '')), '');
    v_it_cant := null;
    v_it_txt  := null;
    if v_bruto is not null then
      if replace(v_bruto, ',', '.') ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then
        v_it_cant := nullif(replace(v_bruto, ',', '.')::numeric, 0);
        if v_it_cant is not null and v_it_cant < 0 then v_it_cant := null; end if;
      else
        v_it_txt := left(v_bruto, 100);
      end if;
    end if;

    v_it_uni  := left(nullif(btrim(coalesce(v_it ->> 'unidad', '')), ''), 40);
    v_it_nota := left(nullif(btrim(coalesce(v_it ->> 'notas',  '')), ''), 500);
    v_orden   := v_orden + 1;

    insert into public.casos_items
      (caso_id, orden, tipo, descripcion, cantidad, unidad, cantidad_texto, notas, creado_por)
    values
      (v_nuevo, v_orden, v_it_tipo::public.tipo_insumo, left(v_it_desc, 300),
       v_it_cant, v_it_uni, v_it_txt, v_it_nota, auth.uid())
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    raise exception 'Ningún ítem del desglose trae descripción: escribe qué hace falta.'
      using errcode = '22023';
  end if;

  -- El alta escribiéndose no es una «corrección» del caso (ver cabecera). Todas las filas
  -- de este caso son de esta misma llamada: el caso no existía al empezar.
  delete from public.casos_historial_cambios where caso_id = v_nuevo;

  -- ── La derivación a Logística, CON su selección de ítems (0222) ──
  insert into public.casos_derivaciones
    (caso_id, area, accion, prioridad, observaciones, estado, derivado_por, derivado_en, actualizado_en)
  values (
    v_nuevo, 'logistica',
    'Gestionar y cubrir el desglose',
    v_prio,
    'Solicitud levantada por el propio equipo de Logística (0223): no pasó por Verificación.',
    'sin_tomar', auth.uid(), now(), now()
  )
  on conflict (caso_id, area) do nothing
  returning id into v_deriv;
  if v_deriv is null then
    select d.id into v_deriv
      from public.casos_derivaciones d where d.caso_id = v_nuevo and d.area = 'logistica';
  end if;

  insert into public.casos_derivacion_items (derivacion_id, item_id, creado_por)
    select v_deriv, u, auth.uid() from unnest(v_ids) u
  on conflict (derivacion_id, item_id) do nothing;

  -- El trigger `trg_crear_logistica_al_derivar` ya corrió en el AFTER INSERT de la
  -- derivación, pero ANTES de que existiera el puente. Esta llamada explícita es la que ve
  -- la selección real; el helper es idempotente por caso (uq_solins_caso, 0113).
  perform public.solicitud_logistica_de_caso(v_nuevo);

  select s.id into v_sol from public.solicitudes_insumo s where s.caso_id = v_nuevo;
  if v_sol is not null and v_punto is not null then
    -- `punto_id` no es `estado`: no despierta a auditar_estado_insumo (0210),
    -- gate_entrega_completa (0221/0222) ni cerrar_caso_al_entregar (0114/0116).
    update public.solicitudes_insumo
       set punto_id = v_punto, actualizado_en = now()
     where id = v_sol;
  end if;

  -- ── Aviso a Verificación: nació confirmada sin pasar por su mesa, y eso se dice ──
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'caso_logistica', 'Logística levantó una solicitud',
         'El área registró «' || v_titulo || '» con ' || v_n || ' ítem(s) en el desglose. '
           || 'Nace confirmada (no pasó por Verificación) y ya está en el tablero de Logística.',
         '/casos?caso=' || v_nuevo
  from public.perfiles p
  where p.verificado
    and p.id is distinct from auth.uid()
    and (p.rol in ('verificador'::public.rol_usuario, 'admin_verificacion'::public.rol_usuario)
         or p.roles_extra && array['verificador','admin_verificacion']::public.rol_usuario[]);

  -- Auditoría por INSERT DIRECTO, no por `registrar_auditoria`: aquella (0130) retorna en
  -- SILENCIO si `not es_verificado()`, y el alta de Logística no puede quedar sin traza.
  -- entidad='casos' para que salga también en el «Historial» del detalle de la solicitud.
  insert into public.registro_auditoria (actor_id, accion, entidad, entidad_id, metadata)
  values (auth.uid(), 'crear_solicitud_logistica', 'casos', v_nuevo::text,
          jsonb_build_object('solicitud_id', v_sol, 'items', v_n, 'urgencia', v_urg,
                             'ubicado', v_req, 'punto_id', v_punto,
                             'estado_ubicacion', nullif(btrim(coalesce(p_ubi_estado, '')), '')));

  return v_nuevo;
end $$;

-- ═══ (8) desestimar_caso, con la compuerta de la cascada ═══
-- CUERPO COPIADO A MÁQUINA de 0214:54-110. Único cambio: una línea de set_config.
create or replace function public.desestimar_caso(p_caso uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_caso record; v_motivo text; v_sello text; v_area text; v_del_area boolean;
begin
  select id, titulo, estado, categoria, notas into v_caso from public.casos where id = p_caso;
  if v_caso.id is null then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0002';
  end if;

  -- Verificación (admin/verificador) desestima como parte de su gestión; Redacción y
  -- Logística SOLO en los estados que ya ven y nunca «Desaparecidos».
  v_del_area := public.es_verificado()
                and (public.tiene_rol('redaccion') or public.es_admin_redes() or public.puede_logistica());

  if public.es_admin() or public.puede_verificar() then
    v_area := case when public.puede_verificar() and not public.es_admin() then 'Verificación' else 'Admin' end;
  elsif v_del_area then
    -- El permiso está bien: si no procede, es por la CATEGORÍA o por el ESTADO. Se dice
    -- cuál de los dos, en vez del genérico «No tienes permiso» (que despistaba).
    if v_caso.categoria is not distinct from 'Desaparecidos' then
      raise exception 'Las solicitudes de «Desaparecidos» no se desestiman desde aquí: ese flujo lo lleva Búsqueda.'
        using errcode = '42501';
    end if;
    if v_caso.estado::text not in ('confirmado','enviado_redaccion','resuelto') then
      raise exception 'Esta solicitud está en «%» y desde tu área solo se puede desestimar cuando está confirmada, enviada a redacción o resuelta. Si hay que sacarla del flujo antes, pídeselo a Verificación.', v_caso.estado
        using errcode = '42501';
    end if;
    v_area := case when public.puede_logistica() then 'Logística' else 'Redacción' end;
  else
    raise exception 'No tienes permiso para desestimar esta solicitud.' using errcode = '42501';
  end if;

  if v_caso.estado::text in ('falso','desestimado') then
    raise exception 'La solicitud ya está fuera del flujo.' using errcode = '22023';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'Indica el motivo para desestimar la solicitud.' using errcode = '22023';
  end if;
  v_sello := '[Desestimado ' || to_char(now(), 'YYYY-MM-DD') || ' · ' || v_area || '] ' || v_motivo;

  update public.casos
     set estado = 'desestimado',
         notas = case when coalesce(notas, '') = '' then v_sello else notas || E'\n' || v_sello end,
         info_requerida = null,
         actualizado_en = now()
   where id = p_caso;

  -- Cancela la solicitud de Logística ligada (si la hay y no fue entregada).
  -- COMPUERTA (0241): 'cancelado' pasó a ser de Verificación y Gestión, pero desestimar un
  -- caso lo hacen también Logística y Redacción desde su área (v_del_area, arriba). Sin
  -- esta compuerta la frontera de estados les rompería su propio botón de desestimar, que
  -- es una decisión sobre el CASO y no sobre el flujo de insumos. Molde de las demás
  -- compuertas del repo (app.entrega_parcial_ok 0222, app.devolver_ok 0210).
  perform set_config('app.cancelar_cascada_ok', '1', true);
  update public.solicitudes_insumo
     set estado = 'cancelado'::public.estado_insumo, actualizado_en = now()
   where caso_id = p_caso and estado::text not in ('entregado','cancelado');

  perform public.registrar_auditoria('desestimar_caso', 'casos', p_caso::text,
    jsonb_build_object('area', v_area, 'motivo', v_motivo));
end $$;

-- ═══ (9) El avance por ítem lo mueven las dos áreas ═══
-- CUERPO COPIADO A MÁQUINA de 0220:122-179. Único cambio: el gate.
create or replace function public.avanzar_item(p_item uuid, p_estado text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_estado text := lower(nullif(btrim(coalesce(p_estado, '')), ''));
  v_id     uuid;
  v_desde  text;
begin
  -- Gate AMPLIADO en 0241. El comentario de 0220 decía «conseguir el insumo es trabajo de
  -- Logística», y seguía siendo cierto mientras el tablero entero era suyo. Desde 0241 la
  -- fase de conseguirlo ('solicitado' y 'en_gestion') es de Verificación y Gestión: si no
  -- pudiera mover un ítem, tendría su columna sin poder trabajar dentro de ella.
  if not (public.puede_logistica() or public.puede_gestion_casos() or public.es_admin()) then
    raise exception 'El avance de un ítem lo mueve Logística o Verificación y Gestión de Casos.'
      using errcode = '42501';
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

-- ═══ (10) Los avisos, que hoy apuntan solo a Logística ═══
-- `insumo_nuevo` se dirige al rol 'logistica' en CUATRO funciones vivas (0222:281, 0208:56,
-- 0156:101, 0149:94). Con la entrada del flujo en manos del área eje, quien tiene que
-- enterarse primero es ella. No se reemiten esas cuatro —Logística sigue queriendo saber
-- qué le viene— sino que se AÑADE un trigger: es aditivo, no toca nada existente y se
-- dispara una sola vez por solicitud, venga por la vía que venga.
create or replace function public.notificar_solicitud_al_eje()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select p.id, 'insumo_nuevo_gestion', 'Entra una solicitud a tu cola',
         left(coalesce(new.titulo, 'Una solicitud'), 140), '/insumos/' || new.id
    from public.perfiles p
   where p.verificado
     and p.id is distinct from new.solicitado_por
     and (p.rol::text in ('verificador','gestor_casos')
          or exists (select 1 from unnest(coalesce(p.roles_extra, '{}'::public.rol_usuario[])) r
                      where r::text in ('verificador','gestor_casos')));
  return new;
end $$;

drop trigger if exists trg_notificar_solicitud_al_eje on public.solicitudes_insumo;
create trigger trg_notificar_solicitud_al_eje
  after insert on public.solicitudes_insumo
  for each row execute function public.notificar_solicitud_al_eje();

-- Y el sentido contrario: cuando Logística TOMA la entrega y la pone en ruta, el gestor del
-- caso se entera sin tener que mirar el tablero. Es el único punto del flujo donde el
-- trabajo cambia de área, y hasta ahora no avisaba a nadie.
create or replace function public.notificar_traspaso_a_logistica()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_gestor uuid; v_num bigint;
begin
  if new.estado::text <> 'en_ruta' or old.estado::text = 'en_ruta' then
    return new;
  end if;
  if new.caso_id is null then
    return new;
  end if;
  select c.gestor_id, c.numero into v_gestor, v_num from public.casos c where c.id = new.caso_id;
  if v_gestor is null or v_gestor = auth.uid() then
    return new;
  end if;
  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  values (v_gestor, 'insumo_en_ruta', 'Logística salió con una entrega tuya',
          left('#' || coalesce(v_num::text, '—') || ' · ' || coalesce(new.titulo, ''), 140),
          '/insumos/' || new.id);
  return new;
end $$;

drop trigger if exists trg_notificar_traspaso_a_logistica on public.solicitudes_insumo;
create trigger trg_notificar_traspaso_a_logistica
  after update of estado on public.solicitudes_insumo
  for each row execute function public.notificar_traspaso_a_logistica();
