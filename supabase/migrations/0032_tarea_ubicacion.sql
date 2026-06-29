-- ============================================================
-- 0032 — Ubicación escrita de la tarea (además de lat/lng GPS, opcionales)
-- ============================================================
-- No todas las tareas necesitan ubicación. Si se requiere, se puede escribir
-- (dirección/referencia) y/o marcar con GPS (lat/lng) para más exactitud.
-- ============================================================

alter table public.tareas
  add column if not exists ubicacion text;
