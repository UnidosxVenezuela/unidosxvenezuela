-- ============================================================
-- 0148 — Renombrar el grupo «Gestión de Acopio» → «Logística»
-- ------------------------------------------------------------
-- Solo cambia el NOMBRE VISIBLE del grupo. La CLAVE de sistema ('gestion_acopio')
-- NO cambia: el código, la RLS y los mapeos rol↔grupo siguen usándola. El rol del
-- grupo ya es 'logistica', así que el nombre queda alineado con su función.
-- Idempotente. Ejecutar tras 0147.
-- ============================================================

update public.grupos set nombre = 'Logística' where clave = 'gestion_acopio';
