-- ============================================================
-- 0171 — Contacto estructurado de la solicitud (referente + WhatsApp + Instagram)
-- ------------------------------------------------------------
-- Hasta ahora una solicitud (caso) guardaba el contacto en un solo campo de texto
-- libre (`contacto`). El requerimiento (Paso 3) exige datos prioritarios claros:
--   • Nombre del referente, persona o institución.
--   • Contacto útil: WhatsApp/teléfono y/o Instagram (con uno basta).
--
-- Esta migración agrega esas columnas de forma ADITIVA (nullable): no rompe filas
-- existentes ni consumidores que leen `contacto` (la app sigue componiendo ese
-- campo con los contactos para retrocompatibilidad). La obligatoriedad se aplica en
-- la capa de la app al CREAR (no como NOT NULL, para no bloquear filas históricas ni
-- inserciones de otros flujos). Idempotente. Tras 0168.
-- ============================================================

alter table public.casos add column if not exists referente text;
alter table public.casos add column if not exists contacto_whatsapp text;
alter table public.casos add column if not exists contacto_instagram text;
