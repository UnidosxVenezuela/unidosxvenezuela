-- ============================================================
-- 0138 — Desactivar (ocultar) grupos y roles que ya no se usan
-- ------------------------------------------------------------
-- La plataforma deja de hacer digitalización de listados y búsqueda de personas.
-- Se DESACTIVAN los grupos del sistema de esas labores — NO se borran: es reversible
-- (activa=true los vuelve a mostrar y nada se pierde). Se añade `grupos.activa` y la app
-- oculta los inactivos de /grupos y de los selectores de administración.
--
-- Grupos desactivados (por `clave`):
--   busqueda · busqueda_nna · enlace_contacto · verificacion_digitalizacion · digitalizacion
--
-- Los ROLES asociados (busqueda, buscador_nna, enlace_contacto, verificador_digitalizacion,
-- digitalizador) se retiran de las listas ASIGNABLES en la app (un valor de enum no se
-- puede borrar sin riesgo). Quien ya los tenga los conserva, pero quedan inertes: sus
-- módulos ya no están en el menú y sus grupos están inactivos. Reversible.
--
-- No se borran filas ni membresías (reversible). Sin cambios de RLS/triggers/FKs.
-- Idempotente. Ejecutar tras 0137.
-- ============================================================

alter table public.grupos add column if not exists activa boolean not null default true;

update public.grupos set activa = false
 where clave in ('busqueda', 'busqueda_nna', 'enlace_contacto',
                 'verificacion_digitalizacion', 'digitalizacion');
