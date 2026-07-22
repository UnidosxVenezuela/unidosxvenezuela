-- ============================================================
-- 0202 — Bandeja «Mi área»: RPC curada de las derivaciones que el operador puede trabajar
-- ------------------------------------------------------------
-- El operador puro de un área (logistica/redes/donaciones/captacion/alianzas…) YA puede
-- tomar/avanzar/cerrar su derivación por RPC (0177: el gate es puede_operar_area_derivacion,
-- por derivacion_id), pero NO tiene por dónde: los botones sólo viven en el detalle del caso
-- y ese detalle está cerrado para quien no es Recopilación/Verificación/Búsqueda.
--
-- Esta RPC SECURITY DEFINER (mismo molde curado que solicitudes_ayuda_mapa/seguimiento_casos)
-- devuelve, para el usuario actual, SUS derivaciones abiertas —las de las áreas que opera— con
-- los datos mínimos del caso para poder actuar sin abrir el detalle. Excluye la categoría
-- restringida «Desaparecidos» (flujo aparte). La acción de escritura sigue por las RPC de 0177.
-- Idempotente. Ejecutar tras 0201.
-- ============================================================

create or replace function public.mis_derivaciones()
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
  personas_afectadas int
) language sql stable security definer set search_path = public as $$
  select d.id, d.caso_id, d.area, d.accion, d.prioridad, d.observaciones, d.estado,
         d.derivado_en, d.tomado_por, d.tomado_en,
         c.numero, c.titulo, c.estado::text, c.categoria, c.personas_afectadas
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
