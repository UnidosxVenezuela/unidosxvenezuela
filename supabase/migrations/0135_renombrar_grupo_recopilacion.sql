-- ============================================================
-- 0135 — Renombrar grupo: «Gestión de Casos» → «Recopilación y Gestión de la Información»
-- ------------------------------------------------------------
-- Solo cambia el NOMBRE visible del grupo. El identificador de sistema `clave`
-- ('gestion_casos') y el rol asociado ('recopilacion') NO cambian, para no romper
-- permisos, RLS ni el código de la app (que referencia la `clave`, nunca el nombre).
-- Idempotente (el UPDATE por `clave` puede reejecutarse sin efecto). Ejecutar tras 0134.
-- ============================================================

update public.grupos
   set nombre = 'Recopilación y Gestión de la Información'
 where clave = 'gestion_casos';
