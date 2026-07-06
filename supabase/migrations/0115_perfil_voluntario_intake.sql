-- ============================================================
-- 0115 — Ficha del voluntario: disponibilidad, experiencia y contacto de emergencia
-- ------------------------------------------------------------
-- A partir de la planilla de ingreso del Equipo de Búsqueda, se suman al PERFIL los
-- datos operativos que faltaban para coordinar un equipo distribuido y por capacidad:
--   · ciudad               — complementa `pais` (0108) para zona horaria/logística.
--   · disponibilidad       — horario disponible + zona horaria (texto libre).
--   · horas_semana         — capacidad semanal (texto: «5-10 horas», etc.).
--   · experiencia          — experiencia relevante (verificación/búsqueda/datos…).
--   · contacto_emergencia  — deber de cuidado (texto: «Nombre (relación) · teléfono»).
-- Los idiomas / herramientas / otras habilidades se guardan en `habilidades` (text[],
-- ya existente desde 0043) — no se crean columnas nuevas para eso.
--
-- Son columnas nullable en `perfiles`, autoeditables por la propia persona (el trigger
-- proteger_campos_perfil es una lista NEGRA de rol/verificado/roles_extra; no toca
-- estas). Nota de privacidad: viven en `perfiles` (como `pais`/`motivo`), así que la
-- UI limita la vista de `experiencia`/`contacto_emergencia` a administración; si más
-- adelante se requiere ocultarlos a nivel de datos, se migrarían a una tabla 1:1.
-- Idempotente. Ejecutar tras 0114.
-- ============================================================

alter table public.perfiles add column if not exists ciudad text;
alter table public.perfiles add column if not exists disponibilidad text;
alter table public.perfiles add column if not exists horas_semana text;
alter table public.perfiles add column if not exists experiencia text;
alter table public.perfiles add column if not exists contacto_emergencia text;
