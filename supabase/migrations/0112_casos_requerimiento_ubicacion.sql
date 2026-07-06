-- ============================================================
-- 0112 — Casos «requerimiento con ubicación» + capa de mapa (Propuesta Fase 1)
-- ------------------------------------------------------------
-- «De la información a la acción»: un caso que es una SOLICITUD DE AYUDA con
-- ubicación (un hospital sin insumos, un refugio sin agua…) debe poder marcarse
-- en el mapa para convertirse en respuesta coordinada. Fase 1: marcar el caso y
-- verlo en el mapa. (Fase 2 = derivar a Logística; Fase 3 = centro cercano + cierre.)
--
-- Se AÑADEN columnas a `casos` (no una tabla aparte) para conservar el flujo, la
-- verificación y la frontera por categoría ya existentes:
--   · es_requerimiento  bool  — marca de solicitud de ayuda accionable.
--   · lat/lng           float — ubicación (como tareas/puntos_acopio; sin PostGIS).
--   · req_tipo          public.tipo_insumo  — qué insumo (REUTILIZA el enum de 0050).
--   · req_cantidad      text  — cantidad estimada (libre, como solicitudes_insumo).
--   · req_urgencia      public.prioridad    — urgencia (REUTILIZA el enum de 0001).
-- Reutilizar los enums existentes evita el peligro de enum-safety (no se añaden
-- valores nuevos) y deja la Fase 2 mapeando 1:1 caso → solicitud de insumo.
--
-- Frontera: un requerimiento NUNCA es 'Desaparecidos' (esos van a Búsqueda, no a
-- Logística) y SIEMPRE tiene ubicación — un CHECK lo garantiza. Además, la capa del
-- mapa se sirve por una RPC SECURITY DEFINER que devuelve SOLO campos aptos para el
-- mapa (sin descripción/notas/fuente) a la audiencia del mapa (admin/logística/
-- digitalización), sin ensanchar la RLS de `casos` (que protege el resto del caso).
--
-- Idempotente. Ejecutar tras 0111.
-- ============================================================

-- ── Columnas nuevas en casos ──
alter table public.casos add column if not exists es_requerimiento boolean not null default false;
alter table public.casos add column if not exists lat double precision;
alter table public.casos add column if not exists lng double precision;
alter table public.casos add column if not exists req_tipo public.tipo_insumo;
alter table public.casos add column if not exists req_cantidad text;
alter table public.casos add column if not exists req_urgencia public.prioridad;

-- Integridad: un requerimiento exige ubicación y no puede ser 'Desaparecidos'.
-- (Las filas existentes tienen es_requerimiento=false, así que el CHECK las acepta.)
alter table public.casos drop constraint if exists casos_requerimiento_chk;
alter table public.casos add constraint casos_requerimiento_chk
  check (
    not es_requerimiento
    or (lat is not null and lng is not null and categoria is distinct from 'Desaparecidos')
  );

-- Índice para la consulta del mapa (solo requerimientos ubicados).
create index if not exists idx_casos_requerimiento
  on public.casos (estado) where es_requerimiento and lat is not null;

-- ── Capa del mapa: RPC curada (solo campos aptos para el mapa) ──
-- La página del mapa autoriza admin/logística/digitalización, pero la RLS de casos
-- restringe la lectura a verificación/búsqueda; por eso la capa se sirve por esta
-- función SECURITY DEFINER que expone ÚNICAMENTE lo necesario para pintar el punto
-- (nada de descripción, notas o fuente). Devuelve solo requerimientos CONFIRMADOS y
-- ubicados, nunca 'Desaparecidos'. La autorización va en el WHERE (no depende de la
-- fila): si el rol no es de la audiencia del mapa, devuelve 0 filas.
create or replace function public.solicitudes_ayuda_mapa()
returns table (
  id uuid, titulo text, categoria text,
  lat double precision, lng double precision,
  tipo text, urgencia text, estado text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.titulo, c.categoria, c.lat, c.lng,
         c.req_tipo::text, c.req_urgencia::text, c.estado::text
  from public.casos c
  where c.es_requerimiento
    and c.lat is not null and c.lng is not null
    and c.categoria is distinct from 'Desaparecidos'
    and c.estado::text in ('confirmado', 'enviado_redaccion')
    and (public.es_admin() or public.puede_logistica() or public.tiene_rol('digitalizador'));
$$;
grant execute on function public.solicitudes_ayuda_mapa() to authenticated;
