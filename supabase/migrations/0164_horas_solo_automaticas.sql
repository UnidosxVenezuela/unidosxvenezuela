-- ============================================================
-- 0164 — Las horas de voluntariado se cuentan SOLO de forma automática
-- ------------------------------------------------------------
-- Se elimina el ingreso/edición manual de horas: la única vía pasa a ser el
-- conteo automático de sesión (RPC sumar_horas_sesion, 0017, SECURITY DEFINER,
-- que NO depende de estas policies). Se cierran las policies de INSERT/UPDATE
-- del cliente y el DELETE queda solo para coordinación (limpieza de errores).
-- La lectura (horas_lectura_propia_o_coord, 0011) no cambia.
-- Idempotente. Ejecutar tras 0163.
-- ============================================================

drop policy if exists horas_insert_propia on public.registro_horas;
drop policy if exists horas_update_propia_o_coord on public.registro_horas;
drop policy if exists horas_delete_propia_o_coord on public.registro_horas;

drop policy if exists horas_delete_coordinacion on public.registro_horas;
create policy horas_delete_coordinacion on public.registro_horas for delete to authenticated
  using (public.es_coordinacion());
