-- ============================================================
-- 0223 — La solicitud que crea Logística es una solicitud COMPLETA
-- ------------------------------------------------------------
-- ANTES: «Nueva solicitud de insumo» (/insumos/nueva) escribía SEIS campos sueltos en
--   `public.solicitudes_insumo` —titulo, tipo, descripcion, cantidad, urgencia, punto_id—
--   y, sobre todo, SIN `caso_id`. Una solicitud sin caso es una solicitud mutilada, y se
--   nota en cada función del módulo, todas verificadas una a una:
--     · sin CONTACTO ni referente: `casos.contacto/referente/contacto_whatsapp/
--       contacto_instagram` (0171) viven en el caso; la tarea suelta no tiene a quién llamar.
--     · sin COORDENADAS ni dirección: `casos.lat/lng` y `ubicacion_*` (0112/0173) también.
--       No sale en el mapa (`solicitudes_ayuda_mapa` 0112, `mapa_panorama` 0204).
--     · sin CENTROS CERCANOS: `centros_cercanos_para_solicitud` hace join con `casos`
--       para leer lat/lng — sin caso devuelve cero centros, en silencio.
--     · sin ADJUNTOS compartidos: `subirAdjuntosInsumo` (0212/0213) manda las imágenes a
--       `casos_adjuntos` SOLO si hay caso; si no, quedan en la galería privada de la tarea
--       y ni Verificación ni Redacción las ven.
--     · sin COBERTURA PARCIAL: `solicitar_cobertura_parcial` (0211) aborta con 22023
--       («esta tarea no viene de una solicitud del flujo») cuando `caso_id` es null.
--     · sin CIERRE del caso al entregar: `cerrar_caso_al_entregar` (0114/0116) no tiene
--       caso que resolver.
--     · sin DESGLOSE POR ÍTEM: `casos_items` (0218) y todo lo construido encima —historial
--       (0219), semáforo por ítem (0220), cumplimiento y % (0221), derivación selectiva
--       (0222)— cuelga de `casos`. Una tarea sin caso no puede tener ni un ítem.
--   Y encima la puerta estaba abierta: `solins_insert` (0050) era
--   `es_verificado() and solicitado_por = auth.uid()`, así que CUALQUIER cuenta verificada
--   —Redacción, Psicosocial, un voluntario— podía crear tareas en el tablero de Logística;
--   y la página `/insumos/nueva` no gateaba ningún rol (solo `requireUsuario()`).
--
-- AHORA: Logística crea un CASO completo, no una `solicitudes_insumo` huérfana. La tarea
--   de Logística sigue apareciendo, pero como SIEMPRE: proyectada desde el caso por
--   `solicitud_logistica_de_caso()` (0208 → 0222). Con eso hereda, sin escribir una línea
--   más, contacto, ubicación, adjuntos, centros cercanos, cobertura parcial, cierre del
--   caso y el desglose por ítem con su semáforo y su porcentaje.
--
-- ── POR QUÉ HACE FALTA UNA RPC Y NO BASTA CON LA RLS ──
--   `casos_insert` (0207) exige Recopilación, administración o `es_mando_recopilacion()`.
--   Logística NO está ahí y NO debe estarlo: no se le abre `casos` a otra área (doctrina
--   0156/0180/0213 — cada área escribe lo suyo). La vía es una RPC SECURITY DEFINER
--   acotada y auditada, exactamente como `solicitar_cobertura_parcial` (0211), que es el
--   molde literal de esta migración.
--
-- ── LA SOLICITUD NACE CONFIRMADA (decisión explícita, precedente 0211) ──
--   `gate_confirmacion_caso` (0173) es BEFORE UPDATE **OF estado**, no BEFORE INSERT: un
--   caso puede NACER 'confirmado' y el candado no se entera. 0211 ya usa ese camino a
--   propósito para la cobertura parcial. Aquí se repite, con la misma contrapartida: hay
--   que SEMBRAR `casos_verificacion_campo` a mano, porque `gate_derivacion_validada`
--   (0177, BEFORE INSERT sobre `casos_derivaciones`) sí exige `caso_esta_validado()` en
--   CUALQUIER ruta, incluida esta. Sin la siembra, la derivación a 'logistica' fallaría
--   con 23514 y la solicitud quedaría sin tarea.
--   Se siembran los SIETE campos del semáforo (los cinco de base más 'ubicacion' y
--   'cantidad'), no solo los que `caso_esta_validado()` pide para este caso: si más tarde
--   alguien añade las coordenadas y el caso pasa a ser requerimiento, seguirá Validado en
--   vez de caerse del flujo sin aviso. Las filas de más se ignoran (0173 solo cuenta las
--   que necesita) y cada una lleva su nota de procedencia.
--   Contrapartida asumida y visible: esta solicitud NO pasa por Verificación. Queda
--   marcada con `origen_area='logistica'` —la insignia que ya pintan `envio-redaccion`,
--   `seguimiento` y `casos_difusion` (0211)— y se avisa a Verificación.
--
-- ── EL PUENTE DE ÍTEMS SE ESCRIBE AUNQUE VAYA TODO EL DESGLOSE ──
--   La derivación a 'logistica' se crea CON su selección de ítems (0222). Con todos los
--   ítems marcados el resultado es hoy el mismo que sin selección, pero la proyección
--   nace ACOTADA: en cuanto Verificación reparta parte del desglose a Alianzas o a Redes,
--   `cobertura_items_caso(caso,'logistica')` —que es contra lo que mide
--   `gate_entrega_completa` (0221 → 0222)— seguirá contando lo de Logística y no lo ajeno.
--   Y por el orden de los triggers hay que llamar a `solicitud_logistica_de_caso()` DE
--   FORMA EXPLÍCITA después de escribir el puente: `trg_crear_logistica_al_derivar` corre
--   en el AFTER INSERT de la derivación, cuando el puente todavía no existe. Es el mismo
--   patrón que ya usa `derivar_caso` (0222); el helper es idempotente por caso.
--   Contrapartida conocida, y es la MISMA regla de 0222 para cualquier solicitud: un ítem
--   AÑADIDO DESPUÉS no entra solo en el puente, así que queda sin asignar hasta que alguien
--   vuelva a derivar. No se pierde de vista —`casos_items` se lee con `es_verificado()` y
--   el detalle avisa «N de M ítems»—, pero conviene saberlo. Hoy no se llega ahí desde la
--   interfaz de Logística (`ItemsSemaforo` no da de alta ítems y `/casos` es de
--   Recopilación/Verificación); si alguna vez se abre, esa pantalla debe re-derivar.
--
-- ── EL HISTORIAL DE CORRECCIONES DEL ALTA SE LIMPIA ──
--   `trg_denormalizar_items_caso` (0218) recalcula `casos.req_tipo/req_cantidad` en CADA
--   ítem, y ese UPDATE despierta a `auditar_correccion_caso` (0178), que anota
--   «Cantidad: antes → después». Al dar de alta un desglose de cinco ítems eso deja cinco
--   asientos de «corrección» en `casos_historial_cambios` de un caso que acaba de nacer:
--   no son correcciones de nadie, es el propio alta escribiéndose. Se borran las filas de
--   ESE caso recién creado —todas son de esta misma llamada, el caso no existía— y el alta
--   entera queda auditada de una vez en `registro_auditoria`, con el desglose incluido.
--   No se toca `auditar_correccion_caso`: fuera del alta, ese asiento es traza útil y 0218
--   decidió conservarlo a propósito.
--
-- ── SE ENDURECE `solins_insert` (decisión explícita) ──
--   Pasa de `es_verificado() and solicitado_por = auth.uid()` a
--   `puede_logistica() and solicitado_por = auth.uid()`. Se comprobó que NADIE más inserta
--   por esa vía: las dos rutas automáticas —`derivar_caso_a_logistica()` (0113) y
--   `solicitud_logistica_de_caso()` (0208 → 0222)— son SECURITY DEFINER propiedad del
--   dueño del esquema y no pasan por la RLS; y el único INSERT de la app
--   (`crearSolicitud`, insumos/actions.ts) es justo el que esta migración reencamina.
--   `puede_logistica()` ya incluye al MANDO del grupo desde 0214, así que el líder y los
--   coordinadores de Logística siguen pudiendo dar de alta.
--
-- ENUM-SAFETY: cero valores de enum nuevos y ninguna tabla nueva. La urgencia entra como
--   TEXTO y se valida contra `enum_range(null::public.prioridad)` antes de castear, para no
--   depender de un cast eager sobre un valor que pudiera no existir.
--
-- Idempotente. Ejecutar tras 0222.
-- ============================================================

-- ═══ (1) La puerta de alta de `solicitudes_insumo` deja de estar abierta ═══
-- 0050 VERBATIM salvo el gate: `es_verificado()` → `puede_logistica()`. Se conserva
-- `solicitado_por = auth.uid()` (trazabilidad de quién dio de alta).
drop policy if exists "solins_insert" on public.solicitudes_insumo;
create policy "solins_insert" on public.solicitudes_insumo for insert to authenticated
  with check (public.puede_logistica() and solicitado_por = auth.uid());

comment on table public.solicitudes_insumo is
  'Tarea de Logística de una solicitud. Desde 0223 el ALTA es solo de Logística (solins_insert = puede_logistica(), que incluye al mando del grupo desde 0214): antes cualquier cuenta verificada podía sembrar tareas en el tablero del área. La vía normal de creación es la proyección desde el caso (solicitud_logistica_de_caso, 0208 → 0222); para dar de alta una solicitud propia, Logística usa crear_solicitud_logistica (0223), que crea el CASO completo.';

-- ═══ (2) La RPC de alta — molde literal de solicitar_cobertura_parcial (0211) ═══
-- Crea el CASO (no la tarea suelta): datos de contacto, ubicación, desglose por ítem,
-- verificación sembrada, derivación a 'logistica' con su selección de ítems, aviso a
-- Verificación y asiento de auditoría. Devuelve el id del CASO; la tarea de Logística la
-- proyecta `solicitud_logistica_de_caso()` y se encuentra por `caso_id`.
--
-- `p_items` es un ARRAY JSON de objetos:
--   [{ "descripcion": "agua potable en botellones de 5 L", "tipo": "agua",
--      "cantidad": "50", "unidad": "botellones", "notas": "…" }, …]
--   · `descripcion` es lo único obligatorio (los ítems sin ella se ignoran).
--   · `cantidad` entra como TEXTO y se decide aquí: si es un número se guarda en
--     `casos_items.cantidad` (y entra en el % de cumplimiento de 0221); si no —«un
--     camión», «lo que se pueda»— se guarda en `cantidad_texto`, que 0218 creó
--     exactamente para eso y que el porcentaje no mira.
--   · `tipo` se valida contra el enum SIN cast eager; lo que no esté, entra como 'otro'.
create or replace function public.crear_solicitud_logistica(
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
  -- ── Gate del área. `puede_logistica()` incluye al mando del grupo desde 0214. ──
  if not (public.es_admin() or public.puede_logistica()) then
    raise exception 'Solo Logística puede dar de alta una solicitud desde su panel.'
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

revoke all on function public.crear_solicitud_logistica(
  text, text, jsonb, text, text, text, text, text, text, text, text, text,
  double precision, double precision, text, int, text, uuid, text) from public;
grant execute on function public.crear_solicitud_logistica(
  text, text, jsonb, text, text, text, text, text, text, text, text, text,
  double precision, double precision, text, int, text, uuid, text) to authenticated;

comment on function public.crear_solicitud_logistica(
  text, text, jsonb, text, text, text, text, text, text, text, text, text,
  double precision, double precision, text, int, text, uuid, text) is
  'Alta de Logística (0223): crea la solicitud COMPLETA —un CASO, no una solicitudes_insumo huérfana— con contacto estructurado (0171), ubicación (0112/0173), personas afectadas y desglose por ítem (0218). Molde de solicitar_cobertura_parcial (0211): nace «confirmado» (gate_confirmacion_caso es BEFORE UPDATE) con el semáforo de verificación sembrado a mano, se deriva a «logistica» con su selección de ítems (0222) y la tarea del área la proyecta solicitud_logistica_de_caso. Queda marcada con origen_area=''logistica'' y avisa a Verificación. Devuelve el id del CASO.';
