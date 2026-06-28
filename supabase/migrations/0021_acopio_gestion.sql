-- ============================================================
-- 0021 — Gestión de centros de acopio (capacidad, urgencia, edición)
-- ============================================================
alter table public.puntos_acopio add column if not exists capacidad text;
alter table public.puntos_acopio add column if not exists urgencia text not null default 'media'
  check (urgencia in ('alta', 'media', 'baja'));
alter table public.puntos_acopio add column if not exists actualizado_en timestamptz not null default now();

-- Marca de "última actualización" automática (reusa set_actualizado_en de 0001).
drop trigger if exists trg_acopio_actualizado on public.puntos_acopio;
create trigger trg_acopio_actualizado
  before update on public.puntos_acopio
  for each row execute function public.set_actualizado_en();

-- Edición colaborativa: cualquier verificado puede actualizar las necesidades
-- (lo que hace falta cambia seguido). Borrar sigue siendo del creador o coordinación.
drop policy if exists "acopio_update" on public.puntos_acopio;
create policy "acopio_update" on public.puntos_acopio for update
  to authenticated
  using (public.es_verificado() or public.es_coordinacion())
  with check (public.es_verificado() or public.es_coordinacion());
