-- ============================================================
-- 0017 — Horas automáticas por tiempo de sesión
-- ============================================================
-- Se acumulan en una fila 'auto' por (usuario, día) que un heartbeat
-- del cliente va sumando. El tope de 24h/día (trigger de 0011) aplica.
-- ============================================================

alter table public.registro_horas
  add column if not exists fuente text not null default 'manual'
  check (fuente in ('manual', 'auto'));

-- Una sola fila 'auto' por usuario y día (para acumular).
create unique index if not exists uq_horas_auto_dia
  on public.registro_horas (perfil_id, fecha) where (fuente = 'auto');

-- Suma minutos de sesión a la fila 'auto' de hoy (crea si no existe).
create or replace function public.sumar_horas_sesion(p_minutos numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_horas numeric := greatest(p_minutos, 0) / 60.0;
begin
  if v_horas <= 0 then return; end if;
  update public.registro_horas
     set horas = horas + v_horas
   where perfil_id = auth.uid() and fecha = current_date and fuente = 'auto';
  if not found then
    insert into public.registro_horas (perfil_id, horas, fuente, descripcion)
    values (auth.uid(), v_horas, 'auto', 'Tiempo de sesión');
  end if;
exception
  -- Si el tope diario de 24h se supera, no es un error para el usuario.
  when check_violation then null;
end; $$;

revoke all on function public.sumar_horas_sesion(numeric) from public;
grant execute on function public.sumar_horas_sesion(numeric) to authenticated;
