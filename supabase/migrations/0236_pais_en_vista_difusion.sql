-- ============================================================
-- 0236 — El PAÍS llega a Redacción
-- ------------------------------------------------------------
-- PROBLEMA: desde 0230 la plataforma atiende DOS respuestas a la vez, Venezuela y
--   Colombia, y `casos.pais` lo guarda. Pero Redacción no lee `casos` —desde 0180 se le
--   quitó esa rama de `casos_select` y lee la vista curada `casos_difusion`—, y esa vista
--   tiene lista EXPLÍCITA de columnas. `pais` no estaba en ella, así que en el tablero de
--   Redacción las dos respuestas se veían exactamente igual.
--
--   Eso no es un detalle cosmético: quien redacta escribe el llamado público, elige el
--   canal y el tono, y menciona instituciones y puntos de acopio. Confundir un caso
--   colombiano con uno venezolano manda a la gente al organismo equivocado.
--
-- QUÉ HACE: reescribe `casos_difusion` VERBATIM de 0211 y le añade una sola columna,
--   `c.pais`. No toca el WHERE ni el gate por rol: quién ve qué filas queda EXACTAMENTE
--   igual que antes de esta migración. La única diferencia es una columna más en filas
--   que ya eran visibles.
--
-- POR QUÉ AL FINAL DE LA LISTA: Postgres solo deja añadir columnas por el final en un
--   `create or replace view`. Dejándola ahí, la próxima ampliación de esta vista podrá
--   ser un `create or replace` en vez del sexto drop/create.
--
-- POR QUÉ drop/create AQUÍ Y NO `create or replace`: es el patrón con el que se ha
--   reescrito esta vista las cinco veces anteriores (0180 → 0189 → 0208 → 0209 → 0211),
--   y 0222 dejó documentado —y respetado— que ninguna otra vista depende de ella
--   precisamente para que el drop nunca se bloquee. Se mantiene el modelo mental del
--   operador; el `grant` se vuelve a poner en la línea siguiente, como siempre.
--
-- LO QUE NO HACE: Logística NO necesita migración. Su tablero lee `solicitudes_insumo`,
--   que no guarda país, pero desde 0223 toda solicitud nace con su caso detrás, así que
--   el país se lee por el join a `casos` que esa página ya hacía para el número.
--
-- Idempotente. Requiere 0230 (columna `casos.pais`). Ejecutar tras 0235.
-- ============================================================

-- Guardia de orden: sin 0230 esto reventaría con «column c.pais does not exist», que no
-- le dice a nadie qué falta. Mejor decirlo con todas las letras.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'casos' and column_name = 'pais'
  ) then
    raise exception 'Falta la migración 0230: la columna public.casos.pais no existe. Aplica 0230 antes que 0236.';
  end if;
end $$;

drop view if exists public.casos_difusion;
create view public.casos_difusion
  with (security_invoker = false) as
  select
    c.id, c.numero, c.titulo, c.descripcion, c.categoria,
    c.fuente, c.fuente_url, c.fecha_publicacion,
    c.contacto_difusion, c.autoriza_difusion, c.notas,
    c.creado_por, c.actualizado_en, c.requiere_difusion,
    c.es_requerimiento, c.req_tipo, c.req_cantidad, c.req_urgencia,
    c.lat, c.lng, c.estado, c.publicado_en, c.publicacion_url,
    c.redactor_id, c.canales_publicacion,
    c.tipo_difusion, c.url_original,
    c.contacto, c.referente, c.contacto_whatsapp, c.contacto_instagram, c.referente_rol,
    -- Procedencia (0211): distingue la solicitud creada por Logística por cobertura parcial.
    c.origen_area, c.caso_padre_id,
    (select p.numero from public.casos p where p.id = c.caso_padre_id) as caso_padre_numero,
    -- País de la solicitud (0230), la única línea nueva de 0236.
    c.pais
  from public.casos c
  where c.categoria is distinct from 'Desaparecidos'
    and (
      c.publicado_en is not null
      or c.requiere_difusion
      or c.estado::text = 'enviado_redaccion'
      or exists (select 1 from public.casos_derivaciones d where d.caso_id = c.id and d.area = 'redes')
    )
    and public.es_verificado()
    and (public.es_admin() or public.opera_redes() or public.tiene_rol('redaccion'));

grant select on public.casos_difusion to authenticated;

comment on view public.casos_difusion is
  'Fuente de Redacción/Redes. Ruteo EXPLÍCITO (0208): solo lo derivado a «redes» / enviado a redacción / requiere_difusion / publicado. Expone el contacto interno (0209), la procedencia del caso (0211: origen_area/caso_padre_*) y el país (0236, columna de 0230: con dos respuestas a la vez, redactar un caso colombiano como venezolano manda a la gente al organismo equivocado). Se auto-acota por rol.';
