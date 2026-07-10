-- ============================================================
-- 0137 — Casos: siempre «solicitud con ubicación» (sin clasificar tipo) + contacto
-- ------------------------------------------------------------
-- La plataforma ya no clasifica el tipo de caso ni hace búsqueda de personas: toda
-- información que llega se trata como una «solicitud con ubicación» (es_requerimiento +
-- lat/lng, categoría 'Otras informaciones'). El cambio es sobre todo de frontend/acción;
-- aquí solo se suman dos cosas de DATOS, aditivas y SIN tocar RLS/triggers/CHECK:
--   1) `contacto` — «¿quién es el responsable o referente?» (teléfono/WhatsApp/organización),
--      una de las preguntas del circuito de ayuda.
--   2) default de `categoria` = 'Otras informaciones' (red de seguridad: todo caso nuevo
--      cae del lado de Verificación; NUNCA 'Desaparecidos', que es la frontera con Búsqueda).
-- NO se toca la columna `categoria` en sí, ni las políticas de 0078/0106, ni el trigger de
-- búsqueda (0098), ni el CHECK de requerimiento (0112). Los casos «Desaparecidos» previos
-- conservan su categoría. Idempotente. Ejecutar tras 0136.
-- ============================================================

alter table public.casos add column if not exists contacto text;
comment on column public.casos.contacto is
  'Responsable/referente de la solicitud: teléfono, WhatsApp, organización o punto de contacto.';

alter table public.casos alter column categoria set default 'Otras informaciones';
