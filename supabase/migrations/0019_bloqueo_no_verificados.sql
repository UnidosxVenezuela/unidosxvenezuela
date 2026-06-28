-- ============================================================
-- 0019 — Bloqueo TOTAL de no verificados (la RLS es la fuente de verdad)
-- ============================================================
-- Complementa el gate de UI (pantalla de espera en el layout): un usuario
-- sin verificar tampoco puede ver tareas abiertas ni tomarlas vía API.
-- ============================================================

-- Tareas abiertas: ahora también requieren verificación.
drop policy if exists "tareas_lectura_abiertas" on public.tareas;
create policy "tareas_lectura_abiertas" on public.tareas for select to authenticated
  using (asignado_a is null and estado = 'pendiente' and public.es_verificado());

-- Tomar tarea: además de no-observador, exige verificación.
create or replace function public.tomar_tarea(p_tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_verificado() then
    raise exception 'Tu cuenta aún no fue verificada por la coordinación.' using errcode = '42501';
  end if;
  if public.mi_rol() = 'observador' then
    raise exception 'Los observadores no pueden tomar tareas.' using errcode = '42501';
  end if;
  update public.tareas
     set asignado_a = auth.uid(), estado = 'asignada'
   where id = p_tarea and asignado_a is null;
  if not found then
    raise exception 'La tarea ya fue tomada o no existe.';
  end if;
end; $$;
