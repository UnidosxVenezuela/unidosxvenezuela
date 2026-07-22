-- ============================================================
-- 0206 — Trazabilidad de la tarea: historial append-only de cambios
-- ------------------------------------------------------------
-- Espejo de casos_historial_cambios (0178) para las tareas: cada vez que cambia el
-- ESTADO, la PRIORIDAD, la ASIGNACIÓN, el VENCIMIENTO o el CUPO, se guarda una fila
-- nueva (valor anterior → nuevo, quién y cuándo). «Nada se borra»: append-only.
--
-- Lectura: quien puede VER la tarea (se apoya en la RLS de `tareas` vía un EXISTS, así
-- el historial hereda exactamente la visibilidad de la tarea) o el admin. La escritura
-- va SOLO por el trigger (SECURITY DEFINER); la tabla no expone INSERT/UPDATE/DELETE.
-- Idempotente. Ejecutar tras 0205.
-- ============================================================

create table if not exists public.tarea_historial_cambios (
  id             uuid primary key default gen_random_uuid(),
  tarea_id       uuid not null references public.tareas(id) on delete cascade,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  actor_id       uuid references public.perfiles(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_tarea_hist_cambios on public.tarea_historial_cambios(tarea_id, creado_en);

alter table public.tarea_historial_cambios enable row level security;
drop policy if exists tarea_hist_select on public.tarea_historial_cambios;
create policy tarea_hist_select on public.tarea_historial_cambios
  for select to authenticated using (
    public.es_admin()
    -- Visible si la tarea es visible para el usuario (hereda la RLS de `tareas`).
    or exists (select 1 from public.tareas t where t.id = tarea_id)
  );

-- ── Trigger: registra los cambios de estado/prioridad/asignación/vencimiento/cupo ──
-- Diffea vía to_jsonb(new/old). Solo escribe si el campo cambió, así que tocar otras
-- columnas (p. ej. ultimo_aviso_venc o actualizado_en) no genera ruido. Guarda los
-- valores crudos (uuid en asignación, ISO en vencimiento); la app los formatea/resuelve.
create or replace function public.auditar_cambio_tarea()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_actor uuid := auth.uid();
  v_campos constant text[] := array[
    'estado|Estado',
    'prioridad|Prioridad',
    'asignado_a|Asignación',
    'vence_en|Vencimiento',
    'cupo|Cupo'
  ];
  v_item text; v_parts text[]; v_col text; v_lbl text; v_ant text; v_nue text;
begin
  foreach v_item in array v_campos loop
    v_parts := string_to_array(v_item, '|');
    v_col := v_parts[1]; v_lbl := v_parts[2];
    v_ant := v_old ->> v_col;
    v_nue := v_new ->> v_col;
    if v_ant is distinct from v_nue then
      insert into public.tarea_historial_cambios (tarea_id, campo, valor_anterior, valor_nuevo, actor_id)
      values (new.id, v_lbl, v_ant, v_nue, v_actor);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_auditar_cambio_tarea on public.tareas;
create trigger trg_auditar_cambio_tarea
  after update on public.tareas
  for each row execute function public.auditar_cambio_tarea();

comment on table public.tarea_historial_cambios is
  'Historial append-only de cambios de una tarea (estado/prioridad/asignación/vencimiento/cupo): valor anterior → nuevo, quién y cuándo. Lo escribe solo el trigger; la lectura hereda la visibilidad de la tarea.';
