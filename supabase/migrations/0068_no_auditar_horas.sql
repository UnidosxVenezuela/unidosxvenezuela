-- ============================================================
-- 0068 — El registro de horas deja de llenar el Registro de actividad
-- ------------------------------------------------------------
-- El conteo AUTOMÁTICO de tiempo de sesión (RPC sumar_horas_sesion, usado por el
-- componente RegistrarActividad) hace upsert en registro_horas cada pocos
-- minutos de actividad, lo que generaba un "editó horas" sin parar en la
-- auditoría. Las horas no requieren auditoría, así que se quita ese trigger.
-- Idempotente. Los eventos "editó horas" anteriores quedan; solo dejan de crearse.
-- ============================================================

drop trigger if exists aud_registro_horas on public.registro_horas;
