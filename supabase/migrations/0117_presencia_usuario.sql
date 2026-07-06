-- ============================================================
-- 0117 — Presencia del usuario: conectado / ocupado / desconectado
-- ------------------------------------------------------------
-- La persona puede fijarse como «conectado» u «ocupado» (interruptor junto a la
-- campana). Mientras su pestaña está abierta, un latido refresca `ultima_conexion`;
-- si no hubo latido reciente (~5 min), los demás la ven «desconectado».
--   · estado_presencia  text  — la elección de la persona (conectado|ocupado).
--   · ultima_conexion   timestamptz — último latido (para el «hace cuánto» y el online).
-- Autoeditables por la propia persona (el trigger proteger_campos_perfil es lista
-- negra de rol/verificado; no toca estas). El estado EFECTIVO (incl. desconectado) lo
-- calcula la app a partir de `ultima_conexion`. Idempotente. Ejecutar tras 0116.
-- ============================================================

alter table public.perfiles add column if not exists estado_presencia text not null default 'conectado';
alter table public.perfiles add column if not exists ultima_conexion timestamptz;

alter table public.perfiles drop constraint if exists perfiles_presencia_chk;
alter table public.perfiles add constraint perfiles_presencia_chk
  check (estado_presencia in ('conectado', 'ocupado'));

-- Índice para ordenar/filtrar por conexión reciente (admin/grupos).
create index if not exists idx_perfiles_ultima_conexion on public.perfiles (ultima_conexion desc nulls last);
