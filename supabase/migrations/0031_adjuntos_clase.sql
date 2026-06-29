-- ============================================================
-- 0031 — Adjuntos: material de la tarea vs entregables
-- ============================================================
-- 'material'   = insumos que aporta quien crea/coordina la tarea.
-- 'entregable' = lo que sube la persona asignada (su trabajo terminado).
-- Permisos de subida ya los cubre puede_editar_tarea (0026): coordinación,
-- creador, líder del grupo y participantes de la tarea.
-- ============================================================

alter table public.adjuntos_tarea
  add column if not exists clase text not null default 'material'
    check (clase in ('material', 'entregable'));
