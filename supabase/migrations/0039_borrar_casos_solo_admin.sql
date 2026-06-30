-- 0039: Borrar casos = SOLO administradores (antes era toda la coordinación).
-- La UI agrega además una confirmación explícita antes de eliminar.

drop policy if exists "casos_delete" on public.casos;
create policy "casos_delete" on public.casos for delete to authenticated
  using (public.mi_rol() = 'admin');
