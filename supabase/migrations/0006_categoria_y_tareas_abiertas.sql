-- ============================================================
-- Categoría de trabajo + tareas de libre elección (abiertas)
-- ============================================================
-- Objetivo: que cualquier voluntario pueda colaborar tomando
-- tareas abiertas (sin asignar) según el tipo de trabajo.
-- ============================================================

-- Tipo de trabajo (distinto del área/cluster humanitario).
create type public.categoria_tarea as enum (
  'codigo', 'diseno', 'marketing', 'redes_sociales', 'transcripcion',
  'legal', 'acopio', 'logistica', 'datos', 'salud', 'traduccion',
  'comunicaciones', 'general'
);

alter table public.tareas
  add column categoria public.categoria_tarea not null default 'general';
create index idx_tareas_categoria on public.tareas (categoria);

-- ------------------------------------------------------------
-- Lectura: además de las reglas previas, cualquier autenticado
-- puede ver las tareas ABIERTAS (sin asignar y pendientes) para
-- poder tomarlas. (Se suma a las políticas de 0002.)
-- ------------------------------------------------------------
create policy "tareas_lectura_abiertas" on public.tareas for select
  to authenticated
  using (asignado_a is null and estado = 'pendiente');

-- ------------------------------------------------------------
-- Tomar una tarea abierta (auto-asignársela). SECURITY DEFINER:
-- es el único camino controlado para que un voluntario se asigne
-- sin abrir un update genérico en RLS.
-- ------------------------------------------------------------
create or replace function public.tomar_tarea(p_tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tareas
     set asignado_a = auth.uid(), estado = 'asignada'
   where id = p_tarea and asignado_a is null;
  if not found then
    raise exception 'La tarea ya fue tomada o no existe.';
  end if;
end; $$;

-- Liberar una tarea propia (vuelve a estar abierta).
create or replace function public.liberar_tarea(p_tarea uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tareas
     set asignado_a = null, estado = 'pendiente'
   where id = p_tarea and asignado_a = auth.uid();
  if not found then
    raise exception 'No puedes liberar esta tarea.';
  end if;
end; $$;
