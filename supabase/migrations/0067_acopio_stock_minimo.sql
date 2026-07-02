-- ============================================================
-- 0067 — Stock mínimo de inventario (alerta de bajo inventario)
-- ------------------------------------------------------------
-- Cada producto puede tener un MÍNIMO. Cuando la cantidad cae a ese nivel o por
-- debajo, la app lo marca como "bajo stock" para reponerlo/solicitarlo.
-- Idempotente.
-- ============================================================

alter table public.inventario_acopio
  add column if not exists minimo numeric not null default 0 check (minimo >= 0);
