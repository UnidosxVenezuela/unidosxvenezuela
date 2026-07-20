-- ============================================================
-- 0186 — Caducidad y lote en el inventario de acopio
-- ------------------------------------------------------------
-- El inventario (inventario_acopio, 0065) no tenía fecha de vencimiento ni lote: se
-- podía entregar producto vencido sin que nada avisara, y no había forma de ver «qué
-- está por caducar» en toda la red. Se agregan dos columnas opcionales por producto:
--   · vencimiento (date)  → la fecha de caducidad del producto en ese centro.
--   · lote (text)         → identificador de lote / tanda (para trazabilidad).
-- V1: una fecha/lote por fila (punto, producto). Un modelo multi-lote sería fase 2.
-- Las escribe quien gestiona el centro (la RLS inv_update de 0065 no cambia). La app
-- las captura al ingresar/reponer y pinta un badge «vence pronto/vencido». Idempotente.
-- ============================================================

alter table public.inventario_acopio add column if not exists vencimiento date;
alter table public.inventario_acopio add column if not exists lote text;

comment on column public.inventario_acopio.vencimiento is
  'Fecha de caducidad del producto en este centro (0186). Opcional; la usa el badge «vence pronto/vencido» y el panel «Próximos a vencer» del Tablero de red.';
comment on column public.inventario_acopio.lote is
  'Identificador de lote/tanda para trazabilidad (0186). Opcional.';

-- Índice para el panel «Próximos a vencer» (barre por fecha entre lo que tiene fecha).
create index if not exists idx_inv_vencimiento on public.inventario_acopio (vencimiento) where vencimiento is not null;
