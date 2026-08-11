-- ============================================================
-- 0235 — Conversación general de la organización + stickers
-- ------------------------------------------------------------
-- (1) CONVERSACIÓN GENERAL
--
-- PROBLEMA: los hilos de 0231 cuelgan siempre de algo —un caso, una entrega, una tarea,
--   un grupo—, y eso resuelve el 90 % del trabajo pero deja fuera lo que atraviesa a
--   todos: «mañana no hay transporte», «se agotaron los colchones en el centro sur»,
--   «¿alguien de Redacción puede mirar esto?». Hoy eso obliga a estar en cada grupo o a
--   volver a WhatsApp, que es justo lo que se quería evitar.
--
-- AHORA: un ámbito 'general', UNO SOLO para toda la organización, que lee y escribe
--   cualquier cuenta verificada.
--
-- EL ANCLA, que es la parte fea: `hilos.ancla_id` es NOT NULL porque los cuatro ámbitos
--   anteriores cuelgan de una fila real. El general no cuelga de nada. Se resuelve con un
--   UUID CENTINELA de ceros en vez de hacer la columna nullable, y es a propósito:
--     · Con `ancla_id` nullable, el índice único (ambito, ancla_id) DEJA DE PROTEGER —en
--       Postgres dos NULL no son iguales—, así que podrían nacer diez conversaciones
--       generales sin que nada lo impida. Habría que añadir un índice único parcial extra
--       para tapar ese agujero.
--     · Con el centinela, `uq_hilo_ancla` sigue garantizando que solo hay una, sin tocar
--       la tabla y sin que ninguna consulta existente cambie de comportamiento.
--   Nadie tiene que conocer el centinela: `abrir_hilo('general', null)` lo pone solo.
--
-- LO QUE ESTO REABRE, dicho claro: el diseño anclado hacía IMPOSIBLE «lo pegué en el
--   sitio equivocado», porque no había un sitio general donde equivocarse. Ahora lo hay.
--   Mitigaciones que sí se aplican: el aviso de datos sensibles sigue funcionando igual
--   (marca cédulas, teléfonos y coordenadas antes de enviar), la interfaz dice de forma
--   explícita que los datos de un caso van en su caso, y todo queda registrado con autor.
--   Lo que NO trae —y conviene saberlo antes de abrirlo a todo el mundo— es moderación:
--   no hay denuncia de mensajes ni silenciado. Si el general se llena de ruido o alguien
--   lo usa mal, hoy la única herramienta es hablar con esa persona.
--
-- (2) STICKERS
--
--   Un catálogo CERRADO que vive en el repositorio, no imágenes que suba cada quien. Sin
--   subida no hay moderación de imágenes, ni almacenamiento que pagar, ni el problema de
--   que alguien mande algo que no debe a un canal donde hay 200 personas. El mensaje
--   guarda el ID del sticker, y el texto del `cuerpo` sigue siendo su etiqueta («Voy en
--   camino»), de modo que el registro, los avisos y un lector de pantalla se leen igual
--   de bien aunque no se pinte el dibujo.
--
--   `stickers_disponibles()` es plpgsql y no `language sql`, por la misma razón que las
--   demás funciones-catálogo del repo (regla escrita en 0216): el cuerpo se planifica al
--   llamarla, no al crearla.
--
-- ENUM-SAFETY: no crea ni añade ningún valor de enum. 'general' entra en el CHECK de
--   `ambito` con drop/add constraint, que es exactamente para lo que se eligió TEXT+CHECK
--   en 0231.
--
-- OJO AL REAPLICAR 0231 A MANO: esta migración SUSTITUYE tres de sus funciones
--   (`abrir_hilo`, `escribir_en_hilo`, `puede_leer_ancla`) y a una le cambia la firma.
--   Volver a ejecutar 0231 por encima falla («cannot remove parameter defaults») y, peor,
--   resucitaría la firma vieja de `escribir_en_hilo` dejando dos y con ellas la
--   ambigüedad de PostgREST que el repo evita desde 0222. Un `db reset` replaya la cadena
--   entera desde vacío y en orden: eso sí funciona. Lo que no se debe hacer es correr una
--   migración antigua suelta sobre una base que ya tiene las nuevas.
--
-- Idempotente. Ejecutar tras 0234.
-- ============================================================

-- ═══ (1) El ámbito 'general' ═══
alter table public.hilos drop constraint if exists hilos_ambito_check;
alter table public.hilos add constraint hilos_ambito_check
  check (ambito in ('caso','insumo','tarea','grupo','general'));

comment on column public.hilos.ancla_id is
  'Id de la entidad de la que cuelga: casos.id, solicitudes_insumo.id, tareas.id o grupos.id según `ambito`. En el ámbito ''general'' NO hay entidad y se usa el UUID centinela de ceros (0235): mantener la columna NOT NULL deja intacto el índice único (ambito, ancla_id), que es lo único que garantiza que exista UNA sola conversación general.';

-- ═══ (2) Catálogo de stickers ═══
-- Cerrado y versionado con el código: el espejo que los dibuja está en
-- apps/web/lib/stickers.tsx y tiene que llevar exactamente estos identificadores.
create or replace function public.stickers_disponibles()
returns text[] language plpgsql immutable as $$
begin
  return array[
    'voy',        -- Voy en camino
    'recibido',   -- Recibido
    'hecho',      -- Hecho
    'gracias',    -- Gracias
    'ayuda',      -- Necesito ayuda
    'espera',     -- Un momento
    'ok',         -- Todo bien
    'corazon'     -- Con cariño (tricolor)
  ];
end $$;

revoke all on function public.stickers_disponibles() from public;
grant execute on function public.stickers_disponibles() to authenticated;

comment on function public.stickers_disponibles() is
  'Catálogo cerrado de stickers (0235). plpgsql y no `language sql` por la regla del repo (0216): el cuerpo se planifica al llamarla. El espejo que los dibuja vive en apps/web/lib/stickers.tsx y debe llevar los mismos identificadores.';

alter table public.hilo_mensajes add column if not exists sticker text;

comment on column public.hilo_mensajes.sticker is
  'Identificador del sticker, de stickers_disponibles() (0235). Cuando va relleno, `cuerpo` guarda su etiqueta en texto —«Voy en camino»—, para que el registro, los avisos y un lector de pantalla funcionen aunque el dibujo no se pinte.';

-- ═══ (3) Lectura del ámbito general ═══
-- Se reescribe COMPLETA desde 0231 añadiendo la rama 'general'. El resto queda idéntico.
create or replace function public.puede_leer_ancla(p_ambito text, p_ancla uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_ambito is null or p_ancla is null then return false; end if;
  if not public.es_verificado() then return false; end if;

  if p_ambito = 'general' then
    -- Toda la organización verificada. No hay ancla que comprobar: el centinela es fijo.
    return true;

  elsif p_ambito = 'caso' then
    return public.puede_leer_caso(p_ancla);

  elsif p_ambito = 'insumo' then
    -- Espejo EXACTO de la compuerta de /insumos/[id]: «gestor o consulta de Alianzas».
    -- Deliberadamente MÁS ESTRECHO que `solins_lectura` (0050), que es `es_verificado()`.
    return exists (select 1 from public.solicitudes_insumo s where s.id = p_ancla)
       and (public.puede_logistica() or public.puede_alianzas());

  elsif p_ambito = 'tarea' then
    return public.puede_ver_tarea(p_ancla);

  elsif p_ambito = 'grupo' then
    return public.es_admin()
        or public.es_miembro_de(p_ancla)
        or exists (select 1 from public.grupos g where g.id = p_ancla and g.lider_id = auth.uid());
  end if;

  return false;   -- ámbito desconocido: se niega, no se abre
end $$;

revoke all on function public.puede_leer_ancla(text, uuid) from public;
grant execute on function public.puede_leer_ancla(text, uuid) to authenticated;

-- Avisos por mención: en el general, quien esté verificado puede leerlo, así que se puede
-- responder por un tercero sin reproducir el predicado de casos_select.
create or replace function public.perfil_puede_leer_hilo(p_perfil uuid, p_hilo uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_amb text; v_ancla uuid; v_verificado boolean;
begin
  if p_perfil is null or p_hilo is null then return false; end if;
  select p.verificado into v_verificado from public.perfiles p where p.id = p_perfil;
  if not coalesce(v_verificado, false) then return false; end if;

  select h.ambito, h.ancla_id into v_amb, v_ancla from public.hilos h where h.id = p_hilo;
  if v_amb is null then return false; end if;

  if v_amb = 'general' then
    return true;                                   -- verificado basta, ya comprobado arriba
  elsif v_amb = 'grupo' then
    return exists (select 1 from public.miembros_grupo mg
                    where mg.grupo_id = v_ancla and mg.perfil_id = p_perfil)
        or exists (select 1 from public.grupos g where g.id = v_ancla and g.lider_id = p_perfil)
        or exists (select 1 from public.perfiles p where p.id = p_perfil and (p.rol = 'admin' or p.super_admin));
  elsif v_amb = 'tarea' then
    return exists (select 1 from public.tareas t
                    where t.id = v_ancla
                      and (t.asignado_a = p_perfil or t.creado_por = p_perfil
                           or (t.grupo_id is not null and exists (
                                 select 1 from public.miembros_grupo mg
                                  where mg.grupo_id = t.grupo_id and mg.perfil_id = p_perfil))))
        or exists (select 1 from public.tarea_personas tp where tp.tarea_id = v_ancla and tp.perfil_id = p_perfil)
        or exists (select 1 from public.perfiles p where p.id = p_perfil and (p.rol = 'admin' or p.super_admin));
  end if;

  -- 'caso' e 'insumo': se queda del lado seguro (ver 0231).
  return exists (select 1 from public.hilo_participantes hp
                  where hp.hilo_id = p_hilo and hp.perfil_id = p_perfil)
      or exists (select 1 from public.perfiles p where p.id = p_perfil and (p.rol = 'admin' or p.super_admin));
end $$;

revoke all on function public.perfil_puede_leer_hilo(uuid, uuid) from public;
grant execute on function public.perfil_puede_leer_hilo(uuid, uuid) to authenticated;

-- ═══ (4) abrir_hilo con el centinela ═══
create or replace function public.abrir_hilo(p_ambito text, p_ancla uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_amb    text := lower(nullif(btrim(coalesce(p_ambito, '')), ''));
  -- Centinela del ámbito general: quien llama nunca tiene que conocerlo.
  v_ancla  uuid := case when v_amb = 'general'
                        then '00000000-0000-0000-0000-000000000000'::uuid
                        else p_ancla end;
  v_id     uuid;
  v_existe boolean;
begin
  if v_amb is null or v_ancla is null then
    raise exception 'Falta indicar de qué cuelga la conversación.' using errcode = '22023';
  end if;
  if v_amb not in ('caso','insumo','tarea','grupo','general') then
    raise exception 'Ámbito de conversación no válido: %', v_amb using errcode = '22023';
  end if;
  if not public.puede_leer_ancla(v_amb, v_ancla) then
    raise exception 'No tienes acceso a esta conversación.' using errcode = '42501';
  end if;

  -- El ancla tiene que existir de verdad. El general no tiene fila que comprobar: su
  -- «existencia» es que la persona esté verificada, y eso ya lo dijo puede_leer_ancla().
  v_existe := case v_amb
    when 'general' then true
    when 'caso'    then exists (select 1 from public.casos              where id = v_ancla)
    when 'insumo'  then exists (select 1 from public.solicitudes_insumo where id = v_ancla)
    when 'tarea'   then exists (select 1 from public.tareas             where id = v_ancla)
    when 'grupo'   then exists (select 1 from public.grupos             where id = v_ancla)
  end;
  if not v_existe then
    raise exception 'No encuentro aquello de lo que cuelga la conversación.' using errcode = 'P0002';
  end if;

  select h.id into v_id from public.hilos h where h.ambito = v_amb and h.ancla_id = v_ancla;
  if v_id is not null then return v_id; end if;

  perform set_config('app.hilo_ok', '1', true);
  insert into public.hilos (ambito, ancla_id, creado_por)
  values (v_amb, v_ancla, auth.uid())
  on conflict (ambito, ancla_id) do nothing
  returning id into v_id;
  perform set_config('app.hilo_ok', '', true);

  if v_id is null then   -- carrera: otro lo creó entre el select y el insert
    select h.id into v_id from public.hilos h where h.ambito = v_amb and h.ancla_id = v_ancla;
  end if;
  return v_id;
end $$;

revoke all on function public.abrir_hilo(text, uuid) from public;
grant execute on function public.abrir_hilo(text, uuid) to authenticated;

-- ═══ (5) escribir_en_hilo con sticker ═══
-- La firma CAMBIA (un parámetro más), así que se elimina la anterior de forma explícita:
-- si conviven las dos, PostgREST puede resolver la equivocada (misma razón que 0230, 0222).
drop function if exists public.escribir_en_hilo(text, uuid, text, uuid[]);

create or replace function public.escribir_en_hilo(
  p_ambito    text,
  p_ancla     uuid default null,
  p_cuerpo    text default null,
  p_menciones uuid[] default null,
  p_sticker   text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_hilo    uuid;
  v_sticker text := nullif(btrim(coalesce(p_sticker, '')), '');
  v_cuerpo  text := nullif(btrim(coalesce(p_cuerpo, '')), '');
  v_sello   text;
  v_msg     uuid;
  v_pii     text[];
  v_enlace  text;
  v_titulo  text;
  v_amb     text;
  v_ancla   uuid;
begin
  if v_sticker is not null then
    if not (v_sticker = any(public.stickers_disponibles())) then
      raise exception 'Sticker no válido: %', v_sticker using errcode = '22023';
    end if;
    -- Un sticker sin texto guarda su etiqueta como cuerpo. La pone la app; si no viene,
    -- se usa el propio identificador para que el registro nunca quede vacío.
    if v_cuerpo is null then v_cuerpo := v_sticker; end if;
  end if;

  if v_cuerpo is null then
    raise exception 'El mensaje está vacío.' using errcode = '22023';
  end if;
  if length(v_cuerpo) > 4000 then
    raise exception 'El mensaje es demasiado largo (máximo 4000 caracteres).' using errcode = '22023';
  end if;

  v_hilo := public.abrir_hilo(p_ambito, p_ancla);
  if not public.puede_escribir_hilo(v_hilo) then
    raise exception 'No puedes escribir en esta conversación.' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(p.nombre_completo), ''), 'Alguien') into v_sello
    from public.perfiles p where p.id = auth.uid();
  v_sello := coalesce(v_sello, 'Alguien');
  -- Un sticker es texto de catálogo, no algo que la persona escribió: no se analiza.
  v_pii := case when v_sticker is null then public.detectar_datos_sensibles(v_cuerpo)
                else array[]::text[] end;

  perform set_config('app.hilo_ok', '1', true);

  insert into public.hilo_mensajes (hilo_id, autor_id, autor_sello, cuerpo, pii_alerta, sticker)
  values (v_hilo, auth.uid(), v_sello, v_cuerpo, v_pii, v_sticker)
  returning id into v_msg;

  update public.hilos
     set ultimo_mensaje_en = now(),
         mensajes_n        = mensajes_n + 1
   where id = v_hilo;

  insert into public.hilo_participantes (hilo_id, perfil_id, leido_hasta)
  values (v_hilo, auth.uid(), now())
  on conflict (hilo_id, perfil_id) do update set leido_hasta = excluded.leido_hasta;

  if p_menciones is not null and array_length(p_menciones, 1) > 0 then
    insert into public.hilo_menciones (mensaje_id, perfil_id)
    select v_msg, u.pid
      from (select distinct unnest(p_menciones) as pid) u
     where u.pid is not null
       and u.pid <> auth.uid()
       and exists (select 1 from public.perfiles p where p.id = u.pid)
    on conflict do nothing;
  end if;

  perform set_config('app.hilo_ok', '', true);

  select h.ambito, h.ancla_id into v_amb, v_ancla from public.hilos h where h.id = v_hilo;
  v_enlace := case v_amb
    when 'caso'    then '/casos/'   || v_ancla
    when 'insumo'  then '/insumos/' || v_ancla
    when 'tarea'   then '/tareas/'  || v_ancla
    when 'grupo'   then '/grupos/'  || v_ancla
    when 'general' then '/conversaciones'
  end;
  v_titulo := case v_amb
    when 'caso'    then 'Te mencionaron en una solicitud'
    when 'insumo'  then 'Te mencionaron en una solicitud de insumos'
    when 'tarea'   then 'Te mencionaron en una tarea'
    when 'grupo'   then 'Te mencionaron en tu grupo'
    when 'general' then 'Te mencionaron en la conversación general'
  end;

  insert into public.notificaciones (destinatario_id, tipo, titulo, cuerpo, enlace)
  select m.perfil_id, 'mencion', v_titulo,
         v_sello || ': ' || left(v_cuerpo, 140) || case when length(v_cuerpo) > 140 then '…' else '' end,
         v_enlace
    from public.hilo_menciones m
   where m.mensaje_id = v_msg
     and public.perfil_puede_leer_hilo(m.perfil_id, v_hilo);

  perform public.registrar_auditoria('hilo_mensaje', 'hilos', v_hilo::text,
    jsonb_build_object('mensaje', v_msg, 'ambito', v_amb, 'ancla', v_ancla,
                       'pii', v_pii, 'sticker', v_sticker,
                       'menciones', coalesce(array_length(p_menciones, 1), 0)));

  return v_msg;
end $$;

revoke all on function public.escribir_en_hilo(text, uuid, text, uuid[], text) from public;
grant execute on function public.escribir_en_hilo(text, uuid, text, uuid[], text) to authenticated;

comment on function public.escribir_en_hilo(text, uuid, text, uuid[], text) is
  'Escribe en un hilo (0231, ampliada en 0235 con sticker y ámbito general). Con `p_sticker` el cuerpo guarda su etiqueta, para que el registro y los avisos se lean igual sin el dibujo. Un sticker no pasa por el detector de datos sensibles: es texto de catálogo, no algo que la persona escribió.';

-- ═══ (6) La conversación general nace ya creada ═══
-- Sin esto, la primera persona que abra el panel no vería el general hasta escribir en él,
-- y «no existe hasta que alguien hable» es justo lo que hace que nadie hable primero.
do $mig$
declare v_centinela uuid := '00000000-0000-0000-0000-000000000000';
begin
  if not exists (select 1 from public.hilos where ambito = 'general') then
    insert into public.hilos (ambito, ancla_id, creado_por)
    values ('general', v_centinela, null)
    on conflict (ambito, ancla_id) do nothing;
  end if;
end $mig$;
